import {createHash,randomBytes} from 'node:crypto';
import {RequestError} from './voice-policy.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class AppSessionAccess{
  constructor(repository){this.repository=repository;}
  token(header=''){const parts=String(header).split(';').map(s=>s.trim()).filter(s=>s.startsWith('mori_app='));const token=parts.length===1?parts[0].slice(9):'';return /^[A-Za-z0-9_-]{43}$/.test(token)?token:null;}
  async bind(sessionId,header,secure=true){
    if(!UUID.test(sessionId||''))throw new RequestError(400,'INVALID_SESSION','놀이 기록 번호를 확인해 주세요.');
    const token=this.token(header)||randomBytes(32).toString('base64url'),owner=hash(token),key=`care/appsession/${sessionId}`;
    const prior=await this.repository.get(key);
    if(prior&&prior.owner!==owner)throw new RequestError(403,'SESSION_DENIED','다른 놀이의 기록에는 접근할 수 없어요.');
    if(!prior)await this.repository.put(key,{owner,createdAt:new Date().toISOString()});
    return`mori_app=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=28800${secure?'; Secure':''}`;
  }
  async require(sessionId,header){
    const token=this.token(header),prior=UUID.test(sessionId||'')?await this.repository.get(`care/appsession/${sessionId}`):null;
    if(!token||!prior||prior.owner!==hash(token))throw new RequestError(403,'SESSION_DENIED','이 브라우저의 놀이 기록만 보낼 수 있어요.');
  }
}
