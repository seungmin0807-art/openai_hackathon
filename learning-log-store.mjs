import {mkdir,readFile,writeFile,rename,link,unlink,readdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {RequestError,textField} from './voice-policy.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CASES=new Set(['stethoscope','vaccination','throat','ear','nose','temperature','pressure','oxygen','blood','abdomen']);
const FIELDS=new Set(['schemaVersion','eventId','sessionId','createdAt','visit','procedureId','eventType','round','role','text','signal','assessmentValidated','audience','guardianConfirmed']);
const bad=()=>new RequestError(400,'INVALID_LEARNING_LOG','질문 기록의 형식을 확인해 주세요.');
export function normalizeLearningLog(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!FIELDS.has(k)))throw bad();
 if(value.schemaVersion!==1||!UUID.test(value.eventId)||!UUID.test(value.sessionId))throw bad();
 if(typeof value.createdAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value.createdAt))throw bad();
 const date=new Date(value.createdAt);if(!Number.isFinite(date.getTime())||date.toISOString().replace('.000Z','Z')!==value.createdAt.replace('.000Z','Z'))throw bad();
 const visit=value.visit;if(!visit||typeof visit!=='object'||Array.isArray(visit)||Object.keys(visit).some(k=>!['visitId','revision','source'].includes(k)))throw bad();
 if(typeof visit.visitId!=='string'||!visit.visitId.trim()||visit.visitId.length>80||/[\r\n<>]/.test(visit.visitId)||!Number.isInteger(visit.revision)||visit.revision<0||visit.revision>1e9||!['local','clinician'].includes(visit.source))throw bad();
 if(!CASES.has(value.procedureId)||!['question','answer','feedback','summary'].includes(value.eventType)||!Number.isInteger(value.round)||value.round<1||value.round>3||!['assistant','child','system'].includes(value.role))throw bad();
 if(value.signal!==undefined&&!['understood','revisit','unclear'].includes(value.signal))throw bad();
 if(value.assessmentValidated!==undefined&&value.assessmentValidated!==false)throw bad();
 return{schemaVersion:1,eventId:value.eventId.toLowerCase(),sessionId:value.sessionId.toLowerCase(),createdAt:date.toISOString(),visit:{visitId:visit.visitId.trim(),revision:visit.revision,source:visit.source},procedureId:value.procedureId,eventType:value.eventType,round:value.round,role:value.role,text:textField(value.text,'질문 기록',600),...(value.signal!==undefined?{signal:value.signal}:{}),assessmentValidated:false};
}
function endpoint(value,name){
 if(!value?.trim())return null;let url;try{url=new URL(value);}catch{throw new Error(`${name} requires HTTPS or loopback HTTP.`);}
 if(url.username||url.password||url.hash||!(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw new Error(`${name} requires HTTPS or loopback HTTP.`);
 return url;
}
export class LearningLogStore{
 constructor({directory,env={},fetchImpl=fetch,now=()=>Date.now(),retryDelayMs=30000}){
  this.directory=path.resolve(directory);this.fetchImpl=fetchImpl;this.now=now;this.retryDelayMs=retryDelayMs;this.locks=new Map();
  this.providers={guardian:{url:endpoint(env.GUARDIAN_LOG_URL,'GUARDIAN_LOG_URL'),token:env.GUARDIAN_LOG_TOKEN},clinician:{url:endpoint(env.CLINICIAN_LOG_URL,'CLINICIAN_LOG_URL'),token:env.CLINICIAN_LOG_TOKEN}};
 }
 async atomic(file,record,exclusive=false){
  await mkdir(this.directory,{recursive:true,mode:0o700});const temp=path.join(this.directory,`.${randomUUID()}.tmp`);
  await writeFile(temp,JSON.stringify(record),{encoding:'utf8',mode:0o600,flag:'wx',flush:true});
  try{if(exclusive)await link(temp,file);else await rename(temp,file);}finally{await unlink(temp).catch(()=>{});}
 }
 serial(id,fn){const pending=(this.locks.get(id)||Promise.resolve()).catch(()=>{}).then(fn);this.locks.set(id,pending);pending.finally(()=>{if(this.locks.get(id)===pending)this.locks.delete(id);}).catch(()=>{});return pending;}
 async deliver(record){
  await Promise.all(Object.entries(this.providers).map(async([name,provider])=>{
   const status=record.destinations[name];if(status.status==='sent')return;
   if(!provider.url){status.reason='not_configured';return;}
   if(status.lastAttemptAt&&this.now()-Date.parse(status.lastAttemptAt)<this.retryDelayMs)return;
   status.attempts++;status.lastAttemptAt=new Date(this.now()).toISOString();
   try{const result=await this.fetchImpl(provider.url,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':record.event.eventId,...(provider.token?{Authorization:`Bearer ${provider.token}`}:{})},body:JSON.stringify(record.event),signal:AbortSignal.timeout(5000),redirect:'error'});if(!result.ok)throw new Error();status.status='sent';status.reason=null;status.sentAt=new Date(this.now()).toISOString();}
   catch{status.status='pending';status.reason='provider_unavailable';}
  }));
 }
 async enqueue(value){
  const event=normalizeLearningLog(value);
  return this.serial(event.eventId,async()=>{
   const file=path.join(this.directory,`${event.eventId}.json`);let record,duplicate=false;
   try{record=JSON.parse(await readFile(file,'utf8'));duplicate=true;}catch(e){if(e.code!=='ENOENT')throw e;}
   if(!record){record={schemaVersion:1,event,destinations:Object.fromEntries(Object.keys(this.providers).map(name=>[name,{status:'pending',reason:this.providers[name].url?'awaiting_delivery':'not_configured',attempts:0}]))};
    try{await this.atomic(file,record,true);}catch(e){if(e.code!=='EEXIST')throw e;record=JSON.parse(await readFile(file,'utf8'));duplicate=true;}
   }
   if(JSON.stringify(record.event)!==JSON.stringify(event))throw new RequestError(409,'LEARNING_LOG_CONFLICT','같은 기록 번호의 내용이 달라요.');
   // The complete text event is durable before either provider is contacted.
   await this.deliver(record);await this.atomic(file,record);
   return{queued:true,eventId:event.eventId,duplicate,destinations:structuredClone(record.destinations)};
  });
 }
 async retryPending({limit=20}={}){
  if(!Object.values(this.providers).some(p=>p.url))return 0;
  let files;try{files=await readdir(this.directory);}catch(e){if(e.code==='ENOENT')return 0;throw e;}
  let attempted=0;
  for(const file of files.filter(f=>UUID.test(f.slice(0,-5))&&f.endsWith('.json'))){
   if(attempted>=limit)break;
   let record;try{record=JSON.parse(await readFile(path.join(this.directory,file),'utf8'));}catch{continue;}
   if(Object.values(record.destinations).some(s=>s.status==='pending')){await this.enqueue(record.event);attempted++;}
  }
  return attempted;
 }
}
