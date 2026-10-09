import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('public/app.js','utf8');
const section=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const actual=section('function setSubtitle(text,','new ResizeObserver')+section('async function speak(text,','function stopAudio(){');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({warm=true}={}){
 const subtitle={textContent:'처음 안내'},events=[],timers=[];
 const audio={paused:true,listeners:new Map(),addEventListener(type,fn){this.listeners.set(type,fn);},removeEventListener(type,fn){if(this.listeners.get(type)===fn)this.listeners.delete(type);},async play(){this.paused=false;this.listeners.get('playing')?.();events.push({type:'playing',caption:subtitle.textContent});},end(){this.paused=true;events.push({type:'ended',caption:subtitle.textContent});this.onended?.();}};
 const context=vm.createContext({latestSubtitle:'처음 안내',lastNarration:'',goalNarrating:false,goalQueue:[],flowEpoch:0,turnId:0,speechEpoch:0,speechKind:null,speechRequest:null,narrationTimer:null,voiceWanted:false,portraitBlocked:false,autoVoice:true,voiceUnlocked:true,busy:false,config:{ttsReady:true},game:{state:{paused:false,phase:'play'}},learning:null,narrationCache:{lookup:()=>'/fixture.wav',prepare:()=>warm?new Blob(['wave']):null},audio,audioURL:null,outputContext:{resume:async()=>{}},voiceSession:null,voiceDialogue:{setState(){},finishReply(){}},AbortController,URL:{createObjectURL:()=> 'blob:fixture',revokeObjectURL(){}},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},$:()=>subtitle,status(){},setState(){},voiceBlocked:()=>false,speechSegments:text=>[text],startLearningCapture(){events.push({type:'capture',caption:subtitle.textContent});},fetch:async()=>{throw new Error('No audio');}});
 vm.runInContext(actual,context);
 return{context,subtitle,audio,events,timers};
}
test('new game events keep the playing caption until ended, then each next playing event selects its own caption',async()=>{
 const f=fixture();f.context.setSubtitle('첫 문장');assert.equal(f.subtitle.textContent,'처음 안내');f.context.drainGoalQueue();await settle();assert.equal(f.subtitle.textContent,'첫 문장');
 f.context.setSubtitle('둘째 문장');f.context.setSubtitle('셋째 문장');assert.equal(f.subtitle.textContent,'첫 문장');
 f.audio.end();await settle();assert.equal(f.subtitle.textContent,'둘째 문장');
 f.audio.end();await settle();assert.equal(f.subtitle.textContent,'셋째 문장');
 f.audio.end();await settle();assert.equal(f.subtitle.textContent,'셋째 문장');assert.equal(f.context.goalNarrating,false);
 assert.deepEqual(f.events.map(e=>[e.type,e.caption]),[['playing','첫 문장'],['ended','첫 문장'],['playing','둘째 문장'],['ended','둘째 문장'],['playing','셋째 문장'],['ended','셋째 문장']]);
});
test('WHY caption and capture wait for earlier narration, and capture waits for the question audio end',async()=>{
 const f=fixture();f.context.setSubtitle('검사 설명');f.context.drainGoalQueue();await settle();f.context.game.state.phase='check';f.context.learning={active:true,question:'이건 왜 검사하는 걸까?'};f.context.setSubtitle(f.context.learning.question);
 assert.equal(f.subtitle.textContent,'검사 설명');assert.equal(f.events.some(e=>e.type==='capture'),false);
 f.audio.end();await settle();assert.equal(f.subtitle.textContent,'이건 왜 검사하는 걸까?');assert.equal(f.events.some(e=>e.type==='capture'),false);
 f.audio.end();await settle();assert.equal(f.context.learning.questionAudioReady,true);assert.ok(f.events.find(e=>e.type==='capture'));
});
test('disabled narration shows readable new text immediately',()=>{const f=fixture();f.context.autoVoice=false;f.context.setSubtitle('음성 없는 안내');assert.equal(f.subtitle.textContent,'음성 없는 안내');assert.equal(f.context.goalQueue.length,0);});
test('TTS failure still exposes the requested text and releases the queue',async()=>{const f=fixture({warm:false});f.context.setSubtitle('글로 보는 안내');await f.context.drainGoalQueue();assert.equal(f.subtitle.textContent,'글로 보는 안내');assert.equal(f.context.goalNarrating,false);});
