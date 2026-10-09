// Continuous touch prototypes. Coordinates and gesture thresholds are game design,
// never instructions for performing medical procedures on a real child.
export const TOUCH_WORLD = {
  width: 1000,
  height: 650,
  bodyBounds: { left: 100, top: 80, right: 750, bottom: 550 },
  toolHome: { x: 850, y: 480 },
};

const tool = (name, mode, light = false) => ({
  name,
  src: light ? '/assets/games/flashlight.png' : '',
  mode,
  anchor: light ? { x: 0.21, y: 0.27 } : { x: 0.5, y: 0.5 },
});
const target = (id, x, y, r, name, result) => ({ id, x, y, r, name, result });

const ALL_TOUCH_CASES = [
  {
    id: 'stethoscope',
    title: '청진기',
    purpose: '청진기로 심장, 숨, 배 속 장의 소리를 들어요.',
    hint: '청진기를 대고 소리를 들어봐요.',
    tool: tool('청진기', 'listen-hold'),
    mechanic: 'listen',
    targets: [
      target('heart', 420, 330, 65, '심장', '쿵쿵, 심장 소리가 들려요.'),
      target('lung-left', 300, 250, 70, '왼쪽 폐', '쉬~, 숨 쉬는 소리가 들려요.'),
      target('lung-right', 540, 250, 70, '오른쪽 폐', '다른 쪽 숨소리도 들어봤어요.'),
    ],
  },
  {
    id: 'vaccination',
    title: '예방접종',
    purpose: '몸이 병원체를 기억하도록 도와줘요.',
    hint: '솜을 살살 움직여 팔을 준비해요.',
    tool: tool('솜', 'wipe-trace'),
    mechanic: 'wipe-bandage',
    directNeedleControl: false,
    result: '백신은 병을 예방하도록 도와줘요.',
    targets: [target('arm', 420, 285, 75, '팔 준비 자리', '선생님이 접종할 자리를 준비해요.')],
    stages: [
      { id: 'wipe', hint: '솜을 살살 움직여 팔을 준비해요.', tool: tool('솜', 'wipe-trace') },
      { id: 'observe', hint: '선생님이 접종하는 모습을 봐요.', tool: tool('접종 알아보기', 'shot-observe'), result: '백신은 병을 예방하도록 도와줘요.', demonstrationOnly: true },
      { id: 'bandage', hint: '작은 밴드를 팔에 붙여봐요.', tool: tool('밴드', 'bandage-drag'), result: '접종 뒤에는 선생님 안내를 따라요.' },
    ],
  },
  {
    id: 'throat',
    title: '목 살펴보기',
    purpose: '검사 거울로 목 안쪽을 살펴봐요.',
    hint: '거울을 움직여 목 안쪽을 살펴봐요.',
    tool: tool('검사 거울', 'mirror-inspect'),
    mechanic: 'scan',
    targetsProvisional: true,
    targets: [
      { ...target('tonsil', 330, 292, 66, '목 안쪽', '거울에 목 안쪽이 비쳐요.'), provisional: true },
      { ...target('pharynx', 655, 290, 65, '다른 쪽 목 안쪽', '이쪽 모습도 살펴봤어요.'), provisional: true },
    ],
    result: '검사 거울로 목 안쪽을 살펴봤어요.',
  },
  {
    id: 'ear',
    title: '귀 살펴보기',
    purpose: '귀 안과 고막의 모습을 살펴봐요.',
    hint: '이경의 빛으로 귀 안을 살펴봐요.',
    tool: tool('이경', 'light-scan', true),
    mechanic: 'scan',
    targets: [
      target('ear-canal', 355, 285, 55, '귀길', '귀 안의 길을 살펴봤어요.'),
      target('eardrum', 555, 285, 48, '고막', '불빛으로 고막의 모습을 봤어요.'),
    ],
  },
  {
    id: 'nose',
    title: '코 살펴보기',
    purpose: '코 안의 붓기와 콧물을 살펴봐요.',
    hint: '빛으로 양쪽 코 안을 살펴봐요.',
    tool: tool('펜라이트', 'light-scan', true),
    mechanic: 'scan',
    targets: [
      target('nostril-left', 335, 340, 65, '왼쪽 코 안', '코 안의 모습을 살펴봤어요.'),
      target('nostril-right', 515, 340, 65, '오른쪽 코 안', '다른 쪽 모습도 살펴봤어요.'),
    ],
  },
  {
    id: 'temperature',
    title: '체온 재기',
    purpose: '몸의 온도를 재요.',
    hint: '체온계 끝을 겨드랑이에 살짝 대 볼까?',
    tool: tool('체온계', 'hover-hold'),
    mechanic: 'hover',
    targets: [target('forehead', 425, 235, 80, '이마 앞', '삑, 몸의 온도를 재는 도구예요.')],
    nonContact: true,
    result: '체온계는 몸의 온도를 재요.',
  },
  {
    id: 'pressure',
    title: '혈압 재기',
    purpose: '피가 동맥 벽을 미는 힘을 재요.',
    hint: '커프를 팔에 감고 펌프를 눌러봐요.',
    tool: tool('커프와 펌프', 'wrap-pump'),
    mechanic: 'pump',
    targets: [
      target('cuff', 405, 285, 80, '팔', '커프가 팔을 감싸요.'),
      target('pump', 850, 480, 60, '펌프', '커프가 잠깐 조였다가 풀려요.'),
    ],
    stages: [
      { id: 'position', hint: '커프를 팔에 감아봐요.', tool: tool('커프', 'wrap-drag') },
      { id: 'pump', hint: '펌프를 눌렀다 놓아봐요.', tool: tool('펌프', 'pump-press') },
    ],
  },
  {
    id: 'oxygen',
    title: '산소 확인',
    purpose: '빛으로 피 속 산소를 짐작해요.',
    hint: '손가락에 집게를 끼우고 기다려요.',
    tool: tool('센서 집게', 'clip-hold'),
    mechanic: 'clip',
    targets: [target('fingertip', 555, 305, 60, '손가락 끝', '집게의 빛으로 피 속 산소를 짐작해요.')],
    result: '빛으로 피 속 산소를 살펴봤어요.',
  },
  {
    id: 'abdomen',
    title: '배 살펴보기',
    purpose: '배를 살살 만져 살펴봐요.',
    hint: '모형 배에 손을 살짝 대봐요.',
    tool: tool('살펴보는 손', 'gentle-press'),
    mechanic: 'press',
    targets: [
      target('abdomen-left', 325, 315, 75, '배 왼쪽', '선생님은 아픈 곳이 있는지 살펴봐요.'),
      target('abdomen-right', 520, 315, 75, '배 오른쪽', '불편한 곳은 선생님께 알려주세요.'),
    ],
    result: '불편한 곳은 선생님께 알려주세요.',
  },
];

export const TOUCH_CASES=ALL_TOUCH_CASES.filter(c=>['stethoscope','ear','vaccination','temperature','abdomen'].includes(c.id));
export default TOUCH_CASES;
