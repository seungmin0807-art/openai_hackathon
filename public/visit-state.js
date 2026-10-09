import { createVisitPlan } from './visit-plans.js';

// This contract describes an educational visit example. It does not infer a
// diagnosis or an examination order from symptoms, and makes no network calls.
export const VISIT_CONCERNS = Object.freeze(['cough', 'fever', 'throat', 'ear', 'nose', 'belly', 'vaccination', 'checkup']);
export const AUSCULTATION_SITES = Object.freeze(['heart', 'breath-left', 'breath-right', 'bowel']);
const auscultationSites = new Set(AUSCULTATION_SITES);
const defaultAuscultationSites = Object.freeze(['heart', 'breath-left', 'breath-right']);
const concerns = new Set(VISIT_CONCERNS);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = state => ({
  schemaVersion: 1, visitId: state.visitId, source: state.source, revision: state.revision,
  child: { nickname: state.child.nickname, age: state.child.age },
  concerns: [...state.concerns],
  plan: { presetId: state.plan.presetId, steps: [...state.plan.steps],
    ...(state.plan.auscultation ? { auscultation: { sites: [...state.plan.auscultation.sites] } } : {}) },
});

export const DEFAULT_VISIT_STATE = Object.freeze({
  schemaVersion: 1,
  visitId: 'demo-visit',
  source: 'local',
  revision: 0,
  child: Object.freeze({ nickname: '도담', age: 5 }),
  concerns: Object.freeze(['throat', 'cough']),
  plan: Object.freeze({ presetId: 'cold', steps: Object.freeze(['temperature', 'stethoscope']) }),
});

/** Only declared fields survive normalization; patient IDs/free-form notes are dropped.
 * Do not forward the whole visit state, visitId, or nickname to an AI endpoint.
 */
export function normalizeVisitState(input) {
  if (!isObject(input) || input.schemaVersion !== 1) throw new TypeError('방문 정보 schemaVersion 1이 필요해요.');
  if (typeof input.visitId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(input.visitId)) throw new RangeError('방문 ID는 64자 이하의 불투명한 식별자로 지정해 주세요.');
  if (!['clinician', 'local'].includes(input.source)) throw new RangeError('방문 정보 출처를 확인해 주세요.');
  const revision = input.revision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0) throw new RangeError('revision은 0 이상의 안전한 정수로 지정해 주세요.');
  if (!isObject(input.child) || typeof input.child.nickname !== 'string') throw new TypeError('아이의 별명과 나이가 필요해요.');
  const nickname = input.child.nickname.trim(), age = input.child.age;
  if (!nickname || Array.from(nickname).length > 20) throw new RangeError('별명은 1자부터 20자까지 지정해 주세요.');
  if (!Number.isInteger(age) || age < 2 || age > 12) throw new RangeError('나이는 2세부터 12세까지 지정해 주세요.');
  if (!Array.isArray(input.concerns) || input.concerns.length > VISIT_CONCERNS.length || input.concerns.some(value => !concerns.has(value)) || new Set(input.concerns).size !== input.concerns.length) throw new RangeError('상태 단서는 지원하는 값으로 중복 없이 지정해 주세요.');
  if (!isObject(input.plan) || typeof input.plan.presetId !== 'string') throw new TypeError('명시적인 방문 놀이 플랜이 필요해요.');
  const plan = createVisitPlan({ id: input.plan.presetId, steps: input.plan.steps, age });
  const steps = plan.steps.map(step => step.caseId);
  let auscultation;
  if (input.plan.auscultation !== undefined) {
    const value = input.plan.auscultation;
    if (!isObject(value) || !Array.isArray(value.sites) || value.sites.length < 1 || value.sites.length > 4 || value.sites.some(site => !auscultationSites.has(site)) || new Set(value.sites).size !== value.sites.length) throw new RangeError('청진 위치는 지원하는 네 위치 중 1개부터 4개까지 중복 없이 지정해 주세요.');
    auscultation = { sites: [...value.sites] };
  } else if (steps.includes('stethoscope')) {
    // This is a display/play fallback, never a selection inferred from concerns.
    auscultation = { sites: [...defaultAuscultationSites] };
  }
  return {
    schemaVersion: 1, visitId: input.visitId, source: input.source, revision,
    child: { nickname, age }, concerns: [...input.concerns],
    plan: { presetId: plan.id, steps, ...(auscultation ? { auscultation } : {}) },
  };
}

/** Pure read of supplied defaults. No implicit storage, patient lookup, or browser access. */
export function readVisitState(defaults = DEFAULT_VISIT_STATE) { return normalizeVisitState(defaults); }

export class VisitStateStore {
  #base;
  #override = null;
  #seenRevisions = new Map();
  #subscribers = new Set();

  constructor(initial = DEFAULT_VISIT_STATE) {
    this.#base = normalizeVisitState(initial);
    if (this.#base.source === 'clinician') this.#seenRevisions.set(this.#base.visitId, this.#base.revision);
  }

  get snapshot() { return clone(this.#override || this.#base); }
  get clinicianState() { return this.#base.source === 'clinician' ? clone(this.#base) : null; }
  get localOverride() { return this.#override ? clone(this.#override) : null; }
  get hasLocalOverride() { return this.#override !== null; }

  applyClinician(data) {
    const next = normalizeVisitState(data);
    if (next.source !== 'clinician') throw new RangeError('의사 정보의 source는 clinician이어야 해요.');
    const seen = this.#seenRevisions.get(next.visitId);
    if (seen !== undefined && next.revision <= seen) return this.snapshot;
    this.#seenRevisions.set(next.visitId, next.revision);
    this.#base = next;
    this.#override = null;
    this.#emit();
    return this.snapshot;
  }

  applyLocal(patch) {
    if (!isObject(patch) || Object.keys(patch).some(key => !['child', 'concerns', 'plan'].includes(key))) throw new TypeError('별명·나이·상태 단서·플랜만 앱에서 바꿀 수 있어요.');
    if (!Object.keys(patch).length) return this.snapshot;
    if (patch.child !== undefined && !isObject(patch.child)) throw new TypeError('child 수정은 객체로 지정해 주세요.');
    if (patch.plan !== undefined && !isObject(patch.plan)) throw new TypeError('plan 수정은 객체로 지정해 주세요.');
    const current = this.snapshot;
    const child = { ...current.child, ...patch.child };
    let plan = current.plan;
    if (patch.plan !== undefined) {
      plan = { ...current.plan, ...patch.plan };
      if (Object.hasOwn(patch.plan, 'auscultation') && isObject(patch.plan.auscultation)) {
        plan.auscultation = { ...current.plan.auscultation, ...patch.plan.auscultation };
      }
      // An explicitly chosen preset supplies its educational sequence. Merely
      // editing concerns never invents a plan or changes the selected sequence.
      if (Object.hasOwn(patch.plan, 'presetId') && !Object.hasOwn(patch.plan, 'steps')) {
        const example = createVisitPlan({ id: patch.plan.presetId, age: child.age });
        plan.steps = example.steps.map(step => step.caseId);
      }
    }
    const next = normalizeVisitState({ ...current, source: 'local', child, concerns: patch.concerns === undefined ? current.concerns : patch.concerns, plan });
    this.#override = next;
    this.#emit();
    return this.snapshot;
  }

  revertToClinician() {
    if (this.#override) { this.#override = null; this.#emit(); }
    return this.snapshot;
  }

  /** Subscribers receive isolated copies, including an immediate initial value. */
  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('구독자는 함수여야 해요.');
    this.#subscribers.add(listener);
    listener(this.snapshot);
    return () => this.#subscribers.delete(listener);
  }

  #emit() { for (const listener of this.#subscribers) listener(this.snapshot); }
}
