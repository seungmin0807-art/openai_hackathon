import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createServer} from './server.mjs';
import {DEFAULT_VISIT_STATE} from './public/visit-state.js';

// Real local HTTP + memory storage + fake Responses. No environment file,
// deployed secrets, cloud storage, clinical data, microphone or paid API calls.
async function fixture(t,env={}){
 const rows=new Map(),calls=[];
 const repository={get:async k=>rows.has(k)?structuredClone(rows.get(k)):null,put:async(k,v)=>rows.set(k,structuredClone(v)),list:async prefix=>[...rows.keys()].filter(k=>k.startsWith(prefix))};
 const server=createServer({env:{DEPLOYMENT_MODE:'vercel',OPENAI_API_KEY:'fixture-key',CLINICIAN_PORTAL_CODE:'fixture-clinician',GUARDIAN_PORTAL_CODE:'fixture-guardian',...env},repository,rateLimit:100,fetchImpl:async(url,options)=>{
  assert.equal(String(url),'https://api.openai.com/v1/responses');const payload=JSON.parse(options.body);calls.push(payload);
  const evidence=JSON.parse(payload.input[0].content),signal=evidence.dialogue.some(e=>e.role==='child'&&e.eventType==='answer')?'unvalidated':'not_observed';
  const summary={overview:'이경 놀이와 목적에 관한 대화 기록입니다.',activities:['고막을 관찰하는 놀이를 수행했습니다.'],questions:['이경이 무엇을 보는지 물었습니다.'],understanding:{signal,note:'대화에 나타난 표현만 기록했으며 이해도나 임상 상태를 검증한 결과가 아닙니다.'},nextConversation:['보호자와 이경의 목적을 다시 이야기해 볼 수 있습니다.']};
  return Response.json({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(summary)}]}]});
 }});
 for(let attempt=0;;attempt++){
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{await fetch(`http://127.0.0.1:${server.address().port}/api/health`);break;}catch(e){if(e.cause?.message!=='bad port'||attempt>=5)throw e;await new Promise(resolve=>server.close(resolve));}
 }
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const base=`http://127.0.0.1:${server.address().port}`;
 const request=async(route,{body,cookie,method=body?'POST':'GET'}={})=>fetch(base+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return{rows,calls,request};
}
const consent={audience:'adult_test',guardianConfirmed:true};
const cookieOf=response=>response.headers.get('set-cookie')?.split(';')[0];
const visit={visitId:'opaque-visit',revision:0,source:'local'};
const log=(sessionId,patch={})=>({schemaVersion:1,eventId:randomUUID(),sessionId,createdAt:'2026-10-09T00:00:00Z',visit,procedureId:'ear',eventType:'answer',role:'child',round:1,text:'귀 안을 보는 거예요.',assessmentValidated:false,...consent,...patch});
const activity={schemaVersion:1,sequence:1,elapsedMs:1200,procedureId:'ear',phase:'play',type:'observation_checked',targetId:'eardrum',input:'3d_touch',assessment:'not_assessed'};
const summaryInput=sessionId=>({sessionId,...consent,eventId:randomUUID(),createdAt:'2026-10-09T00:00:01Z',visit,activityEvents:[activity]});
async function bind(f,sessionId,cookie){const response=await f.request('/api/app-session',{body:{sessionId},cookie});assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict; Path=\/api; Max-Age=28800; Secure/);return cookieOf(response);}
async function portal(f,role){const response=await f.request('/api/portal/session',{body:{role,accessCode:`fixture-${role}`}});assert.equal(response.status,200);assert.equal((await response.json()).role,role);assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);return cookieOf(response);}

test('HTTP session→learning/activity summary→both portals→clinician visit→app reflects the exact plan',async t=>{
 const f=await fixture(t),sessionId=randomUUID(),appCookie=await bind(f,sessionId);
 const question=log(sessionId,{eventType:'question',text:'이경은 뭘 봐요?'});
 for(const event of [question,log(sessionId)]){const response=await f.request('/api/learning-log',{body:event,cookie:appCookie});assert.equal(response.status,202);assert.equal((await response.json()).queued,true);}
 const generated=await f.request('/api/session-summary',{body:summaryInput(sessionId),cookie:appCookie});assert.equal(generated.status,200);const data=await generated.json();
 assert.equal(data.report.sessionId,sessionId);assert.equal(data.report.assessmentValidated,false);assert.equal(data.report.summary.understanding.assessmentValidated,false);assert.equal(data.report.summary.understanding.signal,'unvalidated');assert.deepEqual(data.report.evidence,{learningCount:2,activityCount:1});assert.equal(data.report.delivery,'shared-portal-storage');assert.equal(data.destinations.guardian.status,'sent');
 assert.equal(f.calls.length,1);const payload=f.calls[0];assert.equal(payload.model,'gpt-6-luna');assert.equal(payload.reasoning.effort,'none');assert.equal(payload.store,false);assert.equal(payload.text.format.strict,true);
 const aiInput=payload.input[0].content;assert.ok(!aiInput.includes(sessionId));assert.ok(!aiInput.includes(visit.visitId));assert.match(payload.instructions,/진단/);assert.ok(!Object.hasOwn(data.report,'clinicalReading'));assert.ok(!Object.hasOwn(data.report,'diagnosis'));
 const guardian=await portal(f,'guardian'),clinician=await portal(f,'clinician');
 const guardianReports=await(await f.request('/api/portal/reports',{cookie:guardian})).json();const clinicianReports=await(await f.request('/api/portal/reports',{cookie:clinician})).json();assert.deepEqual(guardianReports,clinicianReports);assert.equal(guardianReports.reports.length,1);assert.equal(guardianReports.reports[0].sessionId,sessionId);
 const initial=await(await f.request('/api/portal/visit',{cookie:clinician})).json();assert.equal(initial.visit.schemaVersion,1);
 const updated={...structuredClone(DEFAULT_VISIT_STATE),visitId:initial.visit.visitId,source:'clinician',revision:initial.visit.revision+1,child:{nickname:'별이',age:6},plan:{presetId:'custom',steps:['ear','vaccination'],auscultation:{sites:['heart']}}};
 const rejected=await f.request('/api/portal/visit',{body:{visit:updated,expectedRevision:initial.visit.revision},cookie:guardian});assert.equal(rejected.status,403);assert.equal((await rejected.json()).code,'PORTAL_FORBIDDEN');
 const saved=await f.request('/api/portal/visit',{body:{visit:updated,expectedRevision:initial.visit.revision},cookie:clinician});assert.equal(saved.status,200);const savedVisit=(await saved.json()).visit;assert.deepEqual(savedVisit.plan.steps,['ear','vaccination']);
 const appState=await(await f.request('/api/visit-state')).json();assert.equal(appState.mode,'clinician');assert.deepEqual(appState.state,savedVisit);assert.equal(appState.state.child.nickname,'별이');assert.equal(f.calls.length,1);
 const otherSession=randomUUID(),otherCookie=await bind(f,otherSession);const cross=await f.request('/api/session-summary',{body:{sessionId,...consent},cookie:otherCookie});assert.equal(cross.status,403);assert.equal((await cross.json()).code,'SESSION_DENIED');assert.equal(f.calls.length,1);
 const stealBind=await f.request('/api/app-session',{body:{sessionId},cookie:otherCookie});assert.equal(stealBind.status,403);
});

test('HTTP rejects missing/cross-session capabilities, forged roles and unconfirmed child summaries before AI',async t=>{
 const f=await fixture(t),sessionId=randomUUID(),cookie=await bind(f,sessionId);
 const missingLog=await f.request('/api/learning-log',{body:log(sessionId)});assert.equal(missingLog.status,403);assert.equal((await missingLog.json()).code,'SESSION_DENIED');
 const missingSummary=await f.request('/api/session-summary',{body:summaryInput(sessionId)});assert.equal(missingSummary.status,403);assert.equal((await missingSummary.json()).code,'SESSION_DENIED');
 const child=await f.request('/api/session-summary',{body:{...summaryInput(sessionId),audience:'child'},cookie});assert.equal(child.status,403);assert.equal((await child.json()).code,'CHILD_DATA_DISABLED');
 const unconfirmed=await f.request('/api/session-summary',{body:{...summaryInput(sessionId),guardianConfirmed:false},cookie});assert.equal(unconfirmed.status,403);assert.equal((await unconfirmed.json()).code,'GUARDIAN_REQUIRED');
 const forged=await f.request('/api/portal/reports',{cookie:'role=clinician; mori_portal=fixture-clinician'});assert.equal(forged.status,401);
 const badRole=await f.request('/api/portal/session',{body:{role:'clinician',accessCode:'fixture-guardian'}});assert.equal(badRole.status,401);
 const forbidden=await f.request('/api/portal/visit',{body:{visit:{...DEFAULT_VISIT_STATE,source:'clinician'}}});assert.equal(forbidden.status,401);assert.equal(f.calls.length,0);assert.equal([...f.rows.keys()].some(k=>k.startsWith('care/report/')),false);
});

test('HTTP clinician cannot require retired examinations or overwrite a newer revision',async t=>{
 const f=await fixture(t),cookie=await portal(f,'clinician');
 const state={...structuredClone(DEFAULT_VISIT_STATE),source:'clinician',revision:1,plan:{presetId:'custom',steps:['temperature','stethoscope']}};
 assert.equal((await f.request('/api/portal/visit',{body:{visit:state,expectedRevision:0},cookie})).status,200);
 const stale=await f.request('/api/portal/visit',{body:{visit:{...state,revision:2},expectedRevision:0},cookie});assert.equal(stale.status,409);
 for(const retired of ['throat','nose','pressure','oxygen','blood']){const rejected=await f.request('/api/portal/visit',{body:{visit:{...state,revision:2,plan:{presetId:'custom',steps:[retired]}},expectedRevision:1},cookie});assert.equal(rejected.status,400,retired);assert.equal((await rejected.json()).code,'INVALID_VISIT');}
 const current=await(await f.request('/api/visit-state')).json();assert.deepEqual(current.state.plan.steps,['temperature','stethoscope']);assert.equal(current.state.revision,1);assert.equal(f.calls.length,0);
});
