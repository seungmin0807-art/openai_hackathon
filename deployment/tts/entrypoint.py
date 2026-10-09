"""Authenticated server-to-server adapter for the existing local ONNX runtime."""
import os
from pathlib import Path
import secrets
import sys
import threading
from http.server import ThreadingHTTPServer

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'voice'))
from service import MoriVoice, make_handler


def make_cloud_handler(engine, token, max_inflight=4):
    base = make_handler(engine)
    slots = threading.BoundedSemaphore(max_inflight)

    class Handler(base):
        def do_POST(self):
            supplied = self.headers.get('Authorization', '')
            if not secrets.compare_digest(supplied.encode('utf-8'), ('Bearer ' + token).encode('utf-8')):
                return self.error(401, 'Unauthorized')
            if not slots.acquire(blocking=False):
                return self.reply(503, b'{"error":"Voice queue is full"}',
                                  headers={'Retry-After': '2'})
            try:
                self.connection.settimeout(20)
                return super().do_POST()
            finally:
                slots.release()

    return Handler


def main():
    token = os.environ.get('TTS_AUTH_TOKEN', '')
    if len(token) < 32:
        raise RuntimeError('TTS_AUTH_TOKEN must be a server-only secret of at least 32 characters')
    port = int(os.environ.get('PORT', '8080'))
    voice = os.environ.get('TTS_VOICE', 'F4')  # Temporary voice; no claim of childlike quality.
    threads = int(os.environ.get('TTS_THREADS', '2'))
    if voice not in [f'{gender}{index}' for gender in 'FM' for index in range(1, 6)] or not 1 <= threads <= 8:
        raise RuntimeError('Unsupported voice or CPU thread count')
    engine = MoriVoice(threads=threads, spinning=False, voice=voice, steps=10)
    server = ThreadingHTTPServer(('0.0.0.0', port), make_cloud_handler(engine, token))
    server.daemon_threads = True
    print(f'Korean ONNX voice ready on port {port}; authenticated synthesis', flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
