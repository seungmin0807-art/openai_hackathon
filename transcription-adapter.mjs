import {RequestError} from './voice-policy.mjs';
import {isLegacyPromptEcho} from './public/transcript-policy.js';

export function transcriptionModelFor(value) {
  const requested = typeof value === 'string' ? value.trim() : '';
  return ['gpt-4o-mini-transcribe', 'gpt-4o-transcribe'].includes(requested) ? requested : 'gpt-4o-mini-transcribe';
}

// Never manufacture confidence or infer understanding from transcription.
export function normalizeTranscription(result) {
  if (!result || typeof result.text !== 'string')
    throw new RequestError(502, 'INVALID_TRANSCRIPTION', '녹음 내용을 읽지 못했어요.');
  const text = result.text.trim();
  if (text.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text))
    throw new RequestError(502, 'INVALID_TRANSCRIPTION', '말이 너무 길거나 또렷하게 읽히지 않았어요. 짧게 다시 말해 주세요.');
  if (isLegacyPromptEcho(text)) return {text: '', status: 'rejected', reason: 'prompt_echo'};
  return {text, status: text ? 'transcribed' : 'no_speech'};
}

// Only confidently identify digital silence in supported PCM WAVs. Unknown
// encodings (including browser WebM) remain protected by client VAD instead.
export function isDigitalSilenceWav(audio) {
  const bytes = Buffer.from(audio);
  if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') return false;
  let format, channels, bits, data;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(offset + 4), end = offset + 8 + size;
    if (end > bytes.length) return false;
    const name = bytes.toString('ascii', offset, offset + 4);
    if (name === 'fmt ' && size >= 16) { format = bytes.readUInt16LE(offset + 8); channels = bytes.readUInt16LE(offset + 10); bits = bytes.readUInt16LE(offset + 22); }
    if (name === 'data') data = bytes.subarray(offset + 8, end);
    offset = end + size % 2;
  }
  if (format !== 1 || !channels || bits !== 16 || !data?.length || data.length % (channels * 2)) return false;
  for (let offset = 0; offset < data.length; offset += 2) if (Math.abs(data.readInt16LE(offset)) > 1) return false;
  return true;
}

export async function transcribeAudio({audio, type, model, key, fetchImpl = fetch, signal, timeoutMs = 45000}) {
  signal?.throwIfAborted();
  if ((type === 'audio/wav' || type === 'audio/x-wav') && isDigitalSilenceWav(audio))
    return {text: '', status: 'no_speech', reason: 'digital_silence'};
  const form = new FormData();
  form.append('file', new Blob([audio], {type}), type === 'audio/webm' ? 'voice.webm' : 'voice.wav');
  form.append('model', transcriptionModelFor(model));
  form.append('language', 'ko');
  form.append('response_format', 'json');
  // language=ko is sufficient. Do not seed the recognizer with a sentence it
  // can copy into a supposed child utterance during silence/noise.
  const deadline = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  requestSignal.throwIfAborted();
  const response = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: {Authorization: `Bearer ${key}`}, body: form, signal: requestSignal});
  requestSignal.throwIfAborted();
  if (!response.ok) throw new RequestError(502, 'TRANSCRIPTION_UPSTREAM_ERROR', '녹음을 글로 바꾸지 못했어요. 글로 직접 입력해 주세요.');
  let result;
  try { result = await response.json(); }
  catch (error) {
    requestSignal.throwIfAborted();
    throw new RequestError(502, 'INVALID_TRANSCRIPTION', '녹음 내용을 읽지 못했어요.');
  }
  requestSignal.throwIfAborted();
  return normalizeTranscription(result);
}
