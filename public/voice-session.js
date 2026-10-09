import {VoiceActivity, VOICE_LIMITS} from './voice-activity.js';

// This module owns microphone capture only. The caller owns consent, ASR,
// responses and playback; its complete Promise is the speaker echo barrier.
export class VoiceSession {
  constructor({onUtterance = async () => {}, onState = () => {}, onError = () => {},
    echoTailMs = VOICE_LIMITS.echoTailMs, manualMode = false,
    maxRecordingMs = 20000, maxAudioBytes = 4.75 * 1024 * 1024} = {}) {
    this.onUtterance = onUtterance;
    this.onState = onState;
    this.onError = onError;
    this._epoch = 0;
    this._active = false;
    this._starting = false;
    this._suspended = false;
    this._processing = false;
    this._capture = null;
    this._inFlight = null;
    this._startPromise = null;
    this._sequence = 0;
    this._turnEpoch = 0;
    this._echoTailMs = Number.isFinite(echoTailMs) ? Math.max(0, Math.min(2000, echoTailMs)) : VOICE_LIMITS.echoTailMs;
    this._listenAfter = 0;
    this._resumeTimer = null;
    this._queuedUtterance = null;
    this.manualMode = manualMode === true;
    this._maxRecordingMs = Number.isFinite(maxRecordingMs) ? Math.max(1000, Math.min(60000, maxRecordingMs)) : 20000;
    this._maxAudioBytes = Number.isFinite(maxAudioBytes) ? Math.max(1024, Math.min(4.75 * 1024 * 1024, maxAudioBytes)) : 4.75 * 1024 * 1024;
    this._manualReady = null;
    this._manualSubmitPromise = null;
  }

  get active() { return this._active; }
  get snapshot() {
    return Object.freeze({active: this._active, starting: this._starting,
      recording: !!(this._capture?.recorder.state === 'recording'),
      suspended: this._suspended, processing: this._processing,
      ...(this.manualMode ? {manual: true, ready: !!this._manualReady,
        limited: !!this._manualReady?.capture.limited} : {})});
  }

  start() {
    if (this.manualMode && (this._manualSubmitPromise || this._inFlight)) return Promise.resolve(false);
    if (this._active) return Promise.resolve(true);
    if (this._startPromise) return this._startPromise;
    const epoch = ++this._epoch;
    this._starting = true;
    this._suspended = false;
    if (this.manualMode) this._state('starting', '마이크를 연결하고 있어요.');
    const promise = this._open(epoch).finally(() => {
      if (this._startPromise === promise) this._startPromise = null;
      if (epoch === this._epoch) {
        this._starting = false;
        if (this._active && !this._inFlight && !this._capture) this._beginCapture();
      }
    });
    this._startPromise = promise;
    return promise;
  }

  async _open(epoch) {
    let stream, context;
    try {
      if (!globalThis.navigator?.mediaDevices?.getUserMedia || !globalThis.MediaRecorder)
        throw new Error('이 브라우저에서는 마이크 녹음을 사용할 수 없어요.');
      stream = await navigator.mediaDevices.getUserMedia({audio: {
        echoCancellation: true, noiseSuppression: true, autoGainControl: true}});
      if (epoch !== this._epoch) { this._stopTracks(stream); return false; }
      this._stream = stream;
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) throw new Error('이 브라우저에서 소리를 살펴볼 수 없어요.');
      context = new Context();
      this._context = context;
      await context.resume();
      if (epoch !== this._epoch) {
        this._stopTracks(stream); this._closeContext(context); return false;
      }
      this._source = context.createMediaStreamSource(stream);
      this._analyser = context.createAnalyser();
      this._analyser.fftSize = 1024;
      this._samples = new Uint8Array(this._analyser.fftSize);
      this._source.connect(this._analyser);
      this._active = true;
      this._processing = !!this._inFlight;
      for (const track of stream.getTracks()) track.addEventListener?.('ended', () => {
        if (epoch !== this._epoch || !this._active) return;
        this.stop(); this._report(new Error('마이크 연결이 끝났어요. 다시 연결해 주세요.'));
      }, {once: true});
      if (this._suspended) { this._state('muted', '잠시 듣기를 쉬어요.'); return true; }
      if (this._inFlight) { this._state('processing', '토리가 답변 대기 중…'); return true; }
      return this._beginCapture();
    } catch (error) {
      this._stopTracks(stream); this._closeContext(context);
      if (epoch === this._epoch) { this.stop(); this._report(error); }
      return false;
    }
  }

  stop() {
    ++this._epoch;
    this.cancelPending();
    this._active = false;
    this._starting = false;
    this._suspended = false;
    this._processing = false;
    this._startPromise = null;
    this._discardCapture();
    this._stopTracks(this._stream);
    this._closeContext(this._context);
    try { this._source?.disconnect(); } catch {}
    this._stream = this._context = this._source = this._analyser = this._samples = null;
    this._state('muted', '마이크가 꺼졌어요.');
  }

  cancel() { this.stop(); }

  submit() {
    if (!this.manualMode) return Promise.resolve({status: 'not_recording'});
    if (this._manualSubmitPromise) return this._manualSubmitPromise;
    const promise = this._submitManual().finally(() => {
      if (this._manualSubmitPromise === promise) this._manualSubmitPromise = null;
    });
    this._manualSubmitPromise = promise;
    return promise;
  }

  async _submitManual() {
    const epoch = this._epoch;
    const capture = this._capture;
    if (!capture && !this._manualReady) return {status: 'not_recording'};
    if (capture) {
      capture.submitRequested = true;
      capture.endReason ??= 'manual-submit';
      this._finishCapture(capture);
      await capture.finished;
    }
    if (epoch !== this._epoch || !this._active) return {status: 'cancelled'};
    const ready = this._manualReady;
    this._manualReady = null;
    if (!ready) return {status: 'cancelled'};
    if (ready.capture.tooLarge) {
      this._active = false;
      this._state('unavailable', '녹음이 너무 커요. 짧게 다시 말해 주세요.');
      return {status: 'audio_too_large'};
    }
    if (!ready.capture.activity.heardVoice || !ready.blob.size) {
      this._active = false;
      this._state('no_speech', '목소리가 잘 안 들렸어. 다시 말해 줄래?');
      return {status: 'no_speech'};
    }
    await this._dispatchUtterance(ready.capture, ready.blob);
    return {status: epoch === this._epoch ? 'submitted' : 'cancelled'};
  }

  // Only the capture/ASR signal is cancelled. A caller that already accepted
  // the question must allow its answer/playback to finish on microphone off.
  // Screen changes additionally invalidate the caller's flow and output.
  cancelPending() {
    ++this._turnEpoch;
    this._inFlight?.controller.abort();
    this._queuedUtterance = null;
    this._manualReady = null;
    clearTimeout(this._resumeTimer);
    this._resumeTimer = null;
    this._discardCapture();
  }

  suspend() {
    if (this.manualMode) return;
    this._suspended = true;
    clearTimeout(this._resumeTimer);
    this._resumeTimer = null;
    this._discardCapture();
    this._state('muted', '잠시 듣기를 쉬어요.');
  }

  resume() {
    if (this.manualMode) return;
    if (this._suspended) this._listenAfter = performance.now() + this._echoTailMs;
    this._suspended = false;
    if (!this._active) return;
    if (this._queuedUtterance && !this._inFlight) {
      const queued = this._queuedUtterance;
      this._queuedUtterance = null;
      void this._dispatchUtterance(queued.capture, queued.blob);
      return;
    }
    if (this._processing && !this._inFlight?.inputReleased) this._state('processing', '토리가 답변 대기 중…');
    else if (!this._capture) this._beginCapture();
  }

  // Call only once ASR text has been accepted, before awaiting AI/TTS. Capture
  // may continue while output is prepared; one completed question is queued.
  // Its callback is dispatched only after the prior reply/playback settles.
  // The caller still suspends during actual speaker playing to reject echo.
  releaseInput() {
    if (this.manualMode) return;
    if (!this._inFlight || this._inFlight.controller.signal.aborted) return;
    this._inFlight.inputReleased = true;
    if (this._active && !this._suspended) this._beginCapture();
  }

  _beginCapture() {
    if (!this._active || this._suspended || this._manualReady || this._queuedUtterance ||
      this._inFlight && !this._inFlight.inputReleased || this._capture) return false;
    const remaining = this.manualMode ? 0 : this._listenAfter - performance.now();
    if (remaining > 0) {
      if (!this._resumeTimer) this._resumeTimer = setTimeout(() => {
        this._resumeTimer = null;
        this._beginCapture();
      }, remaining);
      return true;
    }
    try {
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm']
        .find(type => MediaRecorder.isTypeSupported?.(type));
      if (!mimeType) throw new Error('이 브라우저는 WebM 음성 녹음을 지원하지 않아요. Chrome이나 Edge에서 연결해 주세요.');
      const recorder = new MediaRecorder(this._stream, {mimeType});
      const now = performance.now();
      const capture = {recorder, epoch: this._epoch, chunks: [], start: now, bytes: 0,
        activity: new VoiceActivity(now), finishing: false, discard: false};
      if (this.manualMode) capture.finished = new Promise(resolve => { capture.resolveFinished = resolve; });
      this._capture = capture;
      recorder.ondataavailable = event => {
        if (!capture.discard && event.data?.size) {
          capture.bytes += event.data.size;
          if (this.manualMode && capture.bytes > this._maxAudioBytes) {
            capture.tooLarge = capture.limited = true;
            capture.endReason = 'size-limit';
            capture.chunks.length = 0;
            this._finishCapture(capture);
          } else if (!capture.tooLarge) capture.chunks.push(event.data);
        }
      };
      recorder.onstop = () => { void this._captureEnded(capture); };
      recorder.onerror = event => {
        if (this._capture !== capture || capture.epoch !== this._epoch) return;
        this._discardCapture(); this._report(event.error || new Error('녹음이 잠시 멈췄어요.'));
        if (this.manualMode) this.stop();
        else if (this._active && !this._suspended) this._beginCapture();
      };
      recorder.start(200);
      capture.timer = setInterval(() => this._checkVoice(capture), VOICE_LIMITS.checkMs);
      this._state(this.manualMode ? 'recording' : 'listening', '듣고 있어요.');
      return true;
    } catch (error) { this.stop(); this._report(error); return false; }
  }

  _checkVoice(capture) {
    if (this._capture !== capture || capture.finishing || capture.epoch !== this._epoch) return;
    try {
      this._analyser.getByteTimeDomainData(this._samples);
      let power = 0;
      for (const value of this._samples) power += ((value - 128) / 128) ** 2;
      const rms = Math.sqrt(power / this._samples.length), now = performance.now();
      const previouslyHeard = capture.activity.heardVoice;
      if (this.manualMode) capture.activity.endReason = null;
      const endReason = capture.activity.update(rms, now);
      if (!this.manualMode && !previouslyHeard && capture.activity.heardVoice) this._state('recording', '듣고 있어!');
      if (this.manualMode && now - capture.start >= this._maxRecordingMs) {
        capture.limited = true;
        capture.endReason = 'recording-limit';
        this._finishCapture(capture);
      } else if (!this.manualMode && endReason && this._capture === capture) this._finishCapture(capture);
    } catch (error) { this._discardCapture(); this._report(error); this.stop(); }
  }

  _finishCapture(capture) {
    if (capture.finishing) return;
    capture.finishing = true;
    capture.stoppedAt = performance.now();
    clearInterval(capture.timer);
    try { if (capture.recorder.state !== 'inactive') capture.recorder.stop(); }
    catch (error) { this._discardCapture(); this._report(error); this.stop(); }
  }

  _discardCapture() {
    const capture = this._capture;
    if (!capture) return;
    this._capture = null;
    capture.discard = true;
    clearInterval(capture.timer);
    capture.chunks.length = 0;
    capture.resolveFinished?.();
    try { if (capture.recorder.state !== 'inactive') capture.recorder.stop(); } catch {}
  }

  async _captureEnded(capture) {
    clearInterval(capture.timer);
    if (this._capture !== capture) return;
    this._capture = null;
    if (capture.discard || capture.epoch !== this._epoch || !this._active || this._suspended) return;
    const blob = new Blob(capture.chunks, {type: capture.recorder.mimeType || capture.chunks[0]?.type || 'audio/webm'});
    capture.chunks.length = 0;
    if (this.manualMode) {
      this._manualReady = {capture, blob: capture.tooLarge ? new Blob([]) : blob};
      this._releaseMicrophone();
      capture.resolveFinished?.();
      if (!capture.submitRequested)
        this._state('ready', capture.limited ? '녹음이 멈췄어. 답변 버튼을 눌러 줘!' : '답변 버튼을 눌러 줘!');
      return;
    }
    if (!capture.activity.heardVoice || !blob.size) {
      this._beginCapture(); return;
    }
    if (this._inFlight) {
      // No overlapping callbacks or unbounded question backlog. The complete
      // recorded question retains the capture epoch and is discarded on stop.
      this._queuedUtterance = {capture, blob};
      this._state('processing', '토리가 답변 대기 중…');
      return;
    }
    await this._dispatchUtterance(capture, blob);
  }

  async _dispatchUtterance(capture, blob) {
    if (capture.epoch !== this._epoch || !this._active || this._suspended) return;
    const turnEpoch = this._turnEpoch;
    const task = {controller: new AbortController()};
    const metadata = Object.freeze({...capture.activity.metadata(capture.stoppedAt ?? performance.now()),
      ...(this.manualMode ? {manual: true, limited: !!capture.limited, truncated: !!capture.limited,
        endReason: capture.endReason || 'manual-submit'} : {}),
      sequence: ++this._sequence, signal: task.controller.signal,
      isCurrent: () => !task.controller.signal.aborted && capture.epoch === this._epoch && turnEpoch === this._turnEpoch && this._active});
    this._inFlight = task;
    this._processing = true;
    this._state('processing', '토리가 답변 대기 중…');
    try { if (metadata.isCurrent() && !this._suspended) await this.onUtterance(blob, metadata); }
    catch (error) { if (metadata.isCurrent() && error?.name !== 'AbortError') this._report(error); }
    finally {
      if (this._inFlight === task) {
        this._inFlight = null;
        this._processing = false;
        if (this.manualMode && capture.epoch === this._epoch) {
          this._active = false;
          this._state('idle', '토리에게 말해 볼까?');
        } else if (!this.manualMode && this._active && !this._suspended && !this._starting) {
          const queued = this._queuedUtterance;
          this._queuedUtterance = null;
          if (queued) await this._dispatchUtterance(queued.capture, queued.blob);
          else this._beginCapture();
        }
      }
    }
  }

  _stopTracks(stream) { for (const track of stream?.getTracks?.() || []) { try { track.stop(); } catch {} } }
  _releaseMicrophone() {
    this._stopTracks(this._stream);
    this._closeContext(this._context);
    try { this._source?.disconnect(); } catch {}
    this._stream = this._context = this._source = this._analyser = this._samples = null;
  }
  _closeContext(context) { try { if (context && context.state !== 'closed') Promise.resolve(context.close()).catch(() => {}); } catch {} }
  _state(mode, text) { try { this.onState(mode, text); } catch (error) { this._report(error); } }
  _report(error) { try { this.onError(error instanceof Error ? error : new Error(String(error))); } catch {} }
}
