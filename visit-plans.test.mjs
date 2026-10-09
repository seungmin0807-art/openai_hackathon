import test from 'node:test';
import assert from 'node:assert/strict';
import { VISIT_PLANS, createVisitPlan, VisitJourney } from './public/visit-plans.js';
import { TOUCH_CASES } from './public/touch-cases.js';

test('five supplied educational sequences use only current games and stage-specific tools', () => {
  const expected = {
    cold: ['temperature', 'stethoscope'], ear: ['temperature', 'ear'],belly: ['temperature', 'abdomen'],
    vaccination: ['vaccination'], checkup: ['temperature', 'stethoscope'],
  };
  assert.equal(VISIT_PLANS.length, 5);
  for (const [id, ids] of Object.entries(expected)) {
    const plan = createVisitPlan({ id });
    assert.deepEqual(plan.steps.map(step => step.caseId), ids);
    assert.equal(plan.purpose, 'education-example');
    assert(plan.steps.every(step => step.title && step.toolId && step.toolName));
  }
  assert.deepEqual(createVisitPlan().steps.map(step => step.toolId), ['thermometer', 'stethoscope']);
});

test('explicit clinician override replaces order and supports all five unique cases', () => {
  const order = TOUCH_CASES.map(data => data.id).reverse();
  const plan = createVisitPlan({ id: 'cold', steps: order, age: 8 });
  assert.equal(plan.age, 8);
  assert.deepEqual(plan.steps.map(step => step.caseId), order);
  assert.deepEqual(createVisitPlan({ id: 'custom', steps: [{ caseId: 'ear' }] }).steps.map(step => step.caseId), ['ear']);
});

test('invalid, empty, duplicate, excessive, and unsupported overrides are rejected', () => {
  for (const steps of [null, [], 'throat', ['unknown'], ['ear', 'ear'], [{ id: 'ear' }], Array(11).fill('ear')]) {
    assert.throws(() => createVisitPlan({ steps }), RangeError);
  }
  assert.throws(() => createVisitPlan({ id: 'unknown' }), RangeError);
  assert.throws(() => createVisitPlan({ id: 'custom' }), RangeError);
  for(const retired of ['throat','nose','pressure','oxygen','blood'])assert.throws(()=>createVisitPlan({id:'custom',steps:[retired]}),RangeError);
  for (const age of [-1, 121, .5, Infinity, NaN, '5', null]) assert.throws(() => createVisitPlan({ age }), RangeError);
});

test('only current case advances; duplicate completion cannot skip the next case', () => {
  const journey = new VisitJourney();
  assert.equal(journey.current.caseId, 'temperature');
  const initial = journey.snapshot;
  assert.throws(() => journey.finishStep('stethoscope'), RangeError);
  assert.deepEqual(journey.snapshot, initial);
  assert.equal(journey.finishStep('temperature'), 'stethoscope');
  assert.equal(journey.finishStep('temperature'), 'stethoscope');
  assert.equal(journey.snapshot.index, 1);
  assert.equal(journey.finishStep('stethoscope'), null);
  assert.equal(journey.finishStep('stethoscope'), null);
  assert(journey.snapshot.finished);
  assert.deepEqual(journey.snapshot.completed, ['temperature', 'stethoscope']);
  assert.equal(journey.current, null);
});

test('changing plans preserves age, resets progression, and invalid changes are atomic', () => {
  const journey = new VisitJourney({ age: 7 });
  journey.finishStep('temperature');
  const before = journey.snapshot;
  assert.throws(() => journey.choosePlan({ id: 'ear', steps: [] }), RangeError);
  assert.deepEqual(journey.snapshot, before);
  const changed = journey.choosePlan('belly');
  assert.equal(changed.age, 7);
  assert.equal(changed.index, 0);
  assert.deepEqual(changed.completed, []);
  assert.deepEqual(changed.steps, ['temperature', 'abdomen']);
  journey.finishStep('temperature');
  assert.equal(journey.reset().currentCaseId, 'temperature');
});

test('legacy single-case selection becomes a one-stage custom journey', () => {
  const journey = new VisitJourney({ id: 'checkup', age: 6 });
  const selected = journey.selectStepOnly('ear');
  assert.equal(selected.planId, 'custom');
  assert.equal(selected.age, 6);
  assert.equal(selected.total, 1);
  assert.equal(journey.current.toolId, 'otoscope');
  assert.equal(journey.finishStep('ear'), null);
  assert(journey.snapshot.finished);
});

test('returned objects cannot mutate preset data or journey progression', () => {
  const journey = new VisitJourney();
  const plan = journey.plan, snapshot = journey.snapshot, current = journey.current;
  plan.steps.splice(0); snapshot.steps.splice(0); snapshot.completed.push('temperature'); current.caseId = 'blood';
  assert.equal(journey.current.caseId, 'temperature');
  assert.equal(journey.snapshot.total, 2);
  assert.deepEqual(journey.snapshot.completed, []);
  assert(Object.isFrozen(VISIT_PLANS));
  assert(Object.isFrozen(VISIT_PLANS[0].steps));
});
