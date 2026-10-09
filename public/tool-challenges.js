// These are choices for illustrated education games, not clinical tool instructions.
export const TOOL_NAMES = Object.freeze({
  stethoscope: '청진기', mirror: '진찰 거울', otoscope: '이경', light: '펜라이트',
  thermometer: '체온계', cotton: '솜', cuff: '혈압 커프', clip: '산소포화도 집게',
  tube: '검사 튜브', hand: '진찰 장갑', bandage:'밴드', magnifier:'관찰 돋보기',
  spatula:'설압자', reflex:'반사 망치', syringe:'주사기', tweezers:'핀셋',
});

const definitions = [
  ['stethoscope', '몸속 소리를 들어볼까? 청진기가 어디 있지?', 'stethoscope', ['thermometer', 'stethoscope', 'cotton']],
  ['vaccination', '접종할 팔을 준비할 때 쓰는 것은?', 'cotton', ['cotton', 'tube', 'clip']],
  ['throat', '목 안쪽을 볼 거야. 진찰 거울을 골라줘!', 'mirror', ['mirror', 'stethoscope', 'thermometer']],
  ['ear', '귀 안과 고막을 살펴볼 도구는?', 'otoscope', ['tube', 'cotton', 'otoscope']],
  ['nose', '코 안쪽에 빛을 비출 도구는?', 'light', ['light', 'thermometer', 'clip']],
  ['temperature', '몸의 온도를 잴 도구는?', 'thermometer', ['stethoscope', 'thermometer', 'cuff']],
  ['pressure', '팔에 감아 혈압을 잴 도구는?', 'cuff', ['cotton', 'clip', 'cuff']],
  ['oxygen', '손가락에 끼워 산소를 살펴볼 도구는?', 'clip', ['clip', 'tube', 'light']],
  ['abdomen', '토리 배를 살살 살펴볼 때 쓰는 것은?', 'hand', ['hand', 'otoscope', 'cuff']],
];

export const TOOL_CHALLENGES = Object.freeze(definitions.map(([caseId, prompt, correctToolId, ids]) => Object.freeze({
  caseId, prompt, correctToolId,
  choices: Object.freeze(ids.map(id => Object.freeze({ id, name: TOOL_NAMES[id] }))),
})));
const byId = new Map(TOOL_CHALLENGES.map(challenge => [challenge.caseId, challenge]));

export function forCase(id) {
  const challenge = byId.get(id);
  if (!challenge) throw new RangeError(`Unknown tool challenge: ${String(id)}`);
  return { ...challenge, choices: challenge.choices.map(choice => ({ ...choice })) };
}
export const CHILD_CASE_IDS=Object.freeze(['stethoscope','ear','vaccination','temperature','abdomen']);
export const ROOM_TOOL_IDS=Object.freeze(['stethoscope','thermometer','otoscope','syringe']);
export function forRoomCase(id){const challenge=forCase(id);if(!CHILD_CASE_IDS.includes(id))throw new RangeError('아직 준비되지 않은 진찰 놀이입니다.');const ids=[...ROOM_TOOL_IDS];if(!ids.includes(challenge.correctToolId))ids.push(challenge.correctToolId);return{...challenge,choices:ids.map(id=>({id,name:TOOL_NAMES[id]}))};}

export function evaluateChoice(caseId, toolId, allTools=false) {
  const challenge = allTools?forRoomCase(caseId):forCase(caseId);
  const offered = challenge.choices.some(choice => choice.id === toolId);
  const correct = offered && toolId === challenge.correctToolId;
  return { caseId, toolId: offered ? toolId : null, correct, unlocked: correct,
    feedback: correct ? '좋아요! 도구를 써봐요.' : '다른 도구를 골라봐요.' };
}

// Only the first valid correct choice unlocks the touch game. Wrong selections
// never emit an unlock event, including repeated or unoffered tool IDs.
export class ToolChallenge {
  constructor(caseId, onEvent = () => {}, {allTools=false}={}) {
    this.allTools=allTools;
    this.challenge = allTools?forRoomCase(caseId):forCase(caseId);
    if (typeof onEvent !== 'function') throw new TypeError('onEvent must be a function');
    this.onEvent = onEvent;
    this.reset();
  }
  reset() {
    this.selectedToolId = null;
    this.unlocked = false;
    this.attempts = 0;
    this.feedback = '';
    return this.snapshot();
  }
  select(toolId) {
    const result = evaluateChoice(this.challenge.caseId, toolId,this.allTools);
    if (this.unlocked) return { ...result, unlocked: true, changed: false };
    if (result.toolId === null) return { ...result, changed: false };
    this.attempts += 1;
    this.selectedToolId = result.toolId;
    this.feedback = result.feedback;
    if (result.correct) {
      this.unlocked = true;
      this.onEvent({ type: 'unlock', caseId: result.caseId, toolId: result.toolId });
    }
    return { ...result, changed: true };
  }
  snapshot() {
    return { caseId: this.challenge.caseId, selectedToolId: this.selectedToolId,
      unlocked: this.unlocked, attempts: this.attempts, feedback: this.feedback };
  }
}

export default TOOL_CHALLENGES;
