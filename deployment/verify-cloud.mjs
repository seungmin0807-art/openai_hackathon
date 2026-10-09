import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const base=process.argv[2]||'https://tori-hospital.vercel.app';
const secrets=JSON.parse(await readFile('.data/deployment-secrets.json','utf8'));
const report={base,checks:[],date:new Date().toISOString()};
async function request(route,{body,cookie}={}){
 const res=await fetch(base+route,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(90000)});
 const content=res.headers.get('content-type')||'';const data=content.includes('json')?await res.json():await res.arrayBuffer();
 report.checks.push({route,status:res.status,contentType:content,...(data instanceof ArrayBuffer?{bytes:data.byteLength}:{}),...(data?.code?{code:data.code}:{})});
 if(!res.ok)throw new Error(`${route} status ${res.status}, code ${data?.code||'none'}`);
 return{data,cookie:res.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};
}
try{
 await request('/');await request('/clinician');await request('/guardian');
 const config=await request('/api/config');report.readiness=config.data;
 const clinician=await request('/api/portal/session',{body:{role:'clinician',accessCode:secrets.CLINICIAN_PORTAL_CODE}});
 const guardian=await request('/api/portal/session',{body:{role:'guardian',accessCode:secrets.GUARDIAN_PORTAL_CODE}});
 const sessionId=randomUUID(),app=await request('/api/app-session',{body:{sessionId}});
 const visit={visitId:'adult-deployment-check',revision:0,source:'local'},createdAt=new Date().toISOString();
 const common={schemaVersion:1,sessionId,createdAt,visit,procedureId:'stethoscope',round:1,assessmentValidated:false,audience:'adult_test',guardianConfirmed:true};
 await request('/api/learning-log',{cookie:app.cookie,body:{...common,eventId:randomUUID(),eventType:'question',role:'child',text:'[성인 배포 테스트] 청진기로 어떤 소리를 들어?'}});
 await request('/api/learning-log',{cookie:app.cookie,body:{...common,eventId:randomUUID(),eventType:'answer',role:'assistant',text:'청진기는 몸속 소리를 들어 보는 도구야.'}});
 const summary=await request('/api/session-summary',{cookie:app.cookie,body:{sessionId,eventId:randomUUID(),createdAt,visit,audience:'adult_test',guardianConfirmed:true,activityEvents:[{schemaVersion:1,sequence:1,elapsedMs:1000,procedureId:'stethoscope',phase:'play',type:'tool_choice',toolId:'stethoscope',correct:true,assessment:'not_assessed'}]}});
 const c=await request('/api/portal/reports',{cookie:clinician.cookie}),g=await request('/api/portal/reports',{cookie:guardian.cookie});
 report.summary={model:'gpt-6-luna',generated:!!summary.data.report?.summary?.overview,sharedInBothRoles:c.data.reports.some(r=>r.sessionId===sessionId)&&g.data.reports.some(r=>r.sessionId===sessionId),assessmentValidated:summary.data.report.assessmentValidated};
 const wav=await request('/api/tts',{body:{text:'잘했어! 우리 같이 해냈다!'}});const bytes=new Uint8Array(wav.data);report.wav={riff:String.fromCharCode(...bytes.slice(0,4)),nonEmpty:bytes.length>44};
 if(!report.summary.sharedInBothRoles||report.wav.riff!=='RIFF')throw new Error('Incomplete cloud pipeline');
 report.ok=true;
}catch(error){report.ok=false;report.error=error.message;process.exitCode=1;}
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/cloud-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
