// Pure pointer logic: coordinates are tool contact positions, dt is ms, distance is frame travel.
const MECHANICS = new Set(['scan', 'listen', 'wipe-bandage', 'hover', 'pump', 'clip', 'sample', 'press']);
const DWELL_MS = 650;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const copy = value => JSON.parse(JSON.stringify(value));
const validPoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const length = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const near = (target, p) => validPoint(p) && length(target, p) <= target.r;
function validateTargets(targets) {
  if (!Array.isArray(targets) || !targets.length || targets.length > 20) throw new Error('대상을 한 개 이상 지정해 주세요.');
  const ids = new Set();
  for (const t of targets) {
    if (!t || typeof t.id !== 'string' || !t.id || ids.has(t.id) || !['x', 'y', 'r'].every(k => Number.isFinite(t[k])) || t.r <= 0) throw new Error('대상의 ID와 위치를 확인해 주세요.');
    ids.add(t.id);
  }
}
// The clipped segment measures actual motion inside a circle, including a full crossing between frames.
function circleSegment(a, b, target) {
  const dx = b.x - a.x, dy = b.y - a.y, ax = a.x - target.x, ay = a.y - target.y;
  const aa = dx * dx + dy * dy; if (aa < .000001) return null;
  const bb = 2 * (ax * dx + ay * dy), cc = ax * ax + ay * ay - target.r * target.r;
  const disc = bb * bb - 4 * aa * cc; if (disc <= 0) return null;
  const t0 = clamp((-bb - Math.sqrt(disc)) / (2 * aa), 0, 1), t1 = clamp((-bb + Math.sqrt(disc)) / (2 * aa), 0, 1);
  if (t1 <= t0) return null;
  return { start: { x: a.x + dx * t0, y: a.y + dy * t0 }, end: { x: a.x + dx * t1, y: a.y + dy * t1 }, fraction: t1 - t0 };
}
function crossesOppositeSides(a, b, target) {
  const ax = a.x - target.x, ay = a.y - target.y, bx = b.x - target.x, by = b.y - target.y;
  return (ax * bx + ay * by) / Math.max(.001, Math.hypot(ax, ay) * Math.hypot(bx, by)) <= -.25;
}

export class TouchSession {
  constructor(caseData, onEvent = () => {}) {
    if (!caseData || !MECHANICS.has(caseData.mechanic)) throw new Error('지원하는 터치 동작을 선택해 주세요.');
    validateTargets(caseData.targets);
    if (caseData.mechanic === 'pump' && caseData.targets.length !== 2) throw new Error('커프와 펌프 대상을 지정해 주세요.');
    if (caseData.mechanic === 'wipe-bandage' && caseData.targets.length !== 1) throw new Error('소독하고 밴드를 붙일 부위를 지정해 주세요.');
    const inspections = caseData.mechanic === 'sample' ? (caseData.expandedTargets ?? caseData.targets.slice(1)) : [];
    if (caseData.mechanic === 'sample') {
      validateTargets(inspections);
      if (inspections.some(t => t.id === caseData.targets[0].id)) throw new Error('샘플과 확대 관찰 대상의 ID를 다르게 지정해 주세요.');
    }
    this.caseData = copy(caseData); this.onEvent = onEvent;
    this.targets = this.caseData.targets;
    this.inspections = copy(inspections);
    this.stages = this.caseData.mechanic === 'wipe-bandage' ? ['wipe', 'observe', 'bandage'] : this.caseData.mechanic === 'pump' ? ['position', 'pump'] : this.caseData.mechanic === 'sample' ? ['sample', 'inspect'] : ['play'];
    this.reset();
  }
  reset() {
    this.stageIndex = 0; this.checked = new Set(); this.complete = false; this.paused = false; this.started = false; this.pumpCount = 0;
    this._clearGesture(); return this.snapshot();
  }
  get stage() { return this.stages[this.stageIndex]; }
  _clearGesture() {
    this.active = false; this.held = false; this.point = null; this.dwell = 0; this.dwellTarget = null; this.travel = 0;
    this.regionTravel = 0; this.crossings = 0; this.entry = null; this.pressReady = false;
  }
  setPaused(value) {
    this.paused = value === true;
    if (this.paused) this._clearGesture();
    return this.snapshot();
  }
  begin() {
    if (this.complete || this.paused || this.active) return this.snapshot();
    this._clearGesture(); this.active = true;
    if (!this.started) { this.started = true; this._event('stage', this._currentTarget()); }
    return this.snapshot();
  }
  cancel() { this._clearGesture(); return this.snapshot(); }
  _activeTargets() { return this.stage === 'inspect' ? this.inspections : this.targets; }
  _currentTarget() {
    if (this.stage === 'pump') return this.targets[1];
    if (['wipe', 'observe', 'bandage', 'position', 'sample'].includes(this.stage)) return this.targets[0];
    return this._activeTargets().find(t => !this.checked.has(t.id)) || null;
  }
  _event(type, target = null) {
    const state = this.snapshot();
    this.onEvent({ type, targetId: target?.id ?? null, target: target ? copy(target) : null, label: target?.label || target?.name || target?.id || '체험 완료', result: target?.result ?? null, progress: state.progress, stage: state.stage });
  }
  _check(target) {
    if (!target || this.checked.has(target.id) || this.paused || this.complete) return false;
    this.checked.add(target.id); this._event('check', target); return true;
  }
  _advance() {
    this.stageIndex++; this._clearGesture(); this._event('stage', this._currentTarget());
  }
  _finish() {
    if (this.complete || this.paused) return;
    this.complete = true; this._clearGesture(); this._event('complete');
  }
  _dwellAt(target, point, dt, fast = false) {
    if (!target || !near(target, point) || fast) { this.dwell = 0; this.dwellTarget = null; this.pressReady = false; return false; }
    if (this.dwellTarget !== target.id) { this.dwell = 0; this.dwellTarget = target.id; }
    this.dwell += dt; return true;
  }
  _wipe(a, b, travel) {
    const target = this.targets[0], segment = circleSegment(a, b, target);
    if (segment) this.regionTravel += travel * segment.fraction;
    const wasInside = near(target, a), isInside = near(target, b);
    if (!wasInside && segment) this.entry = segment.start;
    if (!isInside && segment && this.entry && crossesOppositeSides(this.entry, segment.end, target)) { this.crossings++; this.entry = null; }
    if (!isInside) this.entry = null;
    if (this.regionTravel >= 140 && this.crossings >= 3) this._advance();
  }
  update({ point, held, moving = false, distance, dt = 0 } = {}) {
    if (this.complete || this.paused) return this.snapshot();
    if (!this.active) return this.snapshot();
    if (held !== true) {
      if (held !== false) return this.cancel();
      this.point = validPoint(point) ? { x: point.x, y: point.y } : null;
      return this.end();
    }
    if (!validPoint(point)) { this._clearGesture(); return this.snapshot(); }
    const elapsed = clamp(Number.isFinite(dt) ? dt : 0, 0, 100), prior = this.point;
    const actualTravel = prior ? length(prior, point) : 0;
    const travel = Number.isFinite(distance) ? Math.min(actualTravel, Math.max(0, distance)) : actualTravel;
    this.point = { x: point.x, y: point.y }; this.held = true; this.travel += travel;
    const target = this._currentTarget();
    const speed = actualTravel / Math.max(1, elapsed);
    const fast = actualTravel > 0 && (speed > Math.max(.12, (target?.r || 30) * .004) || (typeof moving === 'number' && moving > .5));
    if (this.stage === 'wipe') { if (prior) this._wipe(prior, this.point, travel); }
    else if (this.stage === 'observe') { if (this._dwellAt(target, this.point, elapsed, fast) && this.dwell >= 600) this._advance(); }
    else if (this.stage === 'sample') {
      if (prior) { const segment = circleSegment(prior, this.point, target); if (segment) this.regionTravel += travel * segment.fraction; }
      if (this.regionTravel >= 80) { this._check(target); this._advance(); }
    } else if (this.stage === 'position' || this.stage === 'bandage') {
      // Drag distance is earned by coordinate movement; releasing over the target commits it.
    } else if (this.stage === 'pump') { this._dwellAt(target, this.point, elapsed, fast); }
    else if (this.caseData.mechanic === 'press') {
      const candidate = this.targets.find(t => !this.checked.has(t.id) && near(t, this.point));
      if (this._dwellAt(candidate, this.point, elapsed, fast)) this.pressReady = this.dwell >= 450;
    } else {
      const candidate = this._activeTargets().filter(t => !this.checked.has(t.id) && near(t, this.point)).sort((a, b) => length(a, this.point) - length(b, this.point))[0];
      if (this._dwellAt(candidate, this.point, elapsed, fast) && this.dwell >= DWELL_MS) {
        this.dwell = 0; this.dwellTarget = null; this._check(candidate);
        if (this._activeTargets().every(t => this.checked.has(t.id))) this._finish();
      }
    }
    return this.snapshot();
  }
  end() {
    if (this.paused || this.complete || !this.active) return this.snapshot();
    const target = this._currentTarget(), actualHeld = this.held, point = this.point;
    if (actualHeld && this.stage === 'position' && this.travel >= 50 && near(target, point)) { this._check(target); this._advance(); }
    else if (actualHeld && this.stage === 'bandage' && this.travel >= 50 && near(target, point)) { this._check(target); this._finish(); }
    else if (actualHeld && this.stage === 'pump' && near(target, point) && this.dwell >= 80) {
      this.pumpCount++;
      if (this.pumpCount >= 3) { this._check(target); this._finish(); }
    } else if (actualHeld && this.caseData.mechanic === 'press' && this.pressReady) {
      const pressed = this.targets.find(t => t.id === this.dwellTarget);
      if (near(pressed, point)) { this.dwell = 0; this.dwellTarget = null; this._check(pressed); if (this.targets.every(t => this.checked.has(t.id))) this._finish(); }
    }
    this._clearGesture(); return this.snapshot();
  }
  snapshot() {
    const stage = this.stage; let part = 0;
    if (stage === 'wipe') part = Math.min(this.regionTravel / 140, this.crossings / 3);
    else if (stage === 'observe') part = this.dwell / 600;
    else if (stage === 'position' || stage === 'bandage') part = this.point && near(this.targets[0], this.point) ? this.travel / 50 : 0;
    else if (stage === 'pump') part = this.pumpCount / 3;
    else if (stage === 'sample') part = this.regionTravel / 80;
    else {
      const targets = this._activeTargets(), completed = targets.filter(t => this.checked.has(t.id)).length;
      part = (completed + clamp(this.dwell / (this.caseData.mechanic === 'press' ? 450 : DWELL_MS), 0, 1)) / targets.length;
    }
    const progress = this.complete ? 1 : clamp((this.stageIndex + clamp(part, 0, 1)) / this.stages.length, 0, 1);
    const next = this.targets.findIndex(t => !this.checked.has(t.id));
    return { stage, index: this.stages.length > 1 ? this.stageIndex : next < 0 ? this.targets.length : next, checked: [...this.checked], dwell: this.dwell, progress, complete: this.complete, paused: this.paused, crossings: this.crossings, pumpCount: this.pumpCount, held: this.held, targetId: this.dwellTarget || this._currentTarget()?.id || null };
  }
}
