// Public endpoint configuration only. Access codes never enter URLs or storage.
const role = document.body.dataset.role;
const CASE_NAMES = { temperature:'체온 재기', stethoscope:'청진', ear:'귀 살펴보기', abdomen:'배 살펴보기', vaccination:'예방접종 알아보기' };
const CONCERNS = { cough:'기침', fever:'열', throat:'목 불편함', ear:'귀 불편함', nose:'코 불편함', belly:'배 불편함', vaccination:'예방접종', checkup:'몸 확인' };
const SITES = { heart:'심장', 'breath-left':'왼쪽 숨소리', 'breath-right':'오른쪽 숨소리', bowel:'장 소리' };
const ERRORS = { 401:'접근 코드를 확인하고 다시 연결해 주세요.', 403:'이 역할로는 화면을 이용할 수 없어요. 해당 역할의 코드로 연결해 주세요.', 409:'방문 정보가 바뀌었어요. 새로고침한 뒤 다시 저장해 주세요.', 429:'요청이 많아요. 잠시 뒤 다시 시도해 주세요.', 503:'지금은 서버에 연결할 수 없어요. 잠시 뒤 다시 시도해 주세요.' };
let currentVisit = null, steps = ['temperature','stethoscope'], busy = false;
const $ = id => document.getElementById(id);
const node = (tag, text, className) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = String(text); if (className) el.className = className; return el; };
function apiBase() {
  const configured = window.MORI_PORTAL_CONFIG?.apiBase ?? document.querySelector('meta[name="api-base"]')?.content ?? '';
  if (!configured) return '';
  const value = new URL(configured);
  const local = ['localhost','127.0.0.1','[::1]'].includes(value.hostname);
  if (value.username || value.password || value.search || value.hash || !(value.protocol === 'https:' || (local && value.protocol === 'http:'))) throw new Error('서버 주소 설정을 확인해 주세요.');
  return value.href.replace(/\/$/, '');
}
async function request(path, data) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(apiBase() + path, { method:data === undefined ? 'GET':'POST', credentials:'include', cache:'no-store', signal:controller.signal,
      ...(data === undefined ? {} : {headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}) });
    if (!response.ok) { const error = new Error(ERRORS[response.status] || '요청을 완료하지 못했어요. 입력 내용을 확인한 뒤 다시 시도해 주세요.'); error.status = response.status; throw error; }
    return await response.json();
  } catch (error) {
    if (error.status) throw error;
    throw new Error(error.name === 'AbortError' ? '연결에 시간이 걸려요. 잠시 뒤 다시 시도해 주세요.' : '서버 연결을 확인하고 다시 시도해 주세요.');
  } finally { clearTimeout(timer); }
}
function notice(text = '', isError = false) { $('notice').textContent = text; $('notice').dataset.error = String(isError); }
function authenticated(value) { $('login-panel').hidden = value; $('dashboard').hidden = !value; }
function lock(value) { busy = value; document.querySelectorAll('button').forEach(button => { button.disabled = value; }); if (!value && role === 'clinician') renderSteps(); }
function handleError(error) { notice(error.message, true); if (error.status === 401 || error.status === 403) authenticated(false); }
function checkboxes(container, names, selected = []) {
  container.replaceChildren(...Object.entries(names).map(([id,name]) => {
    const label = node('label'), input = node('input'); input.type = 'checkbox'; input.value = id; input.checked = selected.includes(id); label.append(input, node('span',name)); return label;
  }));
}
function selected(container) { return [...container.querySelectorAll('input:checked')].map(input => input.value); }
function renderSteps() {
  if (role !== 'clinician') return;
  $('steps').replaceChildren(...steps.map((id,index) => {
    const li = node('li'); li.append(node('span', CASE_NAMES[id] || id, 'step-title'));
    for (const [symbol,delta] of [['↑',-1],['↓',1],['×',0]]) {
      const b = node('button',symbol); b.type = 'button';
      b.setAttribute('aria-label', `${CASE_NAMES[id] || id} ${delta === -1 ? '앞으로' : delta === 1 ? '뒤로' : '삭제'}`);
      b.disabled = busy || (delta === -1 && index === 0) || (delta === 1 && index === steps.length-1);
      b.addEventListener('click', () => { if (delta) [steps[index],steps[index+delta]] = [steps[index+delta],steps[index]]; else steps.splice(index,1); renderSteps(); }); li.append(b);
    }
    return li;
  }));
  $('add-step').replaceChildren(...Object.entries(CASE_NAMES).filter(([id]) => !steps.includes(id)).map(([id,name]) => {const option=node('option',name);option.value=id;return option;}));
  $('append-step').disabled = busy || steps.length >= Object.keys(CASE_NAMES).length;
  $('auscultation-fieldset').hidden = !steps.includes('stethoscope');
}
function showVisit(visit) {
  currentVisit = visit && typeof visit === 'object' ? visit : null;
  if (role === 'clinician') {
    $('nickname').value = currentVisit?.child?.nickname ?? '';
    $('age').value = currentVisit?.child?.age ?? 5;
    checkboxes($('concerns'),CONCERNS,currentVisit?.concerns || []);
    steps = currentVisit?.plan?.steps ? currentVisit.plan.steps.filter(id=>Object.hasOwn(CASE_NAMES,id)) : ['temperature','stethoscope'];
    checkboxes($('auscultation-sites'),SITES,currentVisit?.plan?.auscultation?.sites || ['heart','breath-left','breath-right']);
    $('visit-version').textContent = currentVisit ? `저장된 방문 설정 · 수정 ${currentVisit.revision}` : '처음 방문 정보를 저장해 주세요.';
    renderSteps();
  } else {
    const container = $('visit-summary'); container.replaceChildren();
    if (!currentVisit) { container.append(node('p','아직 저장된 방문 설정이 없어요.')); return; }
    container.append(node('h3', `${currentVisit.child?.nickname || '아이'}의 진료 놀이`));
    container.append(node('p', `${currentVisit.child?.age ?? ''}세 · ${currentVisit.concerns?.map(id => CONCERNS[id] || id).join(', ') || '방문 놀이'}`, 'field-help'));
    const route = node('div',undefined,'visit-route'); for (const id of currentVisit.plan?.steps || []) route.append(node('span',CASE_NAMES[id] || id)); container.append(route);
  }
}
function listSection(card,title,items) {
  if (!Array.isArray(items) || !items.length) return;
  card.append(node('h4',title)); const list=node('ul'); for (const text of items.slice(0,50)) if (typeof text === 'string') list.append(node('li',text)); card.append(list);
}
function showReports(reports) {
  const list = Array.isArray(reports) ? reports : [];
  $('report-count').textContent = `${list.length}개 이야기`;
  if (!list.length) { $('reports').replaceChildren(node('p','아이가 놀이를 마치면 여기에 이야기가 모여요.','empty')); return; }
  $('reports').replaceChildren(...list.slice(0,100).map(report => {
    const card=node('article',undefined,'report-card'), header=node('header');
    header.append(node('h3','아이가 놀이에서 나눈 이야기'));
    const date=new Date(report.createdAt); header.append(node('span',Number.isFinite(date.getTime()) ? date.toLocaleString('ko-KR',{dateStyle:'medium',timeStyle:'short'}) : '놀이 기록','report-meta')); card.append(header);
    const summary=report.summary || {}; if (typeof summary.overview === 'string') card.append(node('p',summary.overview));
    listSection(card,'만난 진찰',summary.activities); listSection(card,'아이의 질문',summary.questions);
    if (typeof summary.understanding?.note === 'string') { card.append(node('h4','대화에서 살펴본 내용'),node('p',summary.understanding.note)); }
    listSection(card,'함께 나눌 이야기',summary.nextConversation);
    card.append(node('p','아이와 나눈 대화를 정리한 기록이에요. 이해 여부나 검사 결과를 검증한 평가가 아닙니다.','caution')); return card;
  }));
}
async function refresh(restore = false) {
  if (busy) return; lock(true); notice('방문 정보와 이야기를 불러오는 중이에요.');
  try { const [visit,reports]=await Promise.all([request('/api/portal/visit'),request('/api/portal/reports')]); showVisit(visit.visit); showReports(reports.reports); authenticated(true); notice('최신 정보를 불러왔어요.'); }
  catch (error) {if (restore === true && error.status === 401) {authenticated(false);notice('접근 코드를 입력해 화면에 연결해 주세요.');} else handleError(error);} finally {lock(false);}
}
$('login-form').addEventListener('submit',async event => {
  event.preventDefault(); if (busy) return; const input=$('access-code'), accessCode=input.value; lock(true); notice('화면에 연결하는 중이에요.');
  try { const session=await request('/api/portal/session',{role,accessCode}); if (session.authenticated !== true || session.role !== role) throw new Error('역할 연결을 확인해 주세요.'); input.value=''; lock(false); await refresh(); }
  catch(error) { input.value=''; handleError(error); } finally {lock(false);}
});
$('refresh').addEventListener('click',()=>refresh());
if (role === 'clinician') {
  checkboxes($('concerns'),CONCERNS); checkboxes($('auscultation-sites'),SITES,['heart','breath-left','breath-right']); renderSteps();
  $('append-step').addEventListener('click',()=> {const id=$('add-step').value;if(Object.hasOwn(CASE_NAMES,id)&&!steps.includes(id)){steps.push(id);renderSteps();}});
  $('visit-form').addEventListener('submit',async event => {
    event.preventDefault(); if (busy) return;
    const nickname=$('nickname').value.trim(), age=Number($('age').value), sites=selected($('auscultation-sites'));
    if (!nickname || Array.from(nickname).length>20 || !Number.isInteger(age) || age<2 || age>12 || steps.length<1 || steps.length>10 || new Set(steps).size!==steps.length || (steps.includes('stethoscope') && sites.length===0)) { notice('별명·나이·진찰 순서와 청진 부위를 확인해 주세요.',true); return; }
    const visit={schemaVersion:1,visitId:currentVisit?.visitId || crypto.randomUUID(),revision:currentVisit?.revision ?? 0,source:'clinician',child:{nickname,age},concerns:selected($('concerns')),plan:{presetId:'custom',steps:[...steps],...(steps.includes('stethoscope')?{auscultation:{sites}}:{})}};
    lock(true);notice('방문 설정을 저장하는 중이에요.');
    try { const result=await request('/api/portal/visit',{visit,expectedRevision:currentVisit?.revision ?? 0}); showVisit(result.visit); notice('방문 설정을 저장했어요. 게임에서 새 설정을 불러올 수 있어요.'); }
    catch(error){handleError(error);}finally{lock(false);}
  });
}
// A session is restored via an authenticated read, never a client-side token.
refresh(true);
