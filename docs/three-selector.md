# 3D 도구 선택 준비

브라우저는 `/vendor/three.js` 한 파일에서 Three.js 전체와 `EffectComposer`, `RenderPass`, `OutlinePass`, `OutputPass`, `RoomEnvironment`를 가져옵니다. 같은 번들을 쓰므로 엔진과 애드온이 서로 다른 Three.js 인스턴스를 만들지 않습니다. CDN이나 브라우저용 `node_modules`는 필요하지 않습니다.

```js
import * as THREE from '/vendor/three.js';
import { RoomEnvironment, OutlinePass } from '/vendor/three.js';
import { forCase, ToolChallenge } from '/tool-challenges.js';

const data = forCase('ear'); // {caseId,prompt,correctToolId,choices:[{id,name}]}
const guard = new ToolChallenge(data.caseId, event => {
  // 최초의 올바른 선택에서만 {type:'unlock',caseId,toolId}가 발생합니다.
  startTouchGame(event.caseId, event.toolId);
});
const result = guard.select(selectedToolId);
// result.correct, result.unlocked, result.feedback, result.changed
```

버튼, 3D 객체 클릭, 접근성 선택 UI 모두 동일한 `select()` 판정을 사용합니다. 잘못된 도구나 목록에 없는 ID는 게임을 열지 않습니다. 정답 이후 반복 입력도 다음 단계를 중복 실행하지 않습니다. `reset()`은 같은 검사의 새 라운드를 시작합니다. 이 판정은 클라이언트의 학습 흐름용이며 인증이나 서버 보안 경계가 아닙니다.

정규 도구 ID는 `stethoscope`, `mirror`, `light`, `otoscope`, `thermometer`, `cotton`, `cuff`, `clip`, `tube`, `hand`입니다. 귀는 이경, 코는 빛으로 살펴보는 예시, 예방접종은 솜으로 팔을 준비하는 예시입니다. 목은 사용자가 요청한 진찰 거울 선택 시험 장면으로, 선택지는 거울·청진기·체온계입니다. 바늘을 직접 조작하지 않습니다. 목 거울 시험 장면이 일반 감기 검사를 대표한다고 가정하지 않습니다. 실제 병원에 적용할 때는 기관별 도구와 절차를 의료진이 검토해야 합니다. 도구와 그림은 병원별 진료 과정을 확정하는 안내가 아닙니다.

## 빌드와 배포

```powershell
npm ci
npm run build:vendor
npm test
```

빌드 입력은 `vendor/three-entry.js`, 출력은 `public/vendor/three.js`입니다. 정적 프런트엔드 배포에는 `public/vendor/three.LICENSE.txt`도 포함합니다. 번들 파일은 준비돼 있으므로 브라우저 실행 시 esbuild는 필요하지 않습니다.

`Dockerfile.backend`는 기존처럼 `server.mjs`와 `voice-policy.mjs`만 복사하는 작은 Node 24 API 이미지입니다. Three.js, esbuild, 프런트엔드, Python TTS를 백엔드 이미지에 추가하지 않습니다. 번들은 프런트엔드 빌드 단계에서 생성하고 정적 호스팅에 배포합니다. 실제 외부 배포는 실행하지 않았습니다.
