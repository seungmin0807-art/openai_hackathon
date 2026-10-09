import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {normalizeVisitState,DEFAULT_VISIT_STATE} from './public/visit-state.js';
import {LearningLogStore} from './learning-log-store.mjs';
import {CareRepository} from './care-repository.mjs';
import {CareReports} from './care-reports.mjs';
import {CareLearningStore} from './care-learning-store.mjs';
import {AppSessionAccess} from './app-session-access.mjs';
import {transcribeAudio, transcriptionModelFor} from './transcription-adapter.mjs';
import { RequestError, textField, validateAudience, validateChat, handoffFor, VOICE_INSTRUCTIONS, CONTEXT_PURPOSES, UNDERSTANDING_FORMAT, LEARNING_CHECK_INSTRUCTIONS } from './voice-policy.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.task': 'application/octet-stream', '.wasm': 'application/wasm' };
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const CORS_METHODS = ['GET', 'POST'];
const CORS_HEADERS = ['content-type', 'x-mori-audience', 'x-guardian-confirmed'];
function allowedOrigins(value = '') {
  return new Set(value.split(',').map(v => v.trim()).filter(Boolean).map(value => {
    let url; try { url = new URL(value); } catch { throw new Error('ALLOWED_ORIGINS must contain exact HTTPS origins, or loopback HTTP origins.'); }
    if (value.includes('*') || url.origin !== value || url.username || url.password || !(url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)))) throw new Error('ALLOWED_ORIGINS must contain exact HTTPS origins, or loopback HTTP origins; wildcards and paths are forbidden.');
    return value;
  }));
}
function privateTTSHosts(value = '') {
  const values = value.split(',').map(v => v.trim()).filter(Boolean);
  if (values.some(v => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(v))) throw new Error('TTS_ALLOWED_HOSTS accepts private service names only, for example tts; not domains, IP addresses, or wildcards.');
  return new Set(values);
}
function send(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
async function readBody(req, max) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > max) throw new RequestError(413, 'BODY_TOO_LARGE', '보낼 내용이 너무 커요. 더 짧게 다시 시도해 주세요.'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function jsonBody(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new RequestError(415, 'INVALID_CONTENT_TYPE', 'JSON 형식으로 보내 주세요.');
  try { return JSON.parse((await readBody(req, 128 * 1024)).toString('utf8')); } catch (e) { if (e instanceof RequestError) throw e; throw new RequestError(400, 'INVALID_JSON', '대화 형식을 다시 확인해 주세요.'); }
}
function originAllowed(req) {
  let base;
  try { base = new URL(`http://${req.headers.host}`); } catch { return false; }
  if (!LOCAL_HOSTS.has(base.hostname)) return false;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return false;
  if (req.headers.origin && req.headers.origin !== base.origin) return false;
  return !req.headers['sec-fetch-site'] || ['same-origin', 'none'].includes(req.headers['sec-fetch-site']);
}
function parseOutput(data) {
  if (data.status && data.status !== 'completed') throw new RequestError(502, 'INCOMPLETE_AI_RESPONSE', '답변을 끝내지 못했어요. 잠시 뒤 다시 말해 주세요.');
  const text = (data.output ?? []).filter(o => o.type === 'message' && o.role === 'assistant').flatMap(o => o.content ?? []).filter(c => c.type === 'output_text').map(c => c.text).join('\n').trim();
  if (!text || text.length > 2000) throw new RequestError(502, 'INVALID_AI_RESPONSE', '답변을 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  return text;
}
function validateReplyText(text) {
  if (typeof text !== 'string' || !text.trim() || text.trim().length > 120) throw new RequestError(502, 'INVALID_AI_RESPONSE', '짧은 답변을 읽지 못했어요. 다시 말해 주세요.');
  return text.trim();
}
function parseUnderstanding(text,round=1) {
  let result;
  try { result = JSON.parse(text); } catch { throw new RequestError(502, 'INVALID_LEARNING_RESPONSE', '말로 확인한 결과를 읽지 못했어요. 다시 말해 주세요.'); }
  if (!result || typeof result !== 'object' || Array.isArray(result) || Object.keys(result).some(k=>!['text','signal','question'].includes(k)) || !Object.hasOwn(result, 'text') || !['understood', 'revisit', 'unclear'].includes(result.signal) || (result.question!==undefined&&(typeof result.question!=='string'||result.question.trim().length>80))) throw new RequestError(502, 'INVALID_LEARNING_RESPONSE', '말로 확인한 결과가 올바르지 않아요. 다시 말해 주세요.');
  return { text: validateReplyText(result.text), signal: result.signal,question:result.signal==='understood'||round===3?'':(result.question??'').trim() };
}
export function createServer({ fetchImpl = fetch, env = process.env, rootDir = ROOT, rateLimit = 30,logStore,repository } = {}) {
  const separated = env.DEPLOYMENT_MODE === 'separated';
  const hosted=env.DEPLOYMENT_MODE==='vercel';
  const origins = allowedOrigins(env.ALLOWED_ORIGINS);
  if (separated && !origins.size) throw new Error('Separated mode requires ALLOWED_ORIGINS.');
  const serveStatic = env.SERVE_STATIC !== 'false';
  const ttsHosts = privateTTSHosts(env.TTS_ALLOWED_HOSTS);
  const key = env.OPENAI_API_KEY?.trim();
  const model = env.OPENAI_MODEL?.trim() || 'gpt-6-luna';
  const transcriptionModel = transcriptionModelFor(env.OPENAI_TRANSCRIBE_MODEL);
  // Luna supports none; explicit alternative models retain the former low effort.
  const reasoningEffort = /^gpt-6-luna(?:-|$)/.test(model) ? 'none' : 'low';
  const childrenEnabled = env.OPENAI_CHILD_DATA_APPROVED === 'true';
  const careRepository=repository||new CareRepository({env,directory:path.join(rootDir,'.data','care')});
  const care=new CareReports({repository:careRepository,env,fetchImpl});
  const appAccess=new AppSessionAccess(careRepository);
  const learningLogs=logStore||(hosted?new CareLearningStore(care):new LearningLogStore({directory:env.LEARNING_OUTBOX_DIR||path.join(rootDir,'.data','learning-outbox'),env,fetchImpl}));
  let clinicURL;
  if(env.CLINIC_VISIT_STATE_URL){clinicURL=new URL(env.CLINIC_VISIT_STATE_URL);if(clinicURL.username||clinicURL.password||!(clinicURL.protocol==='https:'||(clinicURL.protocol==='http:'&&LOCAL_HOSTS.has(clinicURL.hostname))))throw new Error('CLINIC_VISIT_STATE_URL requires HTTPS or loopback HTTP.');}
  let ttsURL;
  try { ttsURL = new URL(env.TTS_URL || 'http://127.0.0.1:8011/tts'); if (ttsURL.username || ttsURL.password || !((ttsURL.protocol==='https:'&&!!env.TTS_SERVICE_TOKEN)||(ttsURL.protocol==='http:'&&(LOCAL_HOSTS.has(ttsURL.hostname)||(separated&&ttsHosts.has(ttsURL.hostname)))))) ttsURL=null; } catch { ttsURL = null; }
  const windows = new Map();
  const upstream = (url, options, timeout = 45000) => fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeout) });
  async function ttsReady() {
    if (!ttsURL) return false;
    try { const r = await upstream(new URL('/health', ttsURL), {headers:env.TTS_SERVICE_TOKEN?{Authorization:`Bearer ${env.TTS_SERVICE_TOKEN}`}:{}} ,hosted?8000:1200); if (!r.ok) return false; const data = await r.json(); return data.ready === true || ['ok', 'ready'].includes(data.status); } catch { return false; }
  }
  function requireKey() { if (!key) throw new RequestError(503, 'MISSING_API_KEY', 'AI 연결을 위해 서버에 OpenAI API 키를 설정해 주세요. 아직 실제 AI 답변은 준비되지 않았어요.'); }
  const server=http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const apiRoute = url.pathname.startsWith('/api/');
      if(hosted){
        const origin=req.headers.origin,expected=`https://${req.headers.host}`;
        if(origin&&origin!==expected)throw new RequestError(403,'ORIGIN_DENIED','같은 앱 주소에서만 사용할 수 있어요.');
        if(req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))throw new RequestError(403,'ORIGIN_DENIED','같은 앱 주소에서만 사용할 수 있어요.');
      } else if (separated && apiRoute) {
        res.setHeader('Vary', 'Origin');
        const origin = req.headers.origin, acceptedOrigin = typeof origin === 'string' && origins.has(origin);
        const originlessLiveness = !origin && req.method === 'GET' && url.pathname === '/api/health';
        // Preserve loopback CLI inspection. Remote API requests require an allowed browser origin.
        const loopbackInspection = !origin && originAllowed(req);
        if (!acceptedOrigin && !originlessLiveness && !loopbackInspection) throw new RequestError(403, 'ORIGIN_DENIED', '허용된 프런트엔드 주소에서만 API를 사용할 수 있어요.');
        if (acceptedOrigin) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Access-Control-Expose-Headers', 'X-Audio-Duration, X-Generation-Seconds, X-Sample-Rate, X-Voice, Retry-After');
        }
      } else if (!originAllowed(req)) throw new RequestError(403, 'ORIGIN_DENIED', '이 컴퓨터의 같은 주소에서만 사용할 수 있어요.');
      if (apiRoute && req.method === 'OPTIONS' && separated) {
        const requestedMethod = req.headers['access-control-request-method'];
        const requestedHeaders = (req.headers['access-control-request-headers'] || '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
        if (!req.headers.origin || !origins.has(req.headers.origin) || !CORS_METHODS.includes(requestedMethod) || requestedHeaders.some(h => !CORS_HEADERS.includes(h))) throw new RequestError(403, 'PREFLIGHT_DENIED', '이 API 요청 방식은 허용되지 않았어요.');
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Mori-Audience, X-Guardian-Confirmed', 'Access-Control-Max-Age': '600', 'Cache-Control': 'no-store', 'Content-Length': '0' }); res.end(); return;
      }
      if (apiRoute) {
        const now = Date.now(), ip = hosted?(req.headers['x-forwarded-for']?.split(',')[0]||req.socket.remoteAddress):req.socket.remoteAddress; const w = windows.get(ip);
        const counter = !w || now - w.start > 60000 ? { start: now, count: 0 } : w; counter.count++; windows.set(ip, counter);
        if (counter.count > rateLimit) { res.setHeader('Retry-After', '60'); throw new RequestError(429, 'RATE_LIMITED', '조금 쉬었다가 다시 말해 주세요.'); }
      }
      if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { status: 'ok', prototype: true });
      if (req.method === 'GET' && url.pathname === '/api/config') return send(res, 200, { aiReady: !!key, ttsReady: await ttsReady(), childrenEnabled, model, transcriptionModel });
      if(req.method==='GET'&&url.pathname==='/api/visit-state'){
        const configured=await care.getCurrentVisit();
        if(configured)return send(res,200,{mode:'clinician',state:configured});
        if(!clinicURL)return send(res,200,{mode:'demo',state:normalizeVisitState({...DEFAULT_VISIT_STATE,plan:{presetId:'custom',steps:['stethoscope'],auscultation:{sites:['heart','breath-left','breath-right','bowel']}}})});
        let response;try{response=await upstream(clinicURL,{headers:{Accept:'application/json',...(env.CLINIC_SERVICE_TOKEN?{Authorization:`Bearer ${env.CLINIC_SERVICE_TOKEN}`}:{})}},8000);}catch{throw new RequestError(503,'CLINIC_UNAVAILABLE','의사 서버와 연결하지 못했어요. 앱에서 체험용 상태를 정할 수 있어요.');}
        if(!response.ok)throw new RequestError(503,'CLINIC_UNAVAILABLE','의사 서버의 방문 정보를 받지 못했어요.');
        let state;try{const data=await response.json();state=normalizeVisitState(data.state||data);if(state.source!=='clinician')throw new Error();}catch{throw new RequestError(502,'INVALID_VISIT_STATE','의사 서버의 방문 정보 형식을 확인해 주세요.');}
        return send(res,200,{mode:'clinician',state});
      }
      if (req.method === 'POST' && url.pathname === '/api/chat') {
        const data = await jsonBody(req), clean = validateChat(data); const urgent = handoffFor(clean.message);
        if (urgent) return send(res, 200, urgent);
        validateAudience(data, childrenEnabled); requireKey();
        const instructions = `${VOICE_INSTRUCTIONS}\n서버가 신뢰하는 현재 과정의 일반 목적: ${CONTEXT_PURPOSES[clean.context]}${clean.learningCheck ? `\n${LEARNING_CHECK_INSTRUCTIONS}` : ''}`;
        const input = { character: clean.character, context: clean.context, conversation: clean.history, message: clean.message };
        if(clean.learningCheck){input.learningRound=clean.learningRound;input.question=clean.question;}
        // Camera observations are absent from every conversation request.
        const payload = { model, store: false, reasoning: { effort: reasoningEffort }, max_output_tokens: 250, instructions, input: [{ role: 'user', content: JSON.stringify(input) }] };
        if (clean.learningCheck) payload.text = { format: UNDERSTANDING_FORMAT };
        const r = await upstream('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!r.ok) throw new RequestError(502, 'AI_UPSTREAM_ERROR', 'AI 연결에 문제가 있어요. API 키와 모델 이용 권한을 확인해 주세요.');
        const output = parseOutput(await r.json());
        return send(res, 200, { ...(clean.learningCheck ? parseUnderstanding(output,clean.learningRound) : { text: validateReplyText(output) }), handoff: false });
      }
      if(req.method==='POST'&&url.pathname==='/api/learning-log'){
        const data=await jsonBody(req);validateAudience(data??{},childrenEnabled);
        if(hosted)await appAccess.require(data.sessionId,req.headers.cookie);
        const result=await learningLogs.enqueue(data);if(!hosted)await care.recordLearningEvent(data);return send(res,202,result);
      }
      if(req.method==='POST'&&url.pathname==='/api/session-summary'){
        const data=await jsonBody(req);validateAudience(data??{},childrenEnabled);requireKey();
        await appAccess.require(data.sessionId,req.headers.cookie);
        return send(res,200,await care.summarize(data));
      }
      if(req.method==='POST'&&url.pathname==='/api/app-session'){
        const data=await jsonBody(req),cookie=await appAccess.bind(data.sessionId,req.headers.cookie,hosted||separated);res.setHeader('Set-Cookie',cookie);return send(res,200,{connected:true});
      }
      if(req.method==='POST'&&url.pathname==='/api/portal/session'){
        const result=await care.signIn(await jsonBody(req),{secure:hosted||separated});res.setHeader('Set-Cookie',result.cookie);return send(res,200,{role:result.role});
      }
      if(url.pathname.startsWith('/api/portal/')){
        const principal=await care.authenticate(req.headers.cookie);
        if(req.method==='GET'&&url.pathname==='/api/portal/reports')return send(res,200,await care.reports(principal));
        if(req.method==='GET'&&url.pathname==='/api/portal/visit')return send(res,200,await care.getVisit(principal));
        if(req.method==='POST'&&url.pathname==='/api/portal/visit'){const data=await jsonBody(req);return send(res,200,await care.setVisit(principal,data.visit,{expectedRevision:data.expectedRevision}));}
        throw new RequestError(404,'NOT_FOUND','화면 기능을 찾을 수 없어요.');
      }
      if (req.method === 'POST' && url.pathname === '/api/tts') {
        const data = await jsonBody(req); const text = textField(data?.text, '읽을 글', 600); const voice = data?.voice;
        if (voice !== undefined && (typeof voice !== 'string' || !/^[FM][1-5]$/.test(voice))) throw new RequestError(400, 'INVALID_VOICE', '목소리는 F1~F5 또는 M1~M5 중에서 선택해 주세요.');
        if (!ttsURL) throw new RequestError(503, 'TTS_UNAVAILABLE', '이 컴퓨터의 한국어 음성 서버를 먼저 켜 주세요.');
        let r;
        try { r = await upstream(ttsURL, { method: 'POST', headers: { 'Content-Type': 'application/json',...(env.TTS_SERVICE_TOKEN?{Authorization:`Bearer ${env.TTS_SERVICE_TOKEN}`}:{}) }, body: JSON.stringify({ text, ...(voice ? { voice } : {}) }) }, 60000); } catch { throw new RequestError(503, 'TTS_UNAVAILABLE', '한국어 음성 서버가 준비되지 않았어요. 글로 대화를 이어갈 수 있어요.'); }
        if (!r.ok || !r.body || !/audio\/(wav|x-wav)/i.test(r.headers.get('content-type') || '')) throw new RequestError(503, 'TTS_UNAVAILABLE', '한국어 음성을 만들지 못했어요. 음성 서버 상태를 확인해 주세요.');
        // The client also waits for a complete WAV. Finish reading before sending
        // headers so an upstream body timeout returns a normal error and cannot
        // emit a late unhandled error on a cancelled Node/Web stream adapter.
        let wave;
        try { wave = Buffer.from(await r.arrayBuffer()); } catch { throw new RequestError(503, 'TTS_UNAVAILABLE', '음성 연결이 잠시 끊겼어요. 글로 대화를 이어갈 수 있어요.'); }
        for (const header of ['X-Audio-Duration', 'X-Generation-Seconds', 'X-Sample-Rate', 'X-Voice']) { const value = r.headers.get(header); if (value) res.setHeader(header, value); }
        res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wave.length, 'Cache-Control': 'no-store' });
        res.end(wave); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/transcribe') {
        validateAudience({ audience: url.searchParams.get('audience') || req.headers['x-mori-audience'], guardianConfirmed: (url.searchParams.get('guardianConfirmed') || req.headers['x-guardian-confirmed']) === 'true' }, childrenEnabled);
        requireKey(); const type = req.headers['content-type']?.split(';')[0];
        if (!['audio/webm', 'audio/wav', 'audio/x-wav'].includes(type)) throw new RequestError(415, 'INVALID_AUDIO_TYPE', 'WebM 또는 WAV 녹음만 보낼 수 있어요.');
        const audio = await readBody(req, 5 * 1024 * 1024); if (!audio.length) throw new RequestError(400, 'EMPTY_AUDIO', '녹음이 비어 있어요.');
        const controller = new AbortController();
        const cancel = () => { if (!res.writableEnded) controller.abort(); };
        res.once('close', cancel);
        try {
          if (res.destroyed) controller.abort();
          const result = await transcribeAudio({audio, type, model: transcriptionModel, key, fetchImpl, signal: controller.signal});
          if (!res.destroyed) return send(res, 200, result);
          return;
        } finally { res.off('close', cancel); }
      }
      if (url.pathname.startsWith('/api/')) throw new RequestError(404, 'NOT_FOUND', '이 기능은 찾을 수 없어요.');
      if (!serveStatic) throw new RequestError(404, 'NOT_FOUND', 'API 전용 서버에는 정적 화면이 없어요.');
      if (!['GET', 'HEAD'].includes(req.method)) throw new RequestError(405, 'METHOD_NOT_ALLOWED', '이 요청 방식은 지원하지 않아요.');
      const decoded = decodeURIComponent(url.pathname);
      if (decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').some(part => part.startsWith('.') || part.includes(':'))) throw new RequestError(404, 'NOT_FOUND', '파일을 찾을 수 없어요.');
      const design = decoded.startsWith('/design/');
      if (design && !/^\/design\/[a-zA-Z0-9_-]+\.js$/.test(decoded)) throw new RequestError(404, 'NOT_FOUND', '파일을 찾을 수 없어요.');
      const base = path.resolve(rootDir, design ? 'design' : 'public');
      const relative = design ? decoded.slice('/design/'.length) : decoded === '/' ? 'index.html' : decoded==='/clinician'?'portal/clinician.html':decoded==='/guardian'?'portal/guardian.html':decoded.slice(1);
      const file = path.resolve(base, relative);
      if (!TYPES[path.extname(file)] || !file.startsWith(base + path.sep)) throw new RequestError(404, 'NOT_FOUND', '파일을 찾을 수 없어요.');
      let canonical;
      try { canonical = await realpath(file); const baseReal = await realpath(base); if (!canonical.startsWith(baseReal + path.sep) || !(await stat(canonical)).isFile()) throw new Error(); } catch { throw new RequestError(404, 'NOT_FOUND', '파일을 찾을 수 없어요.'); }
      const body = await readFile(canonical); res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)], 'Content-Length': body.length, 'Cache-Control': 'no-cache' }); res.end(req.method === 'HEAD' ? undefined : body);
    } catch (e) {
      if (res.headersSent) { res.destroy(); return; }
      const known = e instanceof RequestError;
      send(res, known ? e.status : 502, { code: known ? e.code : 'SERVICE_UNAVAILABLE', error: known ? e.message : '연결이 잠시 끊겼어요. 다시 시도해 주세요.' });
    }
  });
  let retryTimer;server.on('listening',()=>{retryTimer=setInterval(()=>learningLogs.retryPending().catch(()=>{}),30000);retryTimer.unref();});server.on('close',()=>clearInterval(retryTimer));
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1..65535');
  const server = createServer(); server.requestTimeout = 15000; server.headersTimeout = 10000;
  const host = process.env.HOST?.trim() || '127.0.0.1';
  if (process.env.DEPLOYMENT_MODE !== 'separated' && !['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('Non-loopback HOST requires DEPLOYMENT_MODE=separated and exact ALLOWED_ORIGINS.');
  server.listen(port, host, () => console.log(`Mori prototype listening on ${host}:${port}`));
}
