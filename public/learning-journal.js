import {apiFetch} from './api-client.js';
import {bindAppSession} from './session-report.js';

const LIMIT = 500;
const RETRY_MS = 30000;
const TYPES = new Set(['question', 'answer', 'feedback', 'summary']);
const ROLES = new Set(['assistant', 'child', 'system']);
const SIGNALS = new Set(['understood', 'revisit', 'unclear']);
const PROCEDURES = new Set(['stethoscope', 'vaccination', 'throat', 'ear', 'nose', 'temperature', 'pressure', 'oxygen', 'blood', 'abdomen']);
const uuid = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

// Memory only. A durable server acknowledgement transfers retry ownership to
// the server; provider delivery is tracked separately and never inferred.
export class LearningJournal {
  constructor({getContext = () => ({}), getConsent = () => ({audience: 'adult_test', guardianConfirmed: false}), onStatus = () => {}} = {}) {
    this.getContext = getContext; this.getConsent = getConsent; this.onStatus = onStatus;
    this._sessionId = uuid(); this._queue = []; this._accepted = 0;
    this._lastDelivery = null; this._mode = 'idle'; this._flushPromise = null;
    this._retryTimer = null; this._destroyed = false; this._requestAbort = null;
  }

  get snapshot() {
    return Object.freeze({sessionId: this._sessionId, pending: this._queue.length,
      accepted: this._accepted, lastDelivery: this._lastDelivery, mode: this._mode});
  }

  record({eventType, round, role, text, signal} = {}) {
    if (this._destroyed) return null;
    if (this._queue.length >= LIMIT) {
      this._emit('queue_full', '기록이 가득 찼어요. 먼저 보낸 뒤 다시 기록해 주세요.'); return null;
    }
    try {
      const context = this.getContext(), visit = context?.visit;
      const clean = typeof text === 'string' ? text.trim() : '';
      if (!TYPES.has(eventType) || !ROLES.has(role) || !Number.isInteger(round) || round < 1 || round > 3 ||
        !clean || clean.length > 600 || (signal !== undefined && !SIGNALS.has(signal)) ||
        !PROCEDURES.has(context?.procedureId) || typeof visit?.visitId !== 'string' ||
        !visit.visitId.trim() || visit.visitId.length > 80 || /[\r\n<>]/.test(visit.visitId) ||
        !Number.isInteger(visit.revision) || visit.revision < 0 || visit.revision > 1e9 || !['local', 'clinician'].includes(visit.source))
        throw new Error('Invalid learning event');
      const event = Object.freeze({schemaVersion: 1, eventId: uuid(), sessionId: this._sessionId,
        createdAt: new Date().toISOString(), visit: Object.freeze({visitId: visit.visitId.trim(), revision: visit.revision, source: visit.source}),
        procedureId: context.procedureId, eventType, round, role, text: clean,
        ...(signal !== undefined ? {signal} : {}), assessmentValidated: false});
      this._queue.push(event);
      if (!this._retryTimer) this._mode = 'queued';
      this._emit('recorded');
      if (!this._retryTimer) void this.flush();
      return event.eventId;
    } catch {
      this._emit('invalid_event', '기록의 형식을 확인해 주세요.'); return null;
    }
  }

  resetSession() {
    this._sessionId = uuid(); this._emit('session_reset'); return this._sessionId;
  }

  flush() {
    if (this._destroyed) return Promise.resolve(this.snapshot);
    if (this._flushPromise) return this._flushPromise;
    if (!this._queue.length) { this._settledMode(); return Promise.resolve(this.snapshot); }
    if (!this._consent().guardianConfirmed) {
      this._clearRetry(); this._mode = 'waiting_consent'; this._emit('waiting_consent');
      return Promise.resolve(this.snapshot);
    }
    if (this._retryTimer) return Promise.resolve(this.snapshot);
    const promise = this._sendPending().finally(() => {
      if (this._flushPromise === promise) {
        this._flushPromise = null;
        if (!this._destroyed && this._queue.length && !this._retryTimer && this._consent().guardianConfirmed) void this.flush();
      }
    });
    this._flushPromise = promise;
    return promise;
  }

  async _sendPending() {
    while (this._queue.length && !this._destroyed) {
      // Consent is read for each transmission; visit and text were captured at
      // record time. Changing visits or replaying cannot rewrite queued events.
      const consent = this._consent();
      if (!consent.guardianConfirmed) {
        this._mode = 'waiting_consent'; this._emit('waiting_consent'); break;
      }
      const event = this._queue[0], abort = new AbortController();
      this._requestAbort = abort;
      const timeout = setTimeout(() => abort.abort(), 15000);
      try {
        await bindAppSession(event.sessionId);
        const response = await apiFetch('/api/learning-log', {method: 'POST',
          headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...event, ...consent}), signal: abort.signal});
        if (response.status !== 202) throw new Error('Server did not accept the record');
        const result = await response.json();
        if (result?.queued !== true) throw new Error('No durable acknowledgement');
        if (this._destroyed) break;
        this._queue.shift(); this._accepted++;
        this._lastDelivery = this._delivery(event.eventId, result.destinations);
        this._settledMode(); this._emit('accepted');
      } catch {
        if (!this._destroyed) {
          this._mode = 'retrying'; this._emit('retrying', '기록을 보관하고 있어요. 잠시 뒤 다시 보낼게요.'); this._scheduleRetry();
        }
        break;
      } finally {
        clearTimeout(timeout);
        if (this._requestAbort === abort) this._requestAbort = null;
      }
    }
    return this.snapshot;
  }

  _consent() {
    try {
      const value = this.getConsent();
      return {audience: value?.audience || 'adult_test', guardianConfirmed: value?.guardianConfirmed === true};
    } catch { return {audience: 'adult_test', guardianConfirmed: false}; }
  }
  _delivery(eventId, destinations = {}) {
    const safe = Object.fromEntries(['guardian', 'clinician'].map(name => [name, Object.freeze({
      status: destinations?.[name]?.status === 'sent' ? 'sent' : 'pending'})]));
    return Object.freeze({eventId, queued: true, destinations: Object.freeze(safe)});
  }
  _settledMode() {
    const providerPending = this._lastDelivery && Object.values(this._lastDelivery.destinations).some(d => d.status === 'pending');
    this._mode = this._queue.length || providerPending ? 'queued' : 'idle';
  }
  _scheduleRetry() {
    if (this._destroyed || this._retryTimer || !this._queue.length) return;
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null;
      if (!this._destroyed) void this.flush();
    }, RETRY_MS);
  }
  _clearRetry() { if (this._retryTimer) clearTimeout(this._retryTimer); this._retryTimer = null; }
  _emit(event, message) {
    if (this._destroyed) return;
    try { this.onStatus(Object.freeze({...this.snapshot, event, ...(message ? {message} : {})})); } catch {}
  }
  destroy() {
    this._destroyed = true; this._clearRetry(); this._requestAbort?.abort();
  }
}
