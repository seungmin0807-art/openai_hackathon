import { procedures } from './procedures/index.js';
import { ProcedureGame } from './game-engine.js';
import { apiFetch } from './api-client.js';
import { TOUCH_CASES } from './touch-cases.js';
import {forCase,forRoomCase,ToolChallenge,CHILD_CASE_IDS} from './tool-challenges.js';
import {createClinicProcedure} from './clinic-procedures.js';
import {loadBlenderAnatomy} from './clinic-anatomy.js';
import {AuscultationGame,LISTEN_SITES} from './auscultation-game.js';
import {EarGame} from './ear-game.js';
import {VaccinationGame} from './vaccination-game.js';
import {TemperatureGame} from './temperature-game.js';
import {VoiceDialogue} from './voice-dialogue.js';
import {VoiceSession} from './voice-session.js';
import {isLegacyPromptEcho} from './transcript-policy.js';
import {NarrationCache} from './narration-cache.js';
import {speechSegments} from './speech-segments.js';
import {LearningJournal} from './learning-journal.js';
import {SessionReports} from './session-report.js';
import {VisitJourney,VISIT_PLANS} from './visit-plans.js';
import {VisitStateStore,DEFAULT_VISIT_STATE,VISIT_CONCERNS} from './visit-state.js';

const $ = id => document.getElementById(id);
const selected = {name:'토리',kind:'토끼 친구'};
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let context = 'stethoscope';
let config = { aiReady: false, ttsReady: false, childrenEnabled: false }, guardianConfirmed = false, audience = 'adult_test';
let busy = false, sessionOn = false;
let turnId = 0, speechEpoch=0, pendingConsentAction = null, chatRequest=null;
let manualSubmitting=false;
let voiceWanted=false,voiceConsentAsked=false,sessionStarting=false,voiceSession=null,voiceDialogue=null,speechKind=null,sessionStartEpoch=0,listeningEpoch=0,transcriptionRequest=null;
const narrationCache=new NarrationCache();
let learning=null;
const history = [], audio = new Audio();
let audioURL, outputContext, outputAnalyser, speechLevel = 0, speechRequest=null;
let chooserReady=false,chooser=null,challenge=null,pendingCase='stethoscope',choosingTools=true,selectionAudio;
let sceneReady=false,autoVoice=true,voiceUnlocked=false,narrationTimer,goalNarrating=false,goalQueue=[],lastNarration='',latestSubtitle='',flowEpoch=0,portraitBlocked=false;
const visitStore=new VisitStateStore({...DEFAULT_VISIT_STATE,plan:{presetId:'custom',steps:['stethoscope'],auscultation:{sites:['heart','breath-left','breath-right','bowel']}}});
const journey=new VisitJourney({id:'custom',steps:['stethoscope'],age:5});
const learningJournal=new LearningJournal({getContext:()=>({visit:{visitId:visitStore.snapshot.visitId,revision:visitStore.snapshot.revision,source:visitStore.snapshot.source},procedureId:context}),getConsent:()=>({audience,guardianConfirmed})});
const sessionReports=new SessionReports({getConsent:()=>({audience,guardianConfirmed}),onStatus:result=>{if($('report-status'))$('report-status').textContent=result.status==='sent'?'의사·보호자 화면에 놀이 요약을 보냈어요.':'놀이 요약을 보관 중이에요. 연결 후 다시 보낼게요.';}});

let characterStage=null,activeProcedure,activePhase,scene,sceneGeneration=0;
const gameProcedures=TOUCH_CASES.map(c=>({...procedures.find(p=>p.id===c.id),...c,prompt:c.hint,discovery:c.purpose}));
const game=new ProcedureGame(gameProcedures,renderGame,event=>window.dispatchEvent(new CustomEvent('mori:session-event',{detail:event})));
async function loadScene(p){
  ++sceneGeneration;scene?.destroy();scene=null;sceneReady=false;chooser?.setProcedure(null);activePhase=null;
}
function updateScene(phase){activePhase=phase;}
function closeGameMenu(){$('procedure-menu').hidden=true;$('choose-game').setAttribute('aria-expanded','false');}
$('choose-game').addEventListener('click',()=>{const open=$('procedure-menu').hidden;$('procedure-menu').hidden=!open;$('choose-game').setAttribute('aria-expanded',String(open));});
window.addEventListener('keydown',e=>{if(e.key==='Escape')closeGameMenu();});
procedures.forEach(p=>{const b=document.createElement('button');b.className='procedure-tile';b.dataset.procedure=p.id;b.innerHTML=`<span class="procedure-icon" style="background:${p.color}28">${p.icon}</span><strong>${p.title}</strong><span class="tile-arrow">›</span>`;b.addEventListener('click',()=>{stopGameNarration();history.splice(0);startToolChoice(p.id);closeGameMenu();});$('procedure-list').append(b);});
function renderGame({procedure:p,phase,paused}){
  context=p.id;
  if(activeProcedure!==p.id){activeProcedure=p.id;loadScene(p);}updateScene(phase);$('character-stage').dataset.paused=String(paused||portraitBlocked);scene?.setPaused(paused||portraitBlocked||phase!=='play');
  document.querySelectorAll('[data-procedure]').forEach(b=>{const active=b.dataset.procedure===p.id;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
  $('procedure-title').textContent=p.icon+' '+p.title;
  $('pause-overlay').hidden=!paused;$('pause-button').textContent=paused?'다시 놀기 ▷':'잠깐 쉬기 Ⅱ';
  $('result-effect').hidden=true;$('body-hint').hidden=true;
  const index=phase==='play'?0:phase==='result'?1:2;
  document.querySelectorAll('.step-dots li').forEach((li,i)=>{li.classList.toggle('active',i===index);li.classList.toggle('past',i<index);if(i===index)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');});
  const lines={play:p.prompt,result:p.discovery,check:'이건 왜 검사하는 걸까?',done:journey.snapshot.index+1<journey.snapshot.total?'다음 진찰도 같이 해 볼까?':'잘했어!'};
  if(p.id==='stethoscope'&&scene?.snapshot.complete){const kinds=[...new Set(scene.snapshot.required.map(id=>LISTEN_SITES[id].kind))];lines.result=kinds.length===1?({heart:'청진기로 심장이 뛰는 소리를 듣는 거였구나!',breath:'청진기로 숨이 드나드는 소리를 듣는 거였구나!',bowel:'청진기로 배 속 장 소리를 듣는 거였구나!'})[kinds[0]]:'청진기는 심장·숨·장처럼 몸속 소리를 듣는 도구야!';}
  if(phase!=='play'||sceneReady)setSubtitle(lines[phase]);$('game-actions').replaceChildren();
  if(phase==='done'){const next=document.createElement('button');next.className='primary-button';next.textContent=journey.snapshot.index+1<journey.snapshot.total?'다음 진찰 →':'다시 하기 ↻';next.disabled=paused;next.addEventListener('click',nextVisitStep);$('game-actions').append(next);}
  if(phase==='check'){const end=document.createElement('button');end.className='secondary-button';end.textContent='놀이 마치기';end.disabled=paused;end.addEventListener('click',()=>finishLearning('skipped','choice'));$('game-actions').append(end);}
  if($('clinic-pause'))$('clinic-pause').textContent=paused?'다시 놀기 ▷':'잠깐 쉬기 Ⅱ';chooser?.setPaused(paused||portraitBlocked);scene?.setPaused(paused||portraitBlocked||phase!=='play');
  $('read-button').disabled=paused;$('voice-button').disabled=paused;
  $('wave-button').disabled=paused;$('sample-button').disabled=paused;$('question-button').disabled=paused;reconcileVoice();
}
function setSubtitle(text,narrate=true){
  latestSubtitle=text;
  const canNarrate=narrate&&!voiceWanted&&!portraitBlocked&&autoVoice&&voiceUnlocked&&(config.ttsReady||narrationCache.lookup(text))&&!busy&&!game.state.paused;
  // Spoken captions belong to the playing utterance, not the newest game event.
  if(!canNarrate){if(!goalNarrating&&speechKind!=='goal')$('subtitle').textContent=text;return;}
  if(text===lastNarration||goalQueue.some(item=>item.text===text))return;
  goalQueue.push({text,epoch:flowEpoch});
  if(goalQueue.length>6)goalQueue.splice(0,goalQueue.length-6);
  if(!goalNarrating){clearTimeout(narrationTimer);narrationTimer=setTimeout(drainGoalQueue,narrationCache.lookup(text)?0:250);}
}
async function drainGoalQueue(){
  if(goalNarrating||busy||voiceWanted||voiceBlocked()||!autoVoice)return;
  const item=goalQueue.shift();if(!item)return;
  if(item.epoch!==flowEpoch){void drainGoalQueue();return;}
  goalNarrating=true;lastNarration=item.text;const id=++turnId;
  try{await speak(item.text,id);}catch{if(id===turnId&&item.epoch===flowEpoch)$('subtitle').textContent=item.text;}finally{
    goalNarrating=false;
    if(!goalQueue.length&&speechKind!=='goal')$('subtitle').textContent=latestSubtitle;
    if(id===turnId&&item.epoch===flowEpoch&&learning?.active&&item.text===learning.question){learning.questionAudioReady=true;startLearningCapture();}
    if(!busy&&!voiceWanted&&!voiceBlocked())void drainGoalQueue();
  }
}
function clearGoalQueue(){clearTimeout(narrationTimer);goalQueue=[];}

new ResizeObserver(entries=>{const h=entries[0].target.getBoundingClientRect().height;document.querySelector('.stage-wrap').style.bottom=`${Math.ceil(h)+42}px`;}).observe(document.querySelector('.game-hud'));
function showNotice(text){$('system-notice').hidden=!text;$('system-notice').textContent=text;if(text)$('system-notice').closest('details').open=true;}
function setState(mode,text){characterStage?.action(mode);$('character-state').textContent=text;}
function status(text){$('voice-status').textContent=text;$('voice-status').hidden=!text;}
function addMessage(role,text){$('conversation').replaceChildren();const el=document.createElement('p');el.className='message '+role;el.textContent=text;$('conversation').append(el);}
async function getJSON(url,options){const r=await apiFetch(url,options),data=await r.json();if(!r.ok)throw new Error(data.error||'연결을 확인해 주세요.');return data;}
async function loadConfig(){try{config=await getJSON('/api/config');if(!config.aiReady){$('system-notice').hidden=false;$('system-notice').textContent='음성 AI 질문은 API 키 연결 후 사용해요.';}else if(!config.ttsReady)showNotice('한국어 음성 서버를 켜 주세요.');}catch{showNotice('서버 연결을 확인해 주세요.');}}
loadConfig().then(()=>reconcileVoice());
$('pause-button').addEventListener('click',()=>{stopSession();game.pause();});
$('resume-button').addEventListener('click',()=>game.pause());
$('replay-button').addEventListener('click',()=>startToolChoice(context));
$('wave-button').addEventListener('click',()=>setState('wave','안녕!'));
$('read-button').addEventListener('click',async()=>{if(busy||voiceWanted||manualSubmitting)return;stopAudio();const id=++turnId;busy=true;try{await speak($('subtitle').textContent,id);}catch(e){showNotice(e.message);}finally{if(id===turnId)busy=false;}});
$('question-button').addEventListener('click',()=>requireConsent(()=>ask(`${game.state.procedure.title}는 왜 하는 거야?`)));
function requireConsent(action){if(guardianConfirmed){action();return;}pendingConsentAction=action;$('consent-title').textContent='같이 이야기할 준비 됐나요?';$('consent-copy').textContent='마이크 음성과 대화는 답변을 만들기 위해 AI 서비스에 전송돼요. 대화 글은 보호자·의사에게 보낼 기록으로 남아요.';$('consent-error').textContent='';$('consent-dialog').showModal();}
$('consent-start').addEventListener('click',event=>{if(!$('guardian-check').checked){event.preventDefault();$('consent-error').textContent='전송 안내를 확인해 주세요.';return;}if(!$('adult-test').checked&&!config.childrenEnabled){event.preventDefault();$('consent-error').textContent='지금은 성인 테스트만 열려 있어요. 실제 아동 사용에는 병원의 데이터 처리 설정이 필요해요.';return;}guardianConfirmed=true;audience=$('adult-test').checked?'adult_test':'child';});
$('consent-dialog').addEventListener('close',()=>{if($('consent-dialog').returnValue==='start'&&guardianConfirmed)pendingConsentAction?.();else if(voiceWanted)stopListening();pendingConsentAction=null;if(guardianConfirmed){learningJournal.flush().then(()=>sessionReports.flush());}reconcileVoice();});


async function speak(text,id,kind='goal',onCaption=null){
  const epoch=speechEpoch,controller=new AbortController();speechRequest=controller;speechKind=kind;
  const current=()=>id===turnId&&epoch===speechEpoch&&!controller.signal.aborted;
  const segments=kind==='answer'?speechSegments(text):[text];let caption='';
  status('목소리를 준비하고 있어요…');
  const prepare=async segment=>{try{
    const warmed=narrationCache.prepare(segment);if(warmed)return{blob:warmed};
    const cached=narrationCache.lookup(segment);
    const response=cached?await fetch(cached,{cache:'force-cache',signal:controller.signal}):await apiFetch('/api/tts',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({text:segment})});
    if(!response.ok){const error=await response.json();throw new Error(error.error||'목소리를 준비하지 못했어요.');}
    return {blob:await response.blob()};
  }catch(error){return {error};}};
  let pending=segments.length?prepare(segments[0]):null;
  try{for(let i=0;i<segments.length;i++){
    const prepared=await pending;if(!current())return;if(prepared.error)throw prepared.error;
    // Only one look-ahead request: bound work and overlap it with playback.
    pending=i+1<segments.length?prepare(segments[i+1]):null;
    if(audioURL)URL.revokeObjectURL(audioURL);audioURL=URL.createObjectURL(prepared.blob);audio.src=audioURL;
    if(!outputContext){outputContext=new AudioContext();const source=outputContext.createMediaElementSource(audio);outputAnalyser=outputContext.createAnalyser();outputAnalyser.fftSize=256;source.connect(outputAnalyser);outputAnalyser.connect(outputContext.destination);}await outputContext.resume();
    if(!current())return;voiceSession?.suspend();
    const onPlaying=()=>{if(!current())return;caption=[caption,segments[i]].filter(Boolean).join(' ');if(kind==='goal')$('subtitle').textContent=segments[i];onCaption?.(caption);voiceDialogue?.setState('speaking');setState('talk','말하는 중');status('설명을 듣고 있어요');};
    audio.addEventListener('playing',onPlaying,{once:true});
    try{const ended=new Promise(resolve=>{audio.onended=resolve;audio.onerror=resolve;audio._finish=resolve;});await audio.play();await ended;}finally{audio.removeEventListener('playing',onPlaying);audio._finish=null;}
  }}finally{controller.abort();if(speechRequest===controller)speechRequest=null;if(current()||id===turnId&&epoch===speechEpoch){speechKind=null;if(voiceWanted&&!portraitBlocked&&!game.state.paused)voiceSession?.resume();}}
  if(id===turnId&&epoch===speechEpoch){if(kind==='answer')voiceDialogue?.finishReply();if(!voiceWanted)voiceDialogue?.setState('muted');setState('idle','함께 있어!');status('토리에게 말하기를 누르면 이야기할 수 있어요');if(kind==='goal'&&learning?.active&&game.state.phase==='check'&&text===learning.question){learning.questionAudioReady=true;startLearningCapture();}}
}
function stopAudio(){speechEpoch++;speechRequest?.abort();speechRequest=null;speechKind=null;audio.pause();audio._finish?.();audio._finish=null;speechLevel=0;if(voiceWanted&&!voiceBlocked()&&!busy)voiceSession?.resume();}
$('sample-button').addEventListener('click',async()=>{if(busy||voiceWanted||manualSubmitting)return;stopAudio();const id=++turnId,text=game.state.procedure.purpose;setSubtitle(text);busy=true;$('sample-button').disabled=true;try{await speak(text,id);}catch(error){showNotice(error.message);}finally{busy=false;reconcileVoice();setState('idle','반가워!');}});
function beginLearning(){
  learning={active:true,completed:false,round:1,question:'이건 왜 검사하는 걸까?',lastSignal:null,needsQuestionAudio:busy,needsCompletionAudio:false,awaitingAnswer:true,questionAudioReady:!autoVoice||!voiceUnlocked};
  learningJournal.record({eventType:'question',round:1,role:'assistant',text:learning.question});game.check();
  if(learning.questionAudioReady)startLearningCapture();
}
function startLearningCapture(){
  if(!learning?.active||!learning.awaitingAnswer||!learning.questionAudioReady||game.state.phase!=='check'||busy||manualSubmitting||sessionStarting||voiceBlocked()||voiceWanted)return;
  learning.awaitingAnswer=false;void setVoiceEnabled(true);
}
function finishLearning(signal='understood',input='voice'){
  if(!learning?.active||game.state.phase!=='check')return;
  learning.active=false;learning.awaitingAnswer=false;learning.completed=true;learning.needsCompletionAudio=busy;learning.outcome=signal==='understood'?'ai_suggested_understood':'participated';
  learningJournal.record({eventType:'summary',round:learning.round,role:'system',text:signal==='understood'?'목적을 이야기하고 놀이를 마침':'목적을 함께 살펴보고 놀이를 마침',...(['understood','revisit','unclear'].includes(learning.lastSignal)?{signal:learning.lastSignal}:{})});
  game.answer(signal,input);const reportSession=learningJournal.snapshot.sessionId,reportVisit={visitId:visitStore.snapshot.visitId,revision:visitStore.snapshot.revision,source:visitStore.snapshot.source},reportEvents=game.summary().events;learningJournal.flush().then(()=>sessionReports.enqueue(reportSession,reportVisit,reportEvents));
}
async function ask(message,input='question'){
  if(busy||voiceWanted||manualSubmitting&&input!=='voice'||portraitBlocked||game.state.paused||!message.trim())return;
  busy=true;const id=++turnId,epoch=flowEpoch,lesson=learning,learningCheck=!!lesson?.active&&game.state.phase==='check'&&input==='voice';
  const controller=new AbortController();chatRequest=controller;
  clearGoalQueue();stopAudio();setState('listen','생각하는 중');status('궁금한 걸 알아보고 있어요');voiceDialogue?.clearReply();voiceDialogue?.showQuestion(message);voiceDialogue?.setState('processing');addMessage('user',message);
  learningJournal.record({eventType:learningCheck?'answer':'question',round:learningCheck?lesson.round:1,role:'child',text:message});
  try{
    const result=await getJSON('/api/chat',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({message,character:{name:selected.name,kind:selected.kind},context,history:history.slice(-6),audience,guardianConfirmed,learningCheck,...(learningCheck?{learningRound:lesson.round,question:lesson.question}:{})})});
    if(id!==turnId||epoch!==flowEpoch)return;
    history.push({role:'user',content:message},{role:'assistant',content:result.text.slice(0,1000)});history.splice(0,Math.max(0,history.length-6));
    let question='',completionSignal=null;
    if(learningCheck&&!result.handoff&&lesson===learning&&lesson.active){
      const round=lesson.round;lesson.lastSignal=result.signal||'unclear';learningJournal.record({eventType:'feedback',round,role:'assistant',text:result.text,signal:lesson.lastSignal});
      if(result.signal==='understood')completionSignal='understood';
      else if(round>=3)completionSignal='skipped';
      else{question=result.question||'이 도구로 무엇을 살펴봤지?';lesson.round++;lesson.question=question;lesson.awaitingAnswer=true;lesson.questionAudioReady=false;game.record('understanding_response',{signal:lesson.lastSignal,input:'voice',confidence:'unvalidated',round});learningJournal.record({eventType:'question',round:lesson.round,role:'assistant',text:question});}
    }
    const reply=[result.text,question].filter(Boolean).join(' ');if(!learningCheck||result.handoff)learningJournal.record({eventType:'answer',round:learningCheck?lesson.round:1,role:'assistant',text:reply});addMessage('assistant',reply);
    if(result.handoff){voiceWanted=false;voiceDialogue?.setEnabled(false);stopListening();}
    const speechId=turnId;try{await speak(reply,speechId,'answer',caption=>voiceDialogue?.showReply(caption));}catch(error){if(speechId===turnId){voiceDialogue?.showReply(reply);voiceDialogue?.finishReply();voiceDialogue?.setState('unavailable','대답은 글로 볼 수 있어');$('system-notice').textContent=error.message;}}
    if(question&&id===turnId&&epoch===flowEpoch&&lesson===learning)lesson.questionAudioReady=true;
    if(completionSignal&&id===turnId&&epoch===flowEpoch&&lesson===learning&&lesson.active)finishLearning(completionSignal);
  }catch(error){if(id===turnId){voiceDialogue?.setState('unavailable','연결이 잠깐 끊겼어');$('system-notice').textContent=error.message;}}
  finally{
    if(chatRequest===controller)chatRequest=null;
    if(id===turnId){busy=false;setState('idle','함께 있어!');if(epoch===flowEpoch&&learning?.completed&&learning.needsCompletionAudio&&!voiceBlocked()&&autoVoice){learning.needsCompletionAudio=false;const completion=latestSubtitle;lastNarration=completion;const praiseId=++turnId;try{await speak(completion,praiseId,'goal');}catch{}}else if(learning?.active&&learning.needsQuestionAudio&&!voiceBlocked()&&autoVoice){learning.needsQuestionAudio=false;const questionId=++turnId;try{await speak('이건 왜 검사하는 걸까?',questionId,'goal');}catch{}}
      if(voiceWanted&&!voiceBlocked())voiceSession?.resume();}
  }
}
document.querySelectorAll('[data-question]').forEach(button=>button.addEventListener('click',()=>requireConsent(()=>ask(button.dataset.question))));

function voiceBlocked(){return portraitBlocked||game.state.paused;}
async function beginSession(){
  if(!voiceWanted||sessionOn||sessionStarting||voiceBlocked()||!config.aiReady||!guardianConfirmed)return;
  const attempt=++sessionStartEpoch;sessionStarting=true;voiceDialogue?.setBusy(true);try{const started=await voiceSession.start();if(attempt!==sessionStartEpoch)return;if(!voiceWanted||voiceBlocked()){voiceSession.stop();sessionOn=false;return;}sessionOn=started;if(started)learningJournal.flush();if(started&&!audio.paused)voiceSession.suspend();if(!started){voiceWanted=false;voiceDialogue.setEnabled(false);voiceDialogue.setState('unavailable','마이크를 연결하지 못했어');}}
  finally{if(attempt===sessionStartEpoch){sessionStarting=false;reconcileVoice();}}
}
function reconcileVoice(){
  if(!voiceDialogue||!voiceSession)return;
  const captureOpen=voiceWanted||manualSubmitting||sessionStarting;
  $('read-button').disabled=voiceBlocked()||busy||captureOpen;
  $('sample-button').disabled=voiceBlocked()||busy||captureOpen;
  $('question-button').disabled=voiceBlocked()||busy||captureOpen;
  if(voiceDialogue.enabled!==voiceWanted)voiceDialogue.setEnabled(voiceWanted);
  voiceDialogue.setBusy(busy||manualSubmitting||sessionStarting||voiceBlocked());
  if(voiceBlocked()&&(sessionOn||sessionStarting||manualSubmitting)){stopSession();voiceDialogue.setState('muted','잠깐 쉬는 중');}
}
async function setVoiceEnabled(start){
  if(busy||manualSubmitting||sessionStarting||voiceBlocked()){reconcileVoice();return;}
  if(start){
    if(!config.aiReady){voiceDialogue?.setEnabled(false);voiceDialogue?.setState('unavailable','이야기 연결을 확인해 줘');return;}
    voiceDialogue?.cancelReplyHide();voiceWanted=true;clearGoalQueue();stopAudio();
    requireConsent(()=>beginSession());reconcileVoice();return;
  }
  const inputEpoch=listeningEpoch;
  voiceWanted=false;manualSubmitting=true;busy=true;voiceDialogue?.setEnabled(false);voiceDialogue?.setBusy(true);voiceDialogue?.setState('processing');
  try{
    const result=await voiceSession.submit();
    if(inputEpoch!==listeningEpoch)return;
    if(['no_speech','not_recording','audio_too_large'].includes(result?.status)){voiceDialogue?.clearReply();voiceDialogue?.setState('idle',result.status==='audio_too_large'?'짧게 나눠서 말해 줄래?':'버튼을 누르고 다시 말해 줘');}
  }catch(error){if(inputEpoch===listeningEpoch){voiceDialogue?.setState('unavailable','잠깐 연결을 확인할게');$('system-notice').textContent=error.message;}}
  finally{if(inputEpoch===listeningEpoch){voiceWanted=false;manualSubmitting=false;sessionOn=false;busy=false;voiceDialogue?.setBusy(false);reconcileVoice();startLearningCapture();}}
}
async function handleUtterance(blob,capture={}){
  if(capture.truncated){voiceDialogue?.clearReply();voiceDialogue?.setState('listening','짧게 나눠서 다시 말해 줘');return;}
  if(!manualSubmitting||voiceBlocked())return;const id=++turnId,inputEpoch=listeningEpoch,controller=new AbortController();transcriptionRequest=controller;busy=true;voiceDialogue?.setState('processing');
  const inputSignal=capture.signal?AbortSignal.any([controller.signal,capture.signal]):controller.signal;
  try{const result=await getJSON(`/api/transcribe?audience=${audience}&guardianConfirmed=${guardianConfirmed}`,{method:'POST',signal:inputSignal,headers:{'Content-Type':blob.type.split(';')[0]||'audio/webm'},body:blob});if(id!==turnId||inputEpoch!==listeningEpoch||!manualSubmitting||voiceBlocked()||capture.isCurrent&&!capture.isCurrent())return;transcriptionRequest=null;busy=false;if(result.status==='rejected'||!result.text||isLegacyPromptEcho(result.text)){voiceDialogue?.clearReply();voiceDialogue?.setState('listening',result.status==='rejected'||result.text?'다시 짧게 말해 줄래?':'듣고 있어!');return;}await ask(result.text,'voice');}
  catch(error){if(id===turnId&&inputEpoch===listeningEpoch&&!inputSignal.aborted){voiceDialogue?.setState('unavailable','잠깐 연결을 확인할게');$('system-notice').textContent=error.message;}}
  finally{if(transcriptionRequest===controller)transcriptionRequest=null;if(id===turnId&&inputEpoch===listeningEpoch)busy=false;}
}
// Input and output have separate lifetimes: muting the mic must not cancel Tori.
function stopListening(){voiceWanted=false;manualSubmitting=false;++listeningEpoch;++sessionStartEpoch;sessionStarting=false;sessionOn=false;if(transcriptionRequest){transcriptionRequest.abort();transcriptionRequest=null;busy=false;}voiceSession?.stop();}
function stopSession(){stopListening();chatRequest?.abort();chatRequest=null;turnId++;busy=false;clearGoalQueue();stopAudio();setState('idle','함께 있어!');}
function stopGameNarration(){clearGoalQueue();if(speechKind!=='answer')stopAudio();}
$('voice-button').addEventListener('click',()=>setVoiceEnabled(!voiceWanted));
window.addEventListener('pagehide',()=>{voiceWanted=false;stopSession();scene?.destroy();learningJournal.destroy();if(audioURL)URL.revokeObjectURL(audioURL);});

const bars=[...$('voice-bars').children];
function animate(t){
  if(outputAnalyser&&!audio.paused){const data=new Uint8Array(outputAnalyser.frequencyBinCount);outputAnalyser.getByteFrequencyData(data);speechLevel=data.reduce((a,b)=>a+b,0)/data.length/160;}else speechLevel=0;
  bars.forEach((bar,i)=>bar.style.height=`${6+Math.min(1,speechLevel)*20*(.55+.45*Math.sin(t/100+i))}px`);requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
function selectionSound(correct){try{selectionAudio??=new AudioContext();selectionAudio.resume().then(()=>{const c=selectionAudio,o=c.createOscillator(),g=c.createGain(),t=c.currentTime;o.type=correct?'sine':'triangle';o.frequency.setValueAtTime(correct?450:240,t);o.frequency.exponentialRampToValueAtTime(correct?950:190,t+.17);g.gain.setValueAtTime(.045,t);g.gain.exponentialRampToValueAtTime(.0001,t+.22);o.connect(g);g.connect(c.destination);o.start();o.stop(t+.23);});}catch{}}
function startToolChoice(id){stopSession();voiceDialogue?.clearReply();learning=null;lastNarration='';++flowEpoch;stopGameNarration();pendingCase=id;activeProcedure=null;game.select(id);document.body.dataset.toolChoice='true';$('clinic-unavailable').hidden=CHILD_CASE_IDS.includes(id);if(!CHILD_CASE_IDS.includes(id)){choosingTools=false;challenge=null;chooser?.setPaused(true);setSubtitle('이번 검사는 선생님과 함께 확인하자!');showNotice('이 진찰 놀이는 아직 준비 중이에요. 의사에게 받은 순서는 임의로 바꾸지 않았어요.');updateVisitLabel();return;}choosingTools=true;challenge=new ToolChallenge(id,()=>{},{allTools:true});$('tool-selection').hidden=!chooserReady;if(chooserReady)chooser.show(forRoomCase(id));setSubtitle(forCase(id).prompt);updateVisitLabel();enforceLandscape();}
async function enterExamination({toolId,caseId}){if(caseId!==pendingCase||!challenge.select(toolId).correct)return;choosingTools=false;game.record('tool_choice',{toolId,correct:true,assessment:'not_assessed'});selectionSound(true);setSubtitle('맞아! 선생님이 도구를 가져오신다.');const epoch=flowEpoch;
 const sites=visitStore.snapshot.plan.auscultation?.sites||['heart','breath-left','breath-right'];
 const started=await chooser.beginExam({caseId,targetRegion:caseId==='temperature'?'arm':caseId==='abdomen'?'abdomen':caseId==='stethoscope'&&sites.every(id=>id==='bowel')?'abdomen':undefined,onRegion:({part,correct})=>{if(epoch!==flowEpoch)return;game.record('body_region_choice',{part,correct,assessment:'not_assessed'});selectionSound(correct);setSubtitle(correct?'찾았다! 가까이에서 같이 살펴보자.':'내가 불편한 곳을 다시 찾아볼까?');},onReady:async ctx=>{if(epoch!==flowEpoch)return;scene?.destroy();const anatomy=['stethoscope','vaccination','temperature','abdomen'].includes(caseId)?null:await loadBlenderAnatomy(caseId);if(epoch!==flowEpoch)return;const options={...ctx,caseId,anatomy,reducedMotion,onHint:text=>setSubtitle(text),onEvent:event=>{if(epoch!==flowEpoch)return;if(event.type==='sound'){game.record('auscultation_sound',{siteId:event.siteId,soundKind:event.soundKind,source:event.source});}if(event.type==='check')game.record('observation_checked',{targetId:event.targetId,soundKind:event.soundKind,input:'3d_touch',assessment:'not_assessed'});if(event.type==='stage')game.record('gesture_stage',{stage:event.stage,input:'3d_touch'});if(event.type==='complete'){game.act('3d_touch');beginLearning();}}};scene=caseId==='stethoscope'?new AuscultationGame({...options,sites}):caseId==='ear'?new EarGame(options):caseId==='vaccination'?new VaccinationGame(options):caseId==='temperature'?new TemperatureGame(options):createClinicProcedure(options);chooser.setProcedure(scene);const focused=caseId==='stethoscope'?await chooser.focusPatientExam({lookAt:ctx.regions.chest,includeAbdomen:true}):['vaccination','temperature','abdomen'].includes(caseId)?await chooser.focusPatientExam({lookAt:scene.target,includeAbdomen:caseId==='abdomen'}):await chooser.focusAnatomy(scene.group,{lookAt:ctx.anchor,size:3.5});if(!focused||epoch!==flowEpoch)return;sceneReady=true;scene.begin();enforceLandscape();}});
 if(started&&epoch===flowEpoch)setSubtitle(({throat:'목이 간질간질해! 어디를 살펴볼까?',temperature:'몸이 으슬으슬! 온도는 어디에서 볼까?',stethoscope:sites.every(id=>id==='bowel')?'꾸르륵! 배 속 소리는 어디에서 들릴까?':'가슴에서 소리를 들어 보자! 어디일까?',ear:'귀가 불편해! 어디일까?',nose:'코가 답답해! 같이 찾아볼까?',abdomen:'배가 불편해! 어디일까?'})[caseId]||'이번에는 어디를 살펴볼까?');
}
async function initializeChooser(){try{const {ToolSelector,preloadMedicalTools}=await import('./tool-selector.js');await Promise.all([preloadMedicalTools(),narrationCache.preload()]);chooser=new ToolSelector($('tool-selection'),{reducedMotion,onWrong:({toolId,caseId})=>{if(caseId!==pendingCase)return;challenge.select(toolId);game.record('tool_choice',{toolId,correct:false,assessment:'not_assessed'});selectionSound(false);setSubtitle('음, 이번 도구는 다른 곳에 쓰나 봐!');},onCorrect:enterExamination});await chooser.setPeople({patient:{src:'/assets/clinic/patient.glb',height:2.4},doctor:{src:'/assets/clinic/doctor.glb',height:3}});chooserReady=true;startToolChoice(pendingCase);}catch(e){showNotice('3D 진료실을 준비하지 못했어요. '+e.message);}}
function nextVisitStep(){stopGameNarration();const next=journey.finishStep(context);if(next)startToolChoice(next);else{journey.reset();learningJournal.resetSession();game.events=[];game.sequence=0;game.startedAt=Date.now();voiceDialogue?.clearReply();startToolChoice(journey.current.caseId);}}
function updateVisitLabel(){if($('visit-progress'))$('visit-progress').textContent=`${journey.snapshot.index+1} / ${journey.snapshot.total}`;}
window.MORI_PREVIEW={game,get context(){return context;},get touch(){return scene?.snapshot;},get voice(){return{wanted:voiceWanted,session:voiceSession?.snapshot,dialogue:voiceDialogue?.snapshot,submitting:manualSubmitting,speaking:!audio.paused&&speechKind==='answer',audio:{playing:!audio.paused,kind:speechKind,currentTime:audio.currentTime,duration:Number.isFinite(audio.duration)?audio.duration:null}};},get learning(){return learning?{...learning}:null;},get learningLog(){return learningJournal.snapshot;},get selector(){return chooser?.snapshot;},get challenge(){return challenge?.snapshot();},get choosingTools(){return choosingTools;},get characterCount(){return 2;},get procedureCount(){return procedures.length;},get visit(){return visitStore.snapshot;},get journey(){return journey.snapshot;},applyClinicianState:applyClinicianVisit,sessionSummary:()=>game.summary()};
const requestedCase=new URL(location.href).searchParams.get('case');if(CHILD_CASE_IDS.includes(requestedCase)){pendingCase=requestedCase;journey.selectStepOnly(requestedCase);}
setupClinicUI();narrationCache.preload().then(()=>{if(voiceUnlocked)setSubtitle(latestSubtitle);});initializeChooser();loadVisit();

function setupClinicUI(){
 voiceDialogue=new VoiceDialogue({mount:$('mori-app'),enabled:voiceWanted,onToggle:setVoiceEnabled});voiceSession=new VoiceSession({manualMode:true,onUtterance:handleUtterance,onState:(mode,text)=>{if(['recording','ready'].includes(mode)&&!manualSubmitting){voiceWanted=true;voiceDialogue.setEnabled(true);}if(!voiceBlocked()&&audio.paused)voiceDialogue.setState(mode,text);reconcileVoice();},onError:error=>{if(!voiceSession.active){sessionOn=false;voiceWanted=false;voiceDialogue.setEnabled(false);}voiceDialogue.setState('unavailable','마이크를 연결하지 못했어');$('system-notice').textContent=error.message;}});$('voice-button').style.display='none';
 const css=document.createElement('link');css.rel='stylesheet';css.href='/clinic-ui.css';document.head.append(css);
 const root=$('mori-app'),hud=document.querySelector('.game-hud');hud.classList.add('clinic-dialogue');root.append(hud);
 const rotate=document.createElement('div');rotate.id='landscape-guide';rotate.hidden=true;rotate.setAttribute('role','status');rotate.innerHTML='<div class="rotate-phone" aria-hidden="true">↻</div><p>휴대폰을 가로로 돌려줘!</p>';root.append(rotate);
 const unavailable=document.createElement('div');unavailable.id='clinic-unavailable';unavailable.hidden=true;unavailable.setAttribute('role','status');unavailable.innerHTML='<p>이번 진찰 놀이는 준비 중이야.<br>어른과 함께 확인해 보자!</p>';root.append(unavailable);
 const avatar=document.createElement('img');avatar.id='dialogue-portrait';avatar.src='/assets/clinic/patient-portrait.png';avatar.alt='말하고 있는 토끼 친구 토리';avatar.className='dialogue-portrait';hud.prepend(avatar);
 const name=document.createElement('strong');name.className='dialogue-name';name.textContent='토리';hud.prepend(name);
 const header=document.querySelector('.app-header');header.classList.add('clinic-toolbar');const old=$('choose-game'),stateButton=old.cloneNode(false);stateButton.textContent='아이 상태와 진찰 순서';stateButton.className='secondary-button';stateButton.removeAttribute('aria-expanded');stateButton.setAttribute('aria-haspopup','dialog');old.replaceWith(stateButton);document.querySelector('.settings-sheet').prepend(stateButton);stateButton.addEventListener('click',()=>{document.querySelector('.adult-options').open=false;fillVisitForm();$('visit-dialog').showModal();});
 const progress=document.createElement('span');progress.id='visit-progress';header.insertBefore(progress,$('pause-button'));updateVisitLabel();
 root.append(document.querySelector('.adult-options'));root.append($('pause-overlay'));
 const reportStatus=document.createElement('p');reportStatus.id='report-status';reportStatus.textContent='놀이를 마치면 의사·보호자 화면에 요약을 보냅니다.';document.querySelector('.settings-sheet').append(reportStatus);const retryReports=document.createElement('button');retryReports.textContent='놀이 요약 다시 보내기';retryReports.addEventListener('click',()=>requireConsent(()=>learningJournal.flush().then(()=>sessionReports.flush())));document.querySelector('.settings-sheet').append(retryReports);const voiceToggle=document.createElement('button');voiceToggle.className='secondary-button';voiceToggle.textContent='진찰 안내 읽기 켜짐 ♪';voiceToggle.addEventListener('click',()=>{autoVoice=!autoVoice;voiceToggle.textContent=autoVoice?'진찰 안내 읽기 켜짐 ♪':'진찰 안내 읽기 꺼짐';if(!autoVoice){stopGameNarration();}else setSubtitle(latestSubtitle);});document.querySelector('.settings-sheet').prepend(voiceToggle);
 const dialog=document.createElement('dialog');dialog.id='visit-dialog';dialog.setAttribute('aria-labelledby','visit-heading');dialog.innerHTML='<form id="visit-form" class="visit-form"><h2 id="visit-heading">아이 상태와 진찰 순서</h2><p id="visit-source"></p><div class="visit-fields"><label>별명<input id="visit-nickname" maxlength="20" required></label><label>나이<input id="visit-age" type="number" min="2" max="12" required></label></div><fieldset><legend>지금 어떤 상태인가요?</legend><div id="visit-concerns"></div></fieldset><label>놀이 상황<select id="visit-preset"></select></label><fieldset><legend>진찰 순서</legend><div id="visit-steps"></div></fieldset><p id="visit-error" role="alert"></p><div class="visit-form-actions"><button id="visit-revert" type="button">의사 정보로 되돌리기</button><button id="visit-cancel" type="button">닫기</button><button type="submit" class="primary-button">적용</button></div></form>';root.append(dialog);
 const labels={cough:'기침',fever:'열',throat:'목 불편',ear:'귀 불편',nose:'코 불편',belly:'배 불편',vaccination:'예방접종',checkup:'몸 확인'};
 VISIT_CONCERNS.forEach(id=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=id;label.append(input,labels[id]);$('visit-concerns').append(label);});
 VISIT_PLANS.filter(p=>p.steps.every(id=>CHILD_CASE_IDS.includes(id))).forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.title;$('visit-preset').append(o);});const custom=document.createElement('option');custom.value='custom';custom.textContent='직접 정한 순서';$('visit-preset').append(custom);
 TOUCH_CASES.filter(p=>CHILD_CASE_IDS.includes(p.id)).forEach(p=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=p.id;label.append(input,p.title);$('visit-steps').append(label);});
 const listens=document.createElement('fieldset');listens.innerHTML='<legend>이번에 들어 볼 청진 부위</legend><div id="visit-listen-sites"></div>';$('visit-steps').closest('fieldset').after(listens);Object.entries(LISTEN_SITES).forEach(([id,s])=>{const label=document.createElement('label'),i=document.createElement('input');i.type='checkbox';i.value=id;label.append(i,s.name);$('visit-listen-sites').append(label);});
 $('visit-preset').addEventListener('change',()=>{const p=VISIT_PLANS.find(v=>v.id===$('visit-preset').value);if(p)document.querySelectorAll('#visit-steps input').forEach(i=>i.checked=p.steps.includes(i.value));});
 $('visit-cancel').addEventListener('click',()=>dialog.close());$('visit-revert').addEventListener('click',()=>{visitStore.revertToClinician();syncVisit();fillVisitForm();});
 $('visit-form').addEventListener('submit',e=>{e.preventDefault();try{const checked=[...document.querySelectorAll('#visit-steps input:checked')].map(i=>i.value),current=visitStore.snapshot.plan.steps,steps=[...current.filter(id=>checked.includes(id)),...checked.filter(id=>!current.includes(id))];visitStore.applyLocal({child:{nickname:$('visit-nickname').value,age:Number($('visit-age').value)},concerns:[...document.querySelectorAll('#visit-concerns input:checked')].map(i=>i.value),plan:{presetId:$('visit-preset').value,steps,...(steps.includes('stethoscope')?{auscultation:{sites:[...document.querySelectorAll('#visit-listen-sites input:checked')].map(i=>i.value)}}:{})}});syncVisit();dialog.close();}catch(e){$('visit-error').textContent=e.message;}});
 document.addEventListener('pointerdown',()=>{voiceUnlocked=true;setSubtitle(latestSubtitle);},{once:true});
 window.addEventListener('message',e=>{if(e.origin!==location.origin||e.data?.type!=='clinic:visit-state')return;try{applyClinicianVisit(e.data.state);}catch(e){showNotice(e.message);}});
 window.addEventListener('resize',enforceLandscape);enforceLandscape();
}
function enforceLandscape(){const blocked=innerHeight>innerWidth&&(matchMedia('(pointer:coarse)').matches||innerWidth<=600);if(blocked&&!portraitBlocked){stopSession();}portraitBlocked=blocked;if($('landscape-guide'))$('landscape-guide').hidden=!blocked;const paused=blocked||game.state.paused||!CHILD_CASE_IDS.includes(pendingCase);chooser?.setPaused(paused);scene?.setPaused(paused||game.state.phase!=='play');reconcileVoice();}
function fillVisitForm(){const s=visitStore.snapshot;$('visit-nickname').value=s.child.nickname;$('visit-age').value=s.child.age;$('visit-preset').value=s.plan.presetId;$('visit-error').textContent='';$('visit-source').textContent=visitStore.hasLocalOverride?'앱에서 수정한 상태예요.':s.source==='clinician'?'의사 서버에서 받은 상태예요.':'체험용 상태예요. 앱에서 바꿀 수 있어요.';$('visit-revert').disabled=!visitStore.clinicianState;document.querySelectorAll('#visit-concerns input').forEach(i=>i.checked=s.concerns.includes(i.value));document.querySelectorAll('#visit-steps input').forEach(i=>i.checked=s.plan.steps.includes(i.value));document.querySelectorAll('#visit-listen-sites input').forEach(i=>i.checked=s.plan.auscultation?.sites.includes(i.value));}
function syncVisit(){const s=visitStore.snapshot;learningJournal.resetSession();game.events=[];game.sequence=0;game.startedAt=Date.now();journey.choosePlan({id:s.plan.presetId,steps:s.plan.steps,age:s.child.age});pendingCase=journey.current.caseId;if(chooserReady)startToolChoice(pendingCase);else updateVisitLabel();}
function applyClinicianVisit(data){const previous=visitStore.clinicianState;const next=visitStore.applyClinician(data),accepted=visitStore.clinicianState;if(previous?.visitId!==accepted?.visitId||previous?.revision!==accepted?.revision)syncVisit();return next;}
async function loadVisit(){try{const data=await getJSON('/api/visit-state');if(requestedCase)return;if(data.state?.source==='clinician')visitStore.applyClinician(data.state);else if(data.state)visitStore.applyLocal({child:data.state.child,concerns:data.state.concerns,plan:data.state.plan});syncVisit();}catch{/* The local educational state remains editable when the provider is unavailable. */}}
