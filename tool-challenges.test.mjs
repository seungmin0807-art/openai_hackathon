import test from 'node:test';
import assert from 'node:assert/strict';
import { TOUCH_CASES } from './public/touch-cases.js';
import { TOOL_NAMES, TOOL_CHALLENGES, forCase, evaluateChoice, ToolChallenge } from './public/tool-challenges.js';

test('bundled core and all five addons use a single compatible Three.js runtime without a DOM', async () => {
  const THREE = await import('./public/vendor/three.js');
  assert.equal(THREE.REVISION, '186');
  for (const name of ['EffectComposer', 'RenderPass', 'OutlinePass', 'OutputPass', 'RoomEnvironment']) {
    assert.equal(typeof THREE[name], 'function', name);
  }
  const room = new THREE.RoomEnvironment();
  assert.ok(room instanceof THREE.Scene);
  const meshes = [];
  room.traverse(object => { if (object.isMesh) meshes.push(object); });
  assert.ok(meshes.length > 0);
  assert.ok(meshes.every(mesh => mesh instanceof THREE.Mesh));
  assert.ok(meshes.every(mesh => mesh.geometry instanceof THREE.BufferGeometry));
  room.dispose();
});

const correct = {
  stethoscope: 'stethoscope', vaccination: 'cotton', ear: 'otoscope',temperature:'thermometer',abdomen:'hand',
};
const activeChallenges=TOUCH_CASES.map(data=>forCase(data.id));

test('every real case has exactly three unique named choices and the expected scenario-specific answer', () => {
  assert.deepEqual(activeChallenges.map(c => c.caseId).sort(), Object.keys(correct).sort());
  assert.ok(activeChallenges.every(c=>TOOL_CHALLENGES.some(original=>original.caseId===c.caseId)));
  for (const data of TOUCH_CASES) {
    const challenge = forCase(data.id);
    assert.equal(challenge.correctToolId, correct[data.id]);
    assert.equal(challenge.choices.length, 3);
    assert.equal(new Set(challenge.choices.map(c => c.id)).size, 3);
    assert.equal(challenge.choices.filter(c => c.id === challenge.correctToolId).length, 1);
    for (const choice of challenge.choices) assert.equal(choice.name, TOOL_NAMES[choice.id]);
    assert.ok(challenge.prompt.length > 0);
  }
  assert.equal(forCase('ear').correctToolId, 'otoscope');
  assert.equal(forCase('vaccination').correctToolId, 'cotton');
});

test('every wrong offered choice and unknown input leaves the game locked and emits no unlock', () => {
  for (const challenge of activeChallenges) {
    const events = [];
    const session = new ToolChallenge(challenge.caseId, e => events.push(e));
    for (const wrong of challenge.choices.filter(c => c.id !== challenge.correctToolId)) {
      for (let i = 0; i < 5; i++) {
        const result = session.select(wrong.id);
        assert.equal(result.correct, false);
        assert.equal(result.unlocked, false);
      }
    }
    for (const invalid of [undefined, null, {}, '', '__proto__', 'unoffered-tool']) {
      const result = session.select(invalid);
      assert.equal(result.correct, false);
      assert.equal(result.unlocked, false);
      assert.equal(result.changed, false);
    }
    assert.equal(session.snapshot().unlocked, false);
    assert.deepEqual(events, []);
  }
});

test('a correct choice unlocks each case once; later input cannot repeat the advance event', () => {
  for (const challenge of activeChallenges) {
    const events = [];
    const session = new ToolChallenge(challenge.caseId, e => events.push(e));
    assert.equal(session.select(challenge.correctToolId).unlocked, true);
    const lockedIn = session.snapshot();
    for (const choice of challenge.choices) session.select(choice.id);
    session.select('unoffered-tool');
    assert.deepEqual(session.snapshot(), lockedIn);
    assert.deepEqual(events, [{ type: 'unlock', caseId: challenge.caseId, toolId: challenge.correctToolId }]);
    assert.deepEqual(evaluateChoice(challenge.caseId, challenge.correctToolId), {
      caseId: challenge.caseId, toolId: challenge.correctToolId, correct: true,
      unlocked: true, feedback: '좋아요! 도구를 써봐요.',
    });
  }
});

test('reset locks a new round and retrieved data or snapshots cannot alter future challenges', () => {
  const session = new ToolChallenge('ear');
  const data = forCase('ear');
  data.correctToolId = 'mirror';
  data.choices[0].id = 'mirror';
  assert.equal(forCase('ear').correctToolId, 'otoscope');
  assert.equal(forCase('ear').choices.some(c => c.id === 'mirror'), false);
  const snapshot = session.snapshot();
  snapshot.unlocked = true;
  assert.equal(session.snapshot().unlocked, false);
  session.select('otoscope');
  session.reset();
  assert.deepEqual(session.snapshot(), { caseId: 'ear', selectedToolId: null, unlocked: false, attempts: 0, feedback: '' });
  assert.throws(() => forCase('unknown'), RangeError);
  assert.throws(() => new ToolChallenge('ear', null), TypeError);
});
