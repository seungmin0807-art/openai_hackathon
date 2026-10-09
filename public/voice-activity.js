// Energy-based segmentation, not a learned speech/noise classifier.
// Capture begins before onset so the recorder retains initial consonants.
export const VOICE_LIMITS = Object.freeze({checkMs: 60, silenceMs: 1200,
  maxSpeechMs: 20000, idleMs: 20000, minVoiceMs: 120, echoTailMs: 300});

export class VoiceActivity {
  constructor(start, limits = VOICE_LIMITS) {
    this.limits = limits;
    this.start = this.previous = this.lastSpeech = start;
    this.onset = null;
    this.candidateStart = null;
    this.candidateMs = this.voiceMs = 0;
    this.noiseFloor = .004;
    this.heardVoice = false;
    this.endReason = null;
  }

  update(rms, now) {
    if (this.endReason) return this.endReason;
    if (!Number.isFinite(rms) || rms < 0 || !Number.isFinite(now) || now < this.previous)
      throw new Error('Invalid microphone sample');
    const elapsed = Math.min(this.limits.checkMs * 2, now - this.previous);
    // Freeze the noise estimate during an onset candidate to avoid absorbing
    // a soft syllable into the floor. Keep hysteresis relative to that floor.
    const threshold = Math.max(this.heardVoice ? .009 : .014,
      this.noiseFloor * (this.heardVoice ? 1.7 : 2.8));
    if (rms >= threshold) {
      if (this.candidateStart === null) this.candidateStart = this.previous;
      this.candidateMs += elapsed;
      if (!this.heardVoice && this.candidateMs >= this.limits.minVoiceMs) {
        this.heardVoice = true;
        this.onset = this.candidateStart;
        this.voiceMs = this.candidateMs;
      } else if (this.heardVoice) this.voiceMs += elapsed;
      this.lastSpeech = now;
    } else {
      this.candidateMs = 0;
      this.candidateStart = null;
      if (!this.heardVoice) this.noiseFloor = this.noiseFloor * .96 + rms * .04;
    }
    this.previous = now;
    if (this.heardVoice && now - this.lastSpeech >= this.limits.silenceMs) this.endReason = 'silence';
    else if (this.heardVoice && now - this.onset >= this.limits.maxSpeechMs) this.endReason = 'max-duration';
    else if (!this.heardVoice && this.candidateStart === null && now - this.start >= this.limits.idleMs) this.endReason = 'idle';
    return this.endReason;
  }

  metadata(now) {
    return Object.freeze({endReason: this.endReason, truncated: this.endReason === 'max-duration',
      voiceMs: Math.round(this.voiceMs), speechMs: this.onset === null ? 0 : Math.round(this.lastSpeech - this.onset),
      captureMs: Math.round(now - this.start)});
  }
}
