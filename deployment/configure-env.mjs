import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const cli=process.env.TORI_VERCEL_CLI;
if(!cli)throw new Error('Vercel CLI path required');
await mkdir('.data',{recursive:true});
let secrets;try{secrets=JSON.parse(await readFile('.data/deployment-secrets.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;secrets={CLINICIAN_PORTAL_CODE:randomBytes(18).toString('base64url'),GUARDIAN_PORTAL_CODE:randomBytes(18).toString('base64url'),TTS_AUTH_TOKEN:randomBytes(32).toString('base64url')};await writeFile('.data/deployment-secrets.json',JSON.stringify(secrets),{mode:0o600,flag:'wx'});}
const target=process.argv[2]||'game';
const values=target==='tts'?{TTS_AUTH_TOKEN:secrets.TTS_AUTH_TOKEN,TTS_VOICE:'F4',TTS_THREADS:'2'}:{OPENAI_API_KEY:process.env.OPENAI_API_KEY,OPENAI_MODEL:'gpt-6-luna',CLINICIAN_PORTAL_CODE:secrets.CLINICIAN_PORTAL_CODE,GUARDIAN_PORTAL_CODE:secrets.GUARDIAN_PORTAL_CODE,TTS_SERVICE_TOKEN:secrets.TTS_AUTH_TOKEN,TTS_URL:'https://tori-voice.vercel.app/tts'};
if(target==='game'&&!values.OPENAI_API_KEY)throw new Error('Existing OpenAI key missing');
for(const [key,value] of Object.entries(values)){
 const r=spawnSync(process.execPath,[cli,'env','add',key,'production','--force','--scope','seungmin0807-6829s-projects'],{cwd:target==='tts'?path.resolve('.data/deploy-tts'):process.cwd(),input:value,encoding:'utf8',windowsHide:true});
 if(r.status!==0){console.error(`${key}: configuration failed`);process.exit(1);}console.log(`${key}: configured`);
}
if(target==='game')await writeFile('.data/portal-access.txt',`의사 화면: https://tori-hospital.vercel.app/clinician\n접근 코드: ${secrets.CLINICIAN_PORTAL_CODE}\n\n보호자 화면: https://tori-hospital.vercel.app/guardian\n접근 코드: ${secrets.GUARDIAN_PORTAL_CODE}\n`,{mode:0o600});
