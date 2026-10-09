import test from 'node:test';
import assert from 'node:assert/strict';
import { ProcedureGame } from './public/game-engine.js';
import { procedures } from './public/procedures/index.js';
test('five selectable procedure modules have distinct identities and concise purpose text',()=>{
  assert.equal(procedures.length,5);assert.equal(new Set(procedures.map(p=>p.id)).size,5);
  assert.deepEqual(procedures.map(p=>p.id).sort(),['abdomen','ear','stethoscope','temperature','vaccination']);
  for(const p of procedures){assert.ok(p.prompt.length<=25);assert.ok(p.discovery.length<=45);assert.match(p.source,/^https:\/\//);}
});
test('pause prevents interaction, responses can revisit without failing and reports do not infer emotion',()=>{
  const game=new ProcedureGame(procedures,()=>{});game.select('stethoscope');game.pause();game.act();assert.equal(game.state.phase,'play');game.pause();game.act('touch');assert.equal(game.state.phase,'result');game.check();game.facialCue('smile');assert.equal(game.state.phase,'check');assert.equal(game.state.understanding,null);game.answer('unclear','voice');assert.equal(game.state.phase,'result');game.check();game.answer('understood','self_report');assert.equal(game.state.phase,'done');assert.equal(game.state.understanding.confidence,'unvalidated');
  const report=game.summary();assert.equal(report.assessmentValidated,false);assert.equal(report.events.find(e=>e.type==='facial_cue').interpretation,'none');assert.ok(!JSON.stringify(report).includes('transcript'));
});
test('skip, replay, select and event ordering support an optional future reporting adapter',()=>{
  const game=new ProcedureGame(procedures,()=>{});game.act();game.check();game.answer('skipped');assert.equal(game.state.phase,'done');game.replay();assert.equal(game.state.phase,'play');game.select('ear');assert.equal(game.state.procedure.id,'ear');assert.equal(game.state.understanding,null);const rows=game.summary().events;assert.deepEqual(rows.map(e=>e.sequence),rows.map((_,i)=>i+1));const copy=game.summary();copy.events[0].type='modified';assert.notEqual(game.events[0].type,'modified');
});
