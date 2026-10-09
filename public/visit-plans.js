import { TOUCH_CASES } from './touch-cases.js';
import { forCase } from './tool-challenges.js';

// Educational examples supplied for the prototype. These do not diagnose a child
// or prescribe a clinical examination order. A clinician can replace the steps.
const examples = [
  ['cold','몸이 으슬으슬해요','몸이 불편할 때 만나는 검사를 알아봐요.',['temperature','stethoscope']],
  ['ear','귀가 불편해요','귀 검사 과정을 알아봐요.',['temperature','ear']],
  ['belly','배가 불편해요','배 검사 과정을 알아봐요.',['temperature','abdomen']],
  ['vaccination','예방접종을 알아봐요','접종 과정을 알아봐요.',['vaccination']],
  ['checkup','몸을 확인해요','몸을 확인하는 검사를 알아봐요.',['temperature','stethoscope']],
];

export const VISIT_PLANS = Object.freeze(examples.map(([id, title, brief, steps]) =>
  Object.freeze({ id, title, brief, steps: Object.freeze([...steps]) })));

const plansById = new Map(VISIT_PLANS.map(plan => [plan.id, plan]));
const casesById = new Map(TOUCH_CASES.map(data => [data.id, data]));

function validateAge(age) {
  // Age is display metadata only; it does not change the clinical meaning/order.
  if (!Number.isInteger(age) || age < 0 || age > 120) throw new RangeError('나이는 0부터 120까지의 정수로 지정해 주세요.');
  return age;
}

function validateSteps(steps) {
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > 10) throw new RangeError('진료 놀이를 1개부터 10개까지 지정해 주세요.');
  const ids = steps.map(step => typeof step === 'string' ? step : step?.caseId);
  if (ids.some(id => typeof id !== 'string' || !casesById.has(id)||id==='blood')) throw new RangeError('지원하는 진료 놀이 ID를 지정해 주세요.');
  if (new Set(ids).size !== ids.length) throw new RangeError('한 순서에 같은 진료 놀이를 중복해서 넣을 수 없어요.');
  return ids;
}

function buildStep(caseId) {
  const data = casesById.get(caseId), challenge = forCase(caseId);
  const choice = challenge.choices.find(item => item.id === challenge.correctToolId);
  return { caseId, title: data.title, toolId: choice.id, toolName: choice.name };
}

/** Explicit overrides replace the example sequence. id:'custom' requires steps. */
export function createVisitPlan({ id = 'cold', steps, age = 5 } = {}) {
  const preset = plansById.get(id);
  if (!preset && id !== 'custom') throw new RangeError('지원하는 방문 놀이 플랜을 지정해 주세요.');
  const ids = validateSteps(steps === undefined ? preset?.steps : steps);
  return {
    id,
    title: preset?.title || (ids.length === 1 ? casesById.get(ids[0]).title : '직접 고른 진료 놀이'),
    brief: preset?.brief || '원하는 진료 놀이 순서를 직접 골랐어요.',
    age: validateAge(age),
    purpose: 'education-example',
    steps: ids.map(buildStep),
  };
}

export class VisitJourney {
  #plan;
  #index = 0;
  #completed = [];

  constructor(options = {}) { this.#plan = createVisitPlan(options); }

  get current() { return this.#plan.steps[this.#index] ? { ...this.#plan.steps[this.#index] } : null; }
  get plan() { return { ...this.#plan, steps: this.#plan.steps.map(step => ({ ...step })) }; }
  get snapshot() {
    return {
      planId: this.#plan.id,
      title: this.#plan.title,
      age: this.#plan.age,
      index: this.#index,
      total: this.#plan.steps.length,
      currentCaseId: this.current?.caseId ?? null,
      completed: [...this.#completed],
      finished: this.#index === this.#plan.steps.length,
      steps: this.#plan.steps.map(step => step.caseId),
    };
  }

  choosePlan(options = {}) {
    const input = typeof options === 'string' ? { id: options } : options;
    // Build before committing so invalid overrides preserve the current journey.
    const next = createVisitPlan({ ...input, age: input.age ?? this.#plan.age });
    this.#plan = next;
    return this.reset();
  }

  reset() { this.#index = 0; this.#completed = []; return this.snapshot; }

  /** Returns the next case ID, or null when finished. Duplicate completion is a no-op. */
  finishStep(caseId) {
    if (this.#completed.includes(caseId)) return this.current?.caseId ?? null;
    if (caseId !== this.current?.caseId || !casesById.has(caseId)) throw new RangeError('지금 진행 중인 진료 놀이만 완료할 수 있어요.');
    this.#completed.push(caseId);
    this.#index++;
    return this.current?.caseId ?? null;
  }

  selectStepOnly(caseId) { return this.choosePlan({ id: 'custom', steps: [caseId] }); }
}
