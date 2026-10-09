"""Loopback-only Korean Supertonic 3 service; fixed preset voices, CPU inference."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
import json
from pathlib import Path
import threading
import time
from urllib.parse import urlparse

import numpy as np
import soundfile as sf
from runtime import TunedTTS, AudioCache

ROOT = Path(__file__).resolve().parent
DEFAULT_VOICE = 'F4'
SAMPLE = '안녕! 나는 모리야. 궁금한 게 있다고? 좋아, 내 호기심 안테나가 삐빅! 우리 같이 알아보자!'


class MoriVoice:
    def __init__(self, threads=4, spinning=False, voice=DEFAULT_VOICE, steps=10):
        started = time.perf_counter()
        self.threads, self.spinning = threads, spinning
        self.default_voice, self.steps = voice, steps
        self.tts = TunedTTS(model_dir=ROOT / 'models', threads=threads, spinning=spinning)
        self.styles = {name: self.tts.get_voice_style(name) for name in self.tts.voice_style_names}
        self.lock = threading.Lock()
        self.stats_lock = threading.Lock()
        self.cache = AudioCache()
        self.waiting, self.completed, self.cache_hits = 0, 0, 0
        self.initialization_seconds = time.perf_counter() - started

    def synthesize(self, text, voice=None):
        voice = self.default_voice if voice is None else voice
        if not isinstance(text, str) or not 1 <= len(text.strip()) <= 600:
            raise ValueError('text must be a nonempty string of at most 600 characters')
        if not isinstance(voice, str) or voice not in self.styles:
            raise ValueError('voice must be one of ' + ', '.join(sorted(self.styles)))
        text = text.strip()
        requested = time.perf_counter()
        with self.stats_lock:
            self.waiting += 1
        with self.lock:
            with self.stats_lock:
                self.waiting -= 1
            started = time.perf_counter()
            queue_seconds = round(started-requested, 3)
            key = self.cache.key(text, voice, self.steps)
            cached = self.cache.get(key)
            if cached:
                audio, info = cached
                info.update(generation_seconds=0.0, queue_seconds=queue_seconds, cache_hit=True)
                with self.stats_lock:
                    self.completed += 1
                    self.cache_hits += 1
                return audio, info
            waveform, _ = self.tts.synthesize(text=text, lang='ko',
                voice_style=self.styles[voice], total_steps=self.steps, speed=1.05,
                max_chunk_length=100, silence_duration=.32, verbose=False)
            waveform = np.asarray(waveform, dtype=np.float32).reshape(-1)
            if not len(waveform) or not np.isfinite(waveform).all():
                raise RuntimeError('Model produced invalid audio')
            # Small head/tail fades avoid clicks, without changing pitch or voice identity.
            fade = min(int(self.tts.sample_rate * .012), len(waveform) // 2)
            if fade:
                waveform[:fade] *= np.linspace(0, 1, fade)
                waveform[-fade:] *= np.linspace(1, 0, fade)
            output = BytesIO()
            sf.write(output, waveform, self.tts.sample_rate, format='WAV', subtype='PCM_16')
            audio = output.getvalue()
            info = {
                'voice': voice, 'language': 'ko', 'sample_rate': self.tts.sample_rate,
                'duration_seconds': round(len(waveform) / self.tts.sample_rate, 3),
                'generation_seconds': round(time.perf_counter() - started, 3),
                'speed': 1.05, 'steps': self.steps,
                'queue_seconds': queue_seconds, 'cache_hit': False,
            }
            self.cache.put(key, audio, info)
            with self.stats_lock:
                self.completed += 1
            return audio, info


def make_handler(engine):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # Do not store spoken text or patient content in access logs.

        def allowed_origin(self):
            origin = self.headers.get('Origin')
            if not origin:
                return True
            parsed = urlparse(origin)
            return parsed.scheme == 'http' and parsed.hostname in ('127.0.0.1', 'localhost', '::1')

        def reply(self, code, data, content_type='application/json', headers=None):
            self.send_response(code)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            origin = self.headers.get('Origin')
            if origin and self.allowed_origin():
                self.send_header('Access-Control-Allow-Origin', origin)
                self.send_header('Vary', 'Origin')
                self.send_header('Access-Control-Expose-Headers', 'X-Audio-Duration, X-Generation-Seconds, X-Sample-Rate, X-Voice, X-Queue-Seconds, X-Cache-Hit')
            for key, value in (headers or {}).items():
                self.send_header(key, str(value))
            self.end_headers()
            self.wfile.write(data)

        def error(self, status, message):
            self.reply(status, json.dumps({'error': message}).encode())

        def do_OPTIONS(self):
            if not self.allowed_origin():
                return self.error(403, 'Only a local application may access this service')
            self.reply(204, b'', headers={
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            })

        def do_GET(self):
            if not self.allowed_origin():
                return self.error(403, 'Only a local application may access this service')
            if self.path != '/health':
                return self.error(404, 'Not found')
            self.reply(200, json.dumps({
                'status': 'ready', 'engine': 'supertonic-3', 'runtime': 'onnx-cpu',
                'language': 'ko', 'default_voice': engine.default_voice,
                'voices': sorted(engine.styles), 'sample_rate': engine.tts.sample_rate,
                'initialization_seconds': round(engine.initialization_seconds, 3),
                'weights_license': 'OpenRAIL-M', 'code_license': 'MIT',
                'intra_op_threads': engine.threads, 'inter_op_threads': 1,
                'sessions': 4, 'spinning': engine.spinning, 'steps': engine.steps, 'speed': 1.05,
                'max_chunk_length': 100, 'serial_synthesis': True,
                'generating': engine.lock.locked(), 'queued_requests': engine.waiting,
                'completed_requests': engine.completed, 'cache_hits': engine.cache_hits,
                'cache_policy': 'memory-only; 16MiB; 32 entries; 300 seconds; hashed keys',
            }).encode())

        def do_POST(self):
            if not self.allowed_origin():
                return self.error(403, 'Only a local application may access this service')
            if self.path != '/tts':
                return self.error(404, 'Not found')
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 8192:
                    return self.error(413, 'Invalid request size')
                if self.headers.get_content_type() != 'application/json':
                    return self.error(415, 'Expected application/json')
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict):
                    raise ValueError('Expected a JSON object')
                audio, info = engine.synthesize(payload.get('text'), payload.get('voice', engine.default_voice))
            except (ValueError, UnicodeDecodeError) as error:
                return self.error(400, str(error))
            except Exception as error:
                print('TTS generation failed:', type(error).__name__, flush=True)
                return self.error(500, 'TTS generation failed')
            self.reply(200, audio, 'audio/wav', {
                'X-Audio-Duration': info['duration_seconds'],
                'X-Generation-Seconds': info['generation_seconds'],
                'X-Sample-Rate': info['sample_rate'], 'X-Voice': info['voice'],
                'X-Queue-Seconds': info['queue_seconds'], 'X-Cache-Hit': str(info['cache_hit']).lower(),
            })
    return Handler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8011)
    parser.add_argument('--sample', action='store_true', help='Write sample-ko.wav then exit')
    parser.add_argument('--threads', type=int, choices=range(1, 9), default=4)
    parser.add_argument('--spinning', action='store_true', help='Enable ONNX worker busy-waiting (comparison only)')
    parser.add_argument('--voice', choices=[f'{gender}{index}' for gender in 'FM' for index in range(1, 6)], default=DEFAULT_VOICE)
    parser.add_argument('--steps', type=int, choices=range(5, 11), default=10, help='10 preserves original quality; 5/6 are audition options')
    args = parser.parse_args()
    engine = MoriVoice(threads=args.threads, spinning=args.spinning, voice=args.voice, steps=args.steps)
    if args.sample:
        wav, info = engine.synthesize(SAMPLE)
        (ROOT / 'sample-ko.wav').write_bytes(wav)
        info['initialization_seconds'] = round(engine.initialization_seconds, 3)
        (ROOT / 'sample-ko.json').write_text(json.dumps(info, indent=2), encoding='utf-8')
        print(json.dumps(info), flush=True)
        alternate, alternate_info = engine.synthesize(SAMPLE, 'F1')
        (ROOT / 'sample-ko-F1.wav').write_bytes(alternate)
        (ROOT / 'sample-ko-F1.json').write_text(json.dumps(alternate_info, indent=2), encoding='utf-8')
        print(json.dumps(alternate_info), flush=True)
        return
    server = ThreadingHTTPServer(('127.0.0.1', args.port), make_handler(engine))
    server.daemon_threads = True
    print(f'Mori Korean voice ready: http://127.0.0.1:{args.port} (Supertonic 3 CPU, {engine.default_voice}, {engine.steps} steps)', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()


if __name__ == '__main__':
    main()
