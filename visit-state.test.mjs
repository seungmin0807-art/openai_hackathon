import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_VISIT_STATE, normalizeVisitState, readVisitState, VisitStateStore } from './public/visit-state.js';

const clinician = (revision = 1, visitId = 'visit-a') => ({
  ...readVisitState(), visitId, source: 'clinician', revision,
});

test('demo defaults are normalized educational values, without automatic concern-to-plan inference', () => {
  const state = readVisitState();
  assert.equal(state.child.nickname, '도담');
  assert.equal(state.child.age, 5);
  assert.deepEqual(state.concerns, ['throat', 'cough']);
  assert.deepEqual(state.plan.steps, ['temperature', 'stethoscope']);
  const plan = normalizeVisitState({ ...state, concerns: ['ear'], plan: { presetId: 'cold' } });
  assert.deepEqual(plan.plan.steps, state.plan.steps);
  assert(Object.isFrozen(DEFAULT_VISIT_STATE.child));
});

test('normalization strips additional identifiers, notes, and nested undeclared fields', () => {
  const raw = { ...clinician(), patientId: 'private-id', notes: 'private-note', child: { nickname: ' 도담 ', age: 5, fullName: 'private-name' }, plan: { presetId: 'ear', extra: true } };
  const state = normalizeVisitState(raw);
  assert.deepEqual(Object.keys(state).sort(), ['schemaVersion', 'visitId', 'source', 'revision', 'child', 'concerns', 'plan'].sort());
  assert.deepEqual(state.child, { nickname: '도담', age: 5 });
  assert.deepEqual(state.plan, { presetId: 'ear', steps: ['temperature', 'ear'] });
  assert(!JSON.stringify(state).includes('private'));
});

test('legacy schema, malformed metadata, and unlisted concerns are rejected', () => {
  for (const change of [{ schemaVersion: undefined }, { schemaVersion: 0 }, { source: 'doctor' }, { visitId: '이름 방문' }, { revision: -1 }, { revision: Infinity }, { concerns: ['diagnosis'] }, { concerns: ['ear', 'ear'] }, { plan: { presetId: 'unknown' } }]) {
    assert.throws(() => normalizeVisitState({ ...clinician(), ...change }));
  }
  for (const child of [{ nickname: '', age: 5 }, { nickname: 'x'.repeat(21), age: 5 }, { nickname: '도담', age: 1 }, { nickname: '도담', age: 13 }, { nickname: '도담', age: '5' }]) {
    assert.throws(() => normalizeVisitState({ ...clinician(), child }));
  }
});

test('clinician plan overrides validate unique supported steps and require at least one', () => {
  assert.deepEqual(normalizeVisitState({ ...clinician(), plan: { presetId: 'cold', steps: ['ear', 'temperature'] } }).plan.steps, ['ear', 'temperature']);
  for (const steps of [[], ['ear', 'ear'], ['unknown'], Array(11).fill('ear')]) assert.throws(() => normalizeVisitState({ ...clinician(), plan: { presetId: 'cold', steps } }));
});

test('latest clinician state is authoritative and discards local overrides', () => {
  const store = new VisitStateStore(clinician(1));
  store.applyLocal({ child: { nickname: '별이' }, concerns: ['ear'], plan: { presetId: 'ear' } });
  assert(store.hasLocalOverride);
  assert.equal(store.snapshot.source, 'local');
  assert.deepEqual(store.snapshot.plan.steps, ['temperature', 'ear']);
  assert.deepEqual(store.clinicianState.concerns, ['throat', 'cough']);
  store.applyClinician({ ...clinician(2), child: { nickname: '도담', age: 6 } });
  assert.equal(store.snapshot.revision, 2);
  assert.equal(store.snapshot.child.age, 6);
  assert.equal(store.snapshot.source, 'clinician');
  assert.equal(store.localOverride, null);
});

test('stale or repeated revisions cannot overwrite a newer visit or its local edit', () => {
  const store = new VisitStateStore(clinician(4));
  store.applyLocal({ child: { age: 7 } });
  const before = store.snapshot;
  store.applyClinician(clinician(3)); store.applyClinician(clinician(4));
  assert.deepEqual(store.snapshot, before);
  store.applyClinician(clinician(0, 'visit-b'));
  assert.equal(store.snapshot.visitId, 'visit-b');
  assert.equal(store.snapshot.revision, 0);
  assert.equal(store.hasLocalOverride, false);
  store.applyClinician(clinician(3, 'visit-a'));
  assert.equal(store.snapshot.visitId, 'visit-b');
});

test('invalid or source-mismatched updates are atomic', () => {
  const store = new VisitStateStore(clinician());
  const before = store.snapshot;
  for (const patch of [{ child: { age: 20 } }, { concerns: ['private-note'] }, { plan: { presetId: 'ear', steps: [] } }, { revision: 5 }, { child: null }]) {
    assert.throws(() => store.applyLocal(patch));
    assert.deepEqual(store.snapshot, before);
  }
  assert.throws(() => store.applyClinician({ ...clinician(2), source: 'local' }));
  assert.deepEqual(store.snapshot, before);
});

test('local concern edits preserve the explicit plan; revert restores the clinician base', () => {
  const store = new VisitStateStore(clinician());
  store.applyLocal({ concerns: ['belly'] });
  assert.deepEqual(store.snapshot.plan.steps, ['temperature', 'stethoscope']);
  store.applyLocal({ plan: { steps: ['abdomen'] } });
  assert.deepEqual(store.snapshot.plan.steps, ['abdomen']);
  store.revertToClinician();
  assert.deepEqual(store.snapshot, clinician());
});

test('snapshots, input updates, and subscriber copies cannot mutate stored state', () => {
  const input = clinician();
  const store = new VisitStateStore(input);
  input.child.age = 12; input.plan.steps.splice(0);
  const snap = store.snapshot; snap.child.age = 10; snap.plan.steps.splice(0);
  let calls = 0, secondAge;
  const unsubscribe = store.subscribe(state => { calls++; state.child.age = 2; state.plan.steps.splice(0); });
  store.subscribe(state => { secondAge = state.child.age; });
  store.applyLocal({ child: { age: 7 } });
  assert.equal(secondAge, 7); assert.equal(store.snapshot.child.age, 7);
  assert.equal(store.snapshot.plan.steps.length, 2);
  assert.equal(calls, 2); unsubscribe(); store.revertToClinician(); assert.equal(calls, 2);
  assert.equal(store.snapshot.child.age, 5);
});

test('a local demo can revert edits before any clinician data arrives', () => {
  const store = new VisitStateStore();
  store.applyLocal({ child: { age: 8 }, plan: { presetId: 'vaccination' } });
  assert.equal(store.clinicianState, null);
  assert.deepEqual(store.snapshot.plan.steps, ['vaccination']);
  assert.deepEqual(store.revertToClinician(), readVisitState());
});

test('explicit clinician auscultation sites survive normalization in their specified order', () => {
  const state = normalizeVisitState({ ...clinician(), plan: { presetId: 'custom', steps: ['stethoscope'], auscultation: { sites: ['bowel', 'heart'], note: 'discard' } } });
  assert.deepEqual(state.plan, { presetId: 'custom', steps: ['stethoscope'], auscultation: { sites: ['bowel', 'heart'] } });
  const fallback = normalizeVisitState({ ...clinician(), plan: { presetId: 'custom', steps: ['stethoscope'] } });
  assert.deepEqual(fallback.plan.auscultation.sites, ['heart', 'breath-left', 'breath-right']);
  const withoutStethoscope = normalizeVisitState({ ...clinician(), plan: { presetId: 'ear' } });
  assert.equal(withoutStethoscope.plan.auscultation, undefined);
});

test('local site edits preserve visit order and concern edits cannot infer listening sites', () => {
  const input = { ...clinician(), plan: { presetId: 'cold', steps: ['ear', 'stethoscope'], auscultation: { sites: ['heart', 'bowel'] } } };
  const store = new VisitStateStore(input);
  const local = store.applyLocal({ plan: { auscultation: { sites: ['breath-right'] } } });
  assert.equal(local.plan.presetId, 'cold');
  assert.deepEqual(local.plan.steps, ['ear', 'stethoscope']);
  assert.deepEqual(local.plan.auscultation.sites, ['breath-right']);
  store.applyLocal({ concerns: ['belly', 'cough'] });
  assert.deepEqual(store.snapshot.plan.auscultation.sites, ['breath-right']);
  assert.deepEqual(store.clinicianState.plan.auscultation.sites, ['heart', 'bowel']);
  assert.deepEqual(store.revertToClinician().plan.auscultation.sites, ['heart', 'bowel']);
});

test('invalid listening sites are rejected atomically and all four sites are permitted', () => {
  const store = new VisitStateStore(clinician());
  const before = store.snapshot;
  assert.throws(() => normalizeVisitState({ ...clinician(), plan: { presetId: 'cold', auscultation: {} } }));
  assert.deepEqual(store.applyLocal({ plan: { auscultation: {} } }).plan, before.plan);
  const afterNoop = store.snapshot;
  for (const auscultation of [null, { sites: [] }, { sites: ['heart', 'heart'] }, { sites: ['lung'] }, { sites: 'heart' }, { sites: ['heart', 'breath-left', 'breath-right', 'bowel', 'heart'] }]) {
    assert.throws(() => store.applyLocal({ plan: { auscultation } }));
    assert.deepEqual(store.snapshot, afterNoop);
  }
  store.applyLocal({ plan: { auscultation: { sites: ['heart', 'breath-left', 'breath-right', 'bowel'] } } });
  assert.equal(store.snapshot.plan.auscultation.sites.length, 4);
});

test('listening sites are isolated across input, snapshots, subscribers, and revisions', () => {
  const input = { ...clinician(), plan: { presetId: 'custom', steps: ['stethoscope'], auscultation: { sites: ['heart'] } } };
  const store = new VisitStateStore(input);
  input.plan.auscultation.sites.push('bowel');
  store.snapshot.plan.auscultation.sites.push('breath-left');
  store.subscribe(state => state.plan.auscultation.sites.splice(0));
  const patch = { plan: { auscultation: { sites: ['bowel'] } } };
  store.applyLocal(patch); patch.plan.auscultation.sites.push('heart');
  assert.deepEqual(store.snapshot.plan.auscultation.sites, ['bowel']);
  store.applyClinician({ ...input, revision: 2, plan: { presetId: 'custom', steps: ['stethoscope'], auscultation: { sites: ['breath-left'] } } });
  assert.deepEqual(store.snapshot.plan.auscultation.sites, ['breath-left']);
  assert.equal(store.hasLocalOverride, false);
});

