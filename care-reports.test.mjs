import test from 'node:test';
import assert from 'node:assert/strict';
import {CareReports,normalizeActivity} from './care-reports.mjs';
import {DEFAULT_VISIT_STATE} from './public/visit-state.js';

const sessionId='9baad559-fae8-4a73-bd0b-294d88a12905';
const eventId='9baad559-fae8-4a73-bd0b-294d88a12906';
const eventId2='9baad559-fae8-4a73-bd0b-294d88a12907';
const visit={visitId:'private-visit',revision:2,source:'local'};
const event={schemaVersion:1,sequence:1,elapsedMs:400,procedureId:'ear',phase:'play',type:'observation_checked',targetId:'drum',input:'3d_touch',assessment:'not_assessed'};
const activity=(patch={})=>({sessionId,eventId,createdAt:'2026-10-09T00:00:00.000Z',visit,events:[event],...patch});
const learning=(patch={})=>({schemaVersion:1,sessionId,eventId,createdAt:'2026-10-09T00:00:00.000Z',visit,procedureId:'ear',eventType:'answer',round:1,role:'child',text:'귀 안을 봐요.',assessmentValidated:false,...patch});
const summary=(signal='unvalidated')=>({overview:'귀 검사 놀이를 했습니다.',activities:['고막 관찰 기록이 있습니다.'],questions:[],understanding:{signal,note:'말로 목적을 표현한 기록이며 검증된 평가가 아닙니다.'},nextConversation:['이경이 무엇을 보는지 함께 이야기해 보세요.']});
function setup({env={},reply=summary(),fetchImpl}={}){
 const rows=new Map(),calls=[];let clock=Date.parse('2026-10-09T01:00:00Z');
 const repository={get:async k=>rows.has(k)?structuredClone(rows.get(k)):null,put:async(k,v)=>{rows.set(k,structuredClone(v));},list:async prefix=>[...rows.keys()].filter(k=>k.startsWith(prefix))};
 const instance=new CareReports({repository,env:{CLINICIAN_PORTAL_CODE:'doctor-secret',GUARDIAN_PORTAL_CODE:'guardian-secret',OPENAI_API_KEY:'test-key',...env},now:()=>clock,fetchImpl:fetchImpl||(async(url,options)=>{calls.push({url,options,payload:JSON.parse(options.body)});return{ok:true,json:async()=>({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(reply)}]}]})};})});
 return{instance,rows,calls,repository,setTime:v=>{clock=v;}};
}
async function login(instance,role='clinician'){const auth=await instance.signIn({role,accessCode:role==='clinician'?'doctor-secret':'guardian-secret'});return{auth,principal:await instance.authenticate(auth.cookie.split(';')[0])};}
const input=patch=>({sessionId,audience:'adult_test',guardianConfirmed:true,...patch});
const error=(status,code)=>e=>e.status===status&&e.code===code;

test('independent codes produce a secure HttpOnly opaque cookie; no secret is stored',async()=>{
 const {instance,rows}=setup();await assert.rejects(instance.signIn({role:'guardian',accessCode:'doctor-secret'}),error(401,'PORTAL_ACCESS_DENIED'));
 const {auth,principal}=await login(instance);assert.match(auth.cookie,/HttpOnly; SameSite=Strict; Path=\/api\/portal; Max-Age=28800; Secure$/);assert.equal(principal.role,'clinician');assert.ok(Object.isFrozen(principal));assert.ok(!JSON.stringify([...rows]).includes('doctor-secret'));assert.ok(![...rows.keys()][0].includes(auth.cookie.split('=')[1].split(';')[0]));
});
test('missing configuration fails closed',async()=>{const {instance}=setup({env:{GUARDIAN_PORTAL_CODE:''}});await assert.rejects(instance.signIn({role:'guardian',accessCode:'x'}),error(503,'PORTAL_NOT_CONFIGURED'));});
test('configured shared convenience code still produces role-specific sessions',async()=>{const {instance}=setup({env:{CLINICIAN_PORTAL_CODE:'0807',GUARDIAN_PORTAL_CODE:'0807'}});for(const role of ['clinician','guardian']){const result=await instance.signIn({role,accessCode:'0807'});const principal=await instance.authenticate(result.cookie.split(';')[0]);assert.equal(principal.role,role);if(role==='guardian')await assert.rejects(instance.setVisit(principal,DEFAULT_VISIT_STATE),error(403,'PORTAL_FORBIDDEN'));}});
test('forged roles, duplicate cookie and expired cookie are rejected',async()=>{
 const {instance,setTime}=setup();await assert.rejects(instance.reports({role:'clinician'}),error(401,'PORTAL_AUTH_REQUIRED'));
 const {auth,principal}=await login(instance);const cookie=auth.cookie.split(';')[0];await assert.rejects(instance.authenticate(`${cookie}; ${cookie}`),error(401,'PORTAL_AUTH_REQUIRED'));
 setTime(Date.parse(principal.expiresAt));await assert.rejects(instance.authenticate(cookie),error(401,'PORTAL_SESSION_EXPIRED'));await assert.rejects(instance.getVisit(principal),error(401,'PORTAL_AUTH_REQUIRED'));
});
test('guardian reads shared visit but cannot write; clinician revisions are monotonic',async()=>{
 const {instance}=setup(),doctor=(await login(instance)).principal,guardian=(await login(instance,'guardian')).principal;
 assert.equal((await instance.getVisit(guardian)).visit.source,'local');
 const next={...structuredClone(DEFAULT_VISIT_STATE),source:'clinician',revision:1};
 await assert.rejects(instance.setVisit(guardian,next),error(403,'PORTAL_FORBIDDEN'));
 assert.equal((await instance.setVisit(doctor,next)).visit.revision,1);
 await assert.rejects(instance.setVisit(doctor,{...next,revision:2},{expectedRevision:0}),error(409,'VISIT_REVISION_CONFLICT'));
 await assert.rejects(instance.setVisit(doctor,next),error(409,'VISIT_REVISION_CONFLICT'));
 assert.equal((await instance.setVisit(doctor,{...next,revision:2},{expectedRevision:1})).visit.revision,2);
});
test('visit source and unsupported plans are rejected without substitution',async()=>{
 const {instance}=setup(),doctor=(await login(instance)).principal;
 await assert.rejects(instance.setVisit(doctor,DEFAULT_VISIT_STATE),error(400,'INVALID_VISIT_SOURCE'));
 await assert.rejects(instance.setVisit(doctor,{...DEFAULT_VISIT_STATE,source:'clinician',plan:{presetId:'custom',steps:['invented']}}),error(400,'INVALID_VISIT'));
});
test('learning event ingestion is idempotent and conflicting IDs fail',async()=>{
 const {instance}=setup();assert.equal((await instance.recordLearningEvent(learning())).duplicate,false);assert.equal((await instance.recordLearningEvent(learning())).duplicate,true);
 await assert.rejects(instance.recordLearningEvent(learning({text:'다른 내용'})),error(409,'CARE_EVENT_CONFLICT'));
 await assert.rejects(instance.recordLearningEvent(learning({assessmentValidated:true})),error(400,'INVALID_LEARNING_LOG'));
});
test('activity validation rejects clinical values, fabricated assessment and reversed sequence',()=>{
 assert.equal(normalizeActivity(activity()).assessmentValidated,false);
 assert.throws(()=>normalizeActivity(activity({events:[{...event,oxygenSaturation:98}]})),error(400,'INVALID_ACTIVITY'));
 assert.throws(()=>normalizeActivity(activity({events:[{...event,assessment:'validated'}]})),error(400,'INVALID_ACTIVITY'));
 assert.throws(()=>normalizeActivity(activity({events:[event,event]})),error(400,'INVALID_ACTIVITY'));
});
test('summary gates consent and child approval before writes or API calls',async()=>{
 const {instance,rows,calls}=setup();await assert.rejects(instance.summarize(input({guardianConfirmed:false})),error(403,'GUARDIAN_REQUIRED'));
 await assert.rejects(instance.summarize(input({audience:'child'})),error(403,'CHILD_DATA_DISABLED'));assert.equal(rows.size,0);assert.equal(calls.length,0);
});
test('empty sessions and unconfigured AI fail without invented report',async()=>{
 const {instance,calls}=setup();await assert.rejects(instance.summarize(input()),error(409,'SESSION_EMPTY'));assert.equal(calls.length,0);
 const noKey=setup({env:{OPENAI_API_KEY:''}});await noKey.instance.recordLearningEvent(learning());await assert.rejects(noKey.instance.summarize(input()),error(503,'AI_NOT_CONFIGURED'));assert.equal(noKey.calls.length,0);
});
test('Luna receives anonymized evidence, strict schema and no diagnosis/assessment claims',async()=>{
 const {instance,calls}=setup();await instance.recordLearningEvent(learning());const result=await instance.summarize(input({activityEvents:[event],eventId,createdAt:activity().createdAt,visit}));
 assert.equal(result.report.assessmentValidated,false);assert.equal(result.report.summary.understanding.assessmentValidated,false);assert.equal(result.report.delivery,'shared-portal-storage');assert.equal(result.destinations.guardian.status,'sent');
 const payload=calls[0].payload;assert.equal(payload.model,'gpt-6-luna');assert.equal(payload.reasoning.effort,'none');assert.equal(payload.store,false);assert.equal(payload.text.format.strict,true);
 assert.ok(!payload.input[0].content.includes(sessionId));assert.ok(!payload.input[0].content.includes(visit.visitId));assert.ok(!payload.input[0].content.includes(eventId));assert.match(payload.instructions,/진단/);
 const doctor=(await login(instance)).principal,guardian=(await login(instance,'guardian')).principal;assert.deepEqual(await instance.reports(doctor),await instance.reports(guardian));
});
test('activity-only summary retains not_observed instead of treating clicks as understanding',async()=>{
 const {instance}=setup({reply:summary('not_observed')});const result=await instance.summarize(input({activityEvents:[event],eventId,createdAt:activity().createdAt,visit}));assert.equal(result.report.evidence.learningCount,0);assert.equal(result.report.summary.understanding.signal,'not_observed');
});
test('repeated cumulative snapshots are deduplicated and do not call Luna again',async()=>{
 const {instance,calls}=setup({reply:summary('not_observed')});const first=await instance.summarize(input({activityEvents:[event],eventId,createdAt:activity().createdAt,visit}));
 const second=await instance.summarize(input({activityEvents:[event],eventId:eventId2,createdAt:'2026-10-09T00:00:01Z',visit}));assert.equal(calls.length,1);assert.equal(second.report.evidence.activityCount,1);assert.equal(first.report.evidenceFingerprint,second.report.evidenceFingerprint);
});
test('conflicting snapshot sequence is not merged as another action',async()=>{
 const {instance}=setup({reply:summary('not_observed')});await instance.recordActivity(activity());await instance.recordActivity(activity({eventId:eventId2,events:[{...event,targetId:'canal'}]}));await assert.rejects(instance.summarize(input()),error(409,'ACTIVITY_SEQUENCE_CONFLICT'));
});
test('a session cannot mix different visit revisions',async()=>{
 const {instance,calls}=setup();await instance.recordLearningEvent(learning());await instance.recordActivity(activity({visit:{...visit,revision:3}}));await assert.rejects(instance.summarize(input()),error(409,'SESSION_VISIT_CONFLICT'));assert.equal(calls.length,0);
});
test('a corrupted row from another session cannot leak into a summary',async()=>{
 const {instance,rows,calls}=setup();rows.set(`care/learning/${sessionId}/${eventId}`,learning({sessionId:eventId2}));await assert.rejects(instance.summarize(input()),error(409,'SESSION_RECORD_CONFLICT'));assert.equal(calls.length,0);
});
test('upstream failure and incomplete/refused output never create a stored report',async()=>{
 for(const response of [{ok:false},{ok:true,json:async()=>({status:'incomplete',output:[]})},{ok:true,json:async()=>({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'refusal',refusal:'no'}]}]})}]){
  const {instance,rows}=setup({fetchImpl:async()=>response});await instance.recordLearningEvent(learning());await assert.rejects(instance.summarize(input()),e=>e.status===502);assert.equal(rows.has(`care/report/${sessionId}`),false);
 }
});
test('extra model clinical fields and wrong understanding signals are rejected',async()=>{
 for(const reply of [{...summary(),diagnosis:'normal'},summary('not_observed')]){const {instance}=setup({reply});await instance.recordLearningEvent(learning());await assert.rejects(instance.summarize(input()),error(502,'INVALID_SUMMARY'));}
});
test('same concurrent session summary is serialized and cached',async()=>{
 const {instance,calls}=setup();await instance.recordLearningEvent(learning());const [a,b]=await Promise.all([instance.summarize(input()),instance.summarize(input())]);assert.equal(calls.length,1);assert.deepEqual(a,b);
});
