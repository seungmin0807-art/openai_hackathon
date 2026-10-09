const STATES = {
  idle: '말하고 싶으면 눌러줘',
  listening: '듣고 있어!',
  recording: '듣고 있어!',
  processing: '잠깐만, 생각 중!',
  thinking: '잠깐만, 생각 중!',
  speaking: '토리가 말하는 중!',
  muted: '말하고 싶으면 눌러줘',
  unavailable: '음성을 준비하고 있어',
};

/** A separate conversation caption. This never reads or changes the game goal. */
export class VoiceDialogue {
  constructor({ mount = document.body, onToggle = () => {}, enabled = false,
    portrait = '/assets/clinic/patient-portrait.png' } = {}) {
    this.onToggle = onToggle;
    this.enabled = Boolean(enabled);
    this.mode = 'idle';
    this.question = '';
    this.reply = '';
    this.pending = false;
    this.busy = false;
    this._replyTimer = null;
    this._replyEpoch = 0;
    if (!document.querySelector('link[data-voice-dialogue-style]')) {
      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = new URL('./voice-dialogue.css', import.meta.url).href;
      style.dataset.voiceDialogueStyle = '';
      document.head.append(style);
    }

    this.element = document.createElement('section');
    this.element.className = 'voice-dialogue';
    this.element.setAttribute('aria-label', '토리와 이야기');
    this.bubble = document.createElement('div');
    this.bubble.className = 'voice-dialogue-bubble';
    this.bubble.hidden = true;
    const image = document.createElement('img');
    image.className = 'voice-dialogue-portrait';
    image.src = portrait;
    image.alt = '';
    const heading = document.createElement('strong');
    heading.className = 'voice-dialogue-heading';
    heading.textContent = '토리의 대답';
    this.questionElement = document.createElement('p');
    this.questionElement.className = 'voice-dialogue-question';
    this.questionElement.hidden = true;
    this.replyElement = document.createElement('p');
    this.replyElement.className = 'voice-dialogue-reply';
    this.replyElement.setAttribute('role', 'status');
    this.replyElement.setAttribute('aria-live', 'polite');
    this.replyElement.setAttribute('aria-atomic', 'true');
    this.bubble.append(image, heading, this.questionElement, this.replyElement);

    const controls = document.createElement('div');
    controls.className = 'voice-dialogue-controls';
    this.toggle = document.createElement('button');
    this.toggle.type = 'button';
    this.toggle.className = 'voice-dialogue-toggle';
    this.toggle.addEventListener('click', () => {
      this.onToggle(!this.enabled);
    });
    this.stateElement = document.createElement('span');
    this.stateElement.className = 'voice-dialogue-status';
    controls.append(this.toggle, this.stateElement);
    this.element.append(this.bubble, controls);
    mount.append(this.element);
    this.setEnabled(this.enabled);
    this.setState(this.enabled ? 'idle' : 'muted');
  }

  setState(mode, shortStatus) {
    if (mode === 'recording' || mode === 'listening') this.cancelReplyHide();
    this.mode = mode;
    this.element.dataset.mode = mode;
    const text = shortStatus ?? STATES[mode] ?? STATES.idle;
    if (this.stateElement.textContent !== text) this.stateElement.textContent = text;
    if (mode === 'processing' || mode === 'thinking') this.setBusy(true);
    else if (mode !== 'speaking') this.setBusy(false);
    if (mode === 'processing' || mode === 'thinking') this.showPending();
    else if (mode === 'muted' || mode === 'unavailable') {
      this.pending = false;
      if (!this.reply) this.clearReply();
      else this.updateVisibility();
    }
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    if (this.enabled) this.cancelReplyHide();
    this.element.dataset.enabled = String(this.enabled);
    this.toggle.textContent = this.enabled ? '답변해줘 토리야!' : '토리에게 말하기';
    this.toggle.setAttribute('aria-pressed', String(this.enabled));
    this.toggle.setAttribute('aria-label', this.enabled ? '답변해줘 토리야!' : '토리에게 말하기');
    if (!this.enabled) this.setState('muted');
    else if (this.mode === 'muted') this.setState('idle');
  }

  showQuestion(text) {
    this.cancelReplyHide();
    this.question = String(text ?? '').trim();
    this.questionElement.textContent = this.question;
    this.questionElement.hidden = !this.question;
    this.updateVisibility();
  }

  showReply(text) {
    this.cancelReplyHide();
    this.pending = false;
    this.reply = String(text ?? '').trim();
    this.replyElement.textContent = this.reply;
    this.replyElement.scrollTop = 0;
    this.updateVisibility();
  }

  clearReply({ clearQuestion = true } = {}) {
    this.cancelReplyHide();
    this.pending = false;
    this.reply = '';
    this.replyElement.textContent = '';
    if (clearQuestion) this.showQuestion('');
    this.updateVisibility();
  }

  showPending() {
    this.cancelReplyHide();
    this.pending = true;
    this.reply = '';
    this.updateVisibility();
  }

  setBusy(value) {
    this.busy = Boolean(value);
    this.toggle.disabled = this.busy;
    this.toggle.setAttribute('aria-busy', String(this.busy));
  }

  finishReply(delay = 5000) {
    this.cancelReplyHide();
    const milliseconds = Number.isFinite(delay) ? Math.max(0, delay) : 5000;
    const epoch = this._replyEpoch;
    this._replyTimer = setTimeout(() => {
      if (epoch !== this._replyEpoch || this.enabled) return;
      this._replyTimer = null;
      this.clearReply();
    }, milliseconds);
  }

  cancelReplyHide() {
    this._replyEpoch = (this._replyEpoch ?? 0) + 1;
    clearTimeout(this._replyTimer);
    this._replyTimer = null;
  }

  updateVisibility() {
    this.bubble.hidden = !this.reply && !this.question && !this.pending;
    this.replyElement.hidden = !this.reply && !this.pending;
    this.replyElement.textContent = this.pending ? '토리가 답변 대기 중…' : this.reply;
    this.element.dataset.pending = String(this.pending);
  }

  get snapshot() {
    return { enabled: this.enabled, busy: this.busy, mode: this.mode, pending: this.pending, question: this.question,
      reply: this.reply, visible: !this.bubble.hidden };
  }

  destroy() {
    this.cancelReplyHide();
    this.pending = false;
    this.element.remove();
    this.onToggle = () => {};
  }
}

export default VoiceDialogue;
