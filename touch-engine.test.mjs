import test from 'node:test';
import assert from 'node:assert/strict';
import { TouchSession } from './public/touch-engine.js';

const target = (id = 'a', x = 100, y = 100, r = 30) => ({ id, x, y, r, name: id, result: `${id} 관찰` });
function fixture(mechanic, targets = [target()], extra = {}) {
  const events = [], session = new TouchSession({ mechanic, targets, ...extra }, e => events.push(e));
  return { session, events };
}
function at(session, point, dt = 100, options = {}) { return session.update({ point, held: true, moving: false, distance: 0, dt, ...options }); }
function hold(session, point, ms, options = {}) {
  for (let left = ms; left > 0; left -= 100) at(session, point, Math.min(100, left), options);
}
function drag(session, start, end, dt = 100) {
  session.begin(); at(session, start, 0); at(session, end, dt, { moving: true, distance: Math.hypot(end.x - start.x, end.y - start.y) });
}
const checks = events => events.filter(e => e.type === 'check');

test('scan/listen/hover/clip require continuous actual contact for 650ms, with no duplicate checks', () => {
  for (const mechanic of ['scan', 'listen', 'hover', 'clip']) {
    const { session, events } = fixture(mechanic);
    session.begin(); session.end(); assert.equal(session.snapshot().complete, false);
    session.begin(); hold(session, target(), 100); session.end(); assert.equal(checks(events).length, 0);
    session.begin(); hold(session, target(), 600); assert.equal(checks(events).length, 0);
    at(session, target(), 50); assert.equal(session.snapshot().complete, true); assert.equal(checks(events).length, 1);
    assert.equal(checks(events)[0].targetId, 'a'); assert.equal(checks(events)[0].result, 'a 관찰');
    for (let i = 0; i < 10; i++) { session.begin(); hold(session, target(), 700); session.end(); }
    assert.equal(checks(events).length, 1); assert.equal(events.filter(e => e.type === 'complete').length, 1);
  }
});

test('all targets must be held; outside contact and fast sweeping reset rather than complete dwell', () => {
  const { session, events } = fixture('scan', [target('a'), target('b', 250)]);
  session.begin(); hold(session, target('a'), 500);
  at(session, { x: 110, y: 100 }, 16, { moving: true, distance: 10 }); assert.equal(session.snapshot().dwell, 0);
  hold(session, { x: 500, y: 500 }, 1000); assert.equal(checks(events).length, 0);
  hold(session, target('a'), 750); assert.equal(session.snapshot().complete, false); assert.deepEqual(session.snapshot().checked, ['a']);
  hold(session, target('a'), 900); assert.equal(checks(events).length, 1);
  hold(session, target('b', 250), 750); assert.equal(session.snapshot().complete, true); assert.deepEqual(session.snapshot().checked, ['a', 'b']);
  assert.deepEqual(checks(events).map(e => e.progress), [.5, 1]);
});

test('dt clamps to 100ms, invalid contact and pointer interruption discard unfinished dwell', () => {
  const { session } = fixture('listen');
  session.begin(); at(session, target(), 100000); assert.equal(session.snapshot().dwell, 100);
  at(session, target(), -100); assert.equal(session.snapshot().dwell, 100);
  session.update({ point: target(), held: false, dt: 1000 }); assert.equal(session.snapshot().dwell, 0);
  hold(session, target(), 1000); assert.equal(session.snapshot().complete, false); // No new pointer begin.
  session.begin(); hold(session, target(), 500); session.update({ point: { x: NaN, y: 0 }, held: true, dt: 100 });
  assert.equal(session.snapshot().dwell, 0); assert.equal(session.snapshot().complete, false);
});

test('paused input cannot check or advance and resume starts a fresh hold; reset starts a new session', () => {
  const { session, events } = fixture('hover');
  session.begin(); hold(session, target(), 500); session.setPaused(true); const count = events.length;
  session.begin(); hold(session, target(), 1000); session.end(); assert.equal(events.length, count); assert.equal(session.snapshot().paused, true);
  session.setPaused(false); session.begin(); hold(session, target(), 600); assert.equal(session.snapshot().complete, false);
  hold(session, target(), 50); assert.equal(session.snapshot().complete, true);
  const snapshot = session.snapshot(); snapshot.checked.push('tampered'); assert.deepEqual(session.snapshot().checked, ['a']);
  session.reset(); assert.equal(session.snapshot().complete, false); assert.deepEqual(session.snapshot().checked, []); assert.equal(session.snapshot().progress, 0);
});

test('wipe requires three full opposite-side crossings and 140 actual in-region travel within one gesture', () => {
  const { session } = fixture('wipe-bandage');
  session.begin(); at(session, { x: 60, y: 100 }, 0);
  // Repeated entry/exit on the same side never counts as a through-wipe.
  for (let i = 0; i < 5; i++) { at(session, { x: 80, y: 100 }, 100, { distance: 20 }); at(session, { x: 60, y: 100 }, 100, { distance: 20 }); }
  assert.equal(session.snapshot().crossings, 0); assert.equal(session.snapshot().stage, 'wipe');
  session.end(); session.begin(); at(session, { x: 60, y: 100 }, 0);
  at(session, { x: 140, y: 100 }, 100, { distance: 80 }); assert.equal(session.snapshot().crossings, 1);
  at(session, { x: 60, y: 100 }, 100, { distance: 80 }); assert.equal(session.snapshot().crossings, 2); assert.equal(session.snapshot().stage, 'wipe');
  at(session, { x: 140, y: 100 }, 100, { distance: 80 }); assert.equal(session.snapshot().stage, 'observe');
});

test('wipe cannot accumulate separated strokes or fake stationary distance, and vaccination ends only after bandage drag/release', () => {
  const { session, events } = fixture('wipe-bandage');
  for (let i = 0; i < 4; i++) { drag(session, { x: 60, y: 100 }, { x: 140, y: 100 }); session.end(); }
  assert.equal(session.snapshot().stage, 'wipe');
  session.begin(); for (let i = 0; i < 8; i++) at(session, target(), 100, { distance: 1000 }); assert.equal(session.snapshot().stage, 'wipe'); session.end();
  session.begin(); at(session, { x: 60, y: 100 }, 0);
  for (const x of [140, 60, 140]) at(session, { x, y: 100 }, 100, { distance: 80 });
  assert.equal(session.snapshot().stage, 'observe'); assert.equal(checks(events).length, 0);
  hold(session, target(), 1000); assert.equal(session.snapshot().stage, 'observe'); // Stage change needs a new hold.
  session.begin(); hold(session, target(), 600); assert.equal(session.snapshot().stage, 'bandage');
  session.begin(); hold(session, target(), 1000); session.end(); assert.equal(session.snapshot().complete, false);
  drag(session, { x: 30, y: 100 }, target()); assert.equal(session.snapshot().complete, false); session.end(); assert.equal(session.snapshot().complete, true);
  assert.equal(checks(events).length, 1); assert.deepEqual(events.filter(e => e.type === 'stage').map(e => e.stage), ['wipe', 'observe', 'bandage']);
});

test('pump requires cuff drag/release followed by three separate near-pump press/release cycles', () => {
  const { session, events } = fixture('pump', [target('cuff'), target('pump', 300)]);
  session.begin(); hold(session, target('pump', 300), 1000); session.end(); assert.equal(session.snapshot().stage, 'position');
  drag(session, { x: 30, y: 100 }, target('cuff')); assert.equal(session.snapshot().stage, 'position'); session.end(); assert.equal(session.snapshot().stage, 'pump');
  session.begin(); hold(session, target('pump', 300), 1000); assert.equal(session.snapshot().pumpCount, 0); session.end(); assert.equal(session.snapshot().pumpCount, 1);
  session.end(); session.end(); assert.equal(session.snapshot().pumpCount, 1);
  session.begin(); hold(session, { x: 800, y: 500 }, 200); session.end(); assert.equal(session.snapshot().pumpCount, 1);
  for (let i = 0; i < 2; i++) { session.begin(); hold(session, target('pump', 300), 100); session.end(); }
  assert.equal(session.snapshot().complete, true); assert.deepEqual(checks(events).map(e => e.targetId), ['cuff', 'pump']);
});

test('sample requires actual target travel before expanded targets each receive a separate scan hold', () => {
  const { session, events } = fixture('sample', [target('tube', 100, 100, 50)], { expandedTargets: [target('cell-a', 300), target('cell-b', 450)] });
  session.begin(); hold(session, target(), 1000, { distance: 100 }); assert.equal(session.snapshot().stage, 'sample');
  session.end(); drag(session, { x: 50, y: 100 }, { x: 150, y: 100 }); assert.equal(session.snapshot().stage, 'inspect'); assert.deepEqual(session.snapshot().checked, ['tube']);
  session.begin(); hold(session, target('cell-a', 300), 650); assert.equal(session.snapshot().complete, false);
  hold(session, target('cell-b', 450), 750); assert.equal(session.snapshot().complete, true);
  assert.deepEqual(checks(events).map(e => e.targetId), ['tube', 'cell-a', 'cell-b']);
});

test('press checks only after a 450ms near-target hold and release; physical pressure is never inferred', () => {
  const { session, events } = fixture('press', [target('a'), target('b', 250)]);
  session.begin(); hold(session, target(), 450, { pressure: 1000 }); assert.equal(checks(events).length, 0); session.end(); assert.deepEqual(session.snapshot().checked, ['a']);
  session.begin(); hold(session, target('b', 250), 400); session.end(); assert.equal(checks(events).length, 1);
  session.begin(); hold(session, target('b', 250), 450); session.update({ point: { x: 600, y: 500 }, held: false, dt: 0 }); assert.equal(session.snapshot().complete, false);
  session.begin(); hold(session, target('b', 250), 450, { pressure: 0 }); session.end(); assert.equal(session.snapshot().complete, true);
  assert.equal(JSON.stringify(events).includes('pressure'), false); assert.equal(checks(events).length, 2);
});

test('invalid cases, missing pump/inspection targets and duplicate IDs fail before interaction', () => {
  for (const data of [null, { mechanic: 'button', targets: [target()] }, { mechanic: 'scan', targets: [] }, { mechanic: 'scan', targets: [target(), target()] }, { mechanic: 'scan', targets: [{ ...target(), r: 0 }] }, { mechanic: 'pump', targets: [target()] }, { mechanic: 'sample', targets: [target()] }, { mechanic: 'sample', targets: [target()], expandedTargets: [target()] }]) assert.throws(() => new TouchSession(data));
});
test('pointer cancellation never commits a ready press or bandage drag and preserves pause/completed targets', () => {
  const press = fixture('press', [target('a'), target('b', 250)]);
  press.session.begin(); hold(press.session, target(), 450); press.session.end();
  press.session.begin(); hold(press.session, target('b', 250), 450); press.session.cancel(); press.session.end();
  assert.deepEqual(press.session.snapshot().checked, ['a']); assert.equal(press.session.snapshot().complete, false); assert.equal(checks(press.events).length, 1);
  press.session.setPaused(true); press.session.cancel(); assert.equal(press.session.snapshot().paused, true);
  const bandage = fixture('wipe-bandage');
  bandage.session.begin(); at(bandage.session, { x: 60, y: 100 }, 0);
  for (const x of [140, 60, 140]) at(bandage.session, { x, y: 100 }, 100, { distance: 80 });
  bandage.session.begin(); hold(bandage.session, target(), 600); assert.equal(bandage.session.snapshot().stage, 'bandage');
  drag(bandage.session, { x: 30, y: 100 }, target()); bandage.session.cancel(); bandage.session.end();
  assert.equal(bandage.session.snapshot().stage, 'bandage'); assert.equal(bandage.session.snapshot().complete, false); assert.equal(checks(bandage.events).length, 0);
});
test('invalid held flags and missing contact cannot be mistaken for an actual release', () => {
  for (const held of ['false', 'true', 1, undefined]) {
    const { session, events } = fixture('press');
    session.begin(); hold(session, target(), 450); session.update({ point: target(), held, dt: 0 }); session.end();
    assert.equal(checks(events).length, 0); assert.equal(session.snapshot().complete, false);
  }
});
