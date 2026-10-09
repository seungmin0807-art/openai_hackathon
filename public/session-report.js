import {apiFetch} from './api-client.js';
export async function bindAppSession(sessionId){
  const response=await apiFetch('/api/app-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId})});
  if(!response.ok)throw new Error('놀이 기록 연결을 확인해 주세요.');
}
export class SessionReports{
  constructor({getConsent,onStatus=()=>{}}){this.getConsent=getConsent;this.onStatus=onStatus;this.pending=new Map();this.running=null;}
  enqueue(sessionId,visit,events){
    this.pending.set(sessionId,{sessionId,visit:{...visit},activityEvents:events.map(e=>({...e})),eventId:crypto.randomUUID(),createdAt:new Date().toISOString()});
    return this.flush();
  }
  flush(){
    if(this.running)return this.running;
    if(!this.getConsent().guardianConfirmed)return Promise.resolve();
    this.running=this.send().finally(()=>{this.running=null;});return this.running;
  }
  async send(){for(const [id,record] of this.pending){
    try{await bindAppSession(id);const response=await apiFetch('/api/session-summary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...record,...this.getConsent()})});if(!response.ok)throw new Error();const result=await response.json();if(this.pending.get(id)===record)this.pending.delete(id);this.onStatus({status:'sent',report:result.report});}
    catch{this.onStatus({status:'pending'});break;}
  }}
}
