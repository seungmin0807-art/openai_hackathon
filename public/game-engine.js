// Session events are an in-memory integration contract for a future clinician view.
export class ProcedureGame {
  constructor(procedures, onChange, onEvent = () => {}) {
    this.procedures = procedures; this.onChange = onChange; this.onEvent = onEvent;
    this.events = []; this.startedAt = Date.now(); this.sequence = 0;
    this.state = { procedure: procedures[0], phase: 'play', paused: false, understanding: null };
  }
  record(type, detail = {}) {
    const event = { schemaVersion: 1, sequence: ++this.sequence, elapsedMs: Date.now() - this.startedAt, procedureId: this.state.procedure.id, phase: this.state.phase, type, ...detail };
    this.events.push(event); this.onEvent(event);
  }
  emit() { this.onChange({ ...this.state }); }
  select(id) {
    const procedure = this.procedures.find(p => p.id === id); if (!procedure) return;
    this.state = { procedure, phase: 'play', paused: false, understanding: null };
    this.record('procedure_selected'); this.emit();
  }
  act(input = 'button') { if (this.state.paused || this.state.phase !== 'play') return; this.record('action', { input }); this.state.phase = 'result'; this.emit(); }
  check() { if (this.state.paused || this.state.phase !== 'result') return; this.state.phase = 'check'; this.record('check_offered'); this.emit(); }
  answer(signal, input = 'choice') {
    if (this.state.paused || this.state.phase !== 'check' || !['understood', 'revisit', 'unclear', 'skipped'].includes(signal)) return;
    this.state.understanding = { signal, input, confidence: 'unvalidated' };
    this.record('understanding_response', this.state.understanding);
    this.state.phase = signal === 'revisit' || signal === 'unclear' ? 'result' : 'done'; this.emit();
  }
  pause() { this.state.paused = !this.state.paused; this.record(this.state.paused ? 'paused' : 'resumed'); this.emit(); }
  facialCue(cue) { this.record('facial_cue', { cue, interpretation: 'none' }); }
  replay() { this.state.phase = 'play'; this.state.paused = false; this.state.understanding = null; this.record('replayed'); this.emit(); }
  summary() { return { schemaVersion: 1, purpose: 'education-prototype', assessmentValidated: false, events: this.events.map(e => ({ ...e })) }; }
}
