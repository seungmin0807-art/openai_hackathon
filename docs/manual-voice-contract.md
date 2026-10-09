# 수동 말하기 계약 (2026-10-09)

사용자 요청이 상시 듣기에서 **버튼으로 시작/제출**하는 방식으로 바뀌었다. 이전 continuous integration patch와 releaseInput 연결은 새 앱에 적용하지 않는다. public/app.js/버튼 UI는 root 소유이며 이 채팅은 편집하지 않는다.

```js
const session = new VoiceSession({manualMode: true, onUtterance: handleUtterance,
  onState: (mode, text) => updateManualButton(mode, text), onError: showInputError});
// '토리에게 말하기': 성인/보호자 전송 동의 확인 후, 이 클릭에서만 권한/녹음 시작
await session.start();
// '답변해줘 토리야!': recorder 종료/최종 dataavailable까지 기다린 뒤 제출
const result = await session.submit();
// 진짜 pause/pagehide/사용자가 검사 바꾸기/입력 취소: 버림+input abort
session.cancel(); // stop()도 동일한 취소 계약
```

`start()`는 permission/capture만 시작하며 요청을 보내지 않는다. 성공 여부 boolean Promise를 반환한다. `submit()`은 중복 클릭에 같은 Promise를 반환한다. 결과는 `{status:'submitted'|'no_speech'|'cancelled'|'not_recording'|'audio_too_large'}`이며 `submitted`는 onUtterance callback까지 끝났다는 뜻이지 실제 모델 성공/이해 판정이라는 뜻이 아니다. callback은 전사→AI→TTS 완료를 기다린다.

수동 모드에서는 침묵/VAD 끝점이 제출을 유발하지 않는다. VAD는 유효한 최소 발화가 있는지 확인하는 보조 gate다. **명시적 submit에서만** 유효 발화 없는 무음은 no_speech로 skip하고 paid 요청/child 질문/journal/이해 판정을 만들지 않는다. 큰 지속 잡음은 energy VAD 한계로 말처럼 보일 수 있다. 과거 prompt-copy 방어는 전사 adapter에 그대로 유지한다.

기본 녹음 제한은 20초, byte 제한은 서버 5MiB보다 작은 4.75MiB다. 시간 제한은 자동 녹음을 **끝내고 메모리 ready blob으로 보관**하지만 자동 요청/답변은 없다. 사용자가 제출 버튼을 눌러야 한다. 제한 metadata(`manual:true`, `limited`, `truncated`, `endReason`)는 root가 확인하고, 잘린 학습 답을 이해 판정으로 사용하지 않는다. byte 초과는 불완전 WebM 조각을 전사하지 않고 audio_too_large로 처리한다.

상태: 시작 중 `starting`, 실제 recorder 시작 `recording`(즉시 버튼을 제출 문구로 바꿈), 제한 종료 blob 보관 `ready`, 명시적 제출 `processing`, 유효 발화 없음 `no_speech`, 완료 `idle`, 취소 `muted`. snapshot의 기존 active/starting/recording/suspended/processing에 수동 모드에서만 manual/ready/limited를 추가한다. ready 또는 processing의 active=true는 유효한 입력 세션이라는 뜻이며, 실제 마이크는 recorder 종료 후 track stop/context close로 해제한다.

`suspend()/resume()/releaseInput()`는 수동 모드에서 자동 시작·자동 재녹음을 하지 않는다. 일반 게임 phase/도구 움직임/안내 완료로 현재 manual capture를 취소하지 않는다. root는 녹음 시작 시 기존 토리 재생을 멈추고 녹음 동안 새 goal narration을 억제한다. 따라서 안내 playback의 suspend가 사용자 녹음을 잘라 버리는 구조가 없어야 한다. 진짜 취소에는 cancel()/stop()를 명시적으로 쓴다.

onUtterance(blob, capture)의 signal/isCurrent는 전사까지만 사용한다. 사용자가 입력을 취소하면 미수락 ASR를 폐기한다. 이미 ASR를 수락한 질문의 AI 답변/토리 재생은 input cancel만으로 취소하지 않는다. 화면 전환/pause/pagehide에는 root의 별도 flowEpoch/turnId/output cancellation을 함께 사용한다.

root 변경: manualMode:true, 기본 voiceWanted=false, reconcile 자동 start 제거, 답변 완료 후 start/resume 자동 호출 제거(수동 resume는 무해한 no-op), 첫 버튼 클릭에 동의→start, 둘째 클릭에 submit. 이전 capture.truncated 무조건 반환 코드는 manual limit에 대해 검토한다. 버튼 상태는 snapshot/상태 callback을 기준으로 관리하며 마이크 꺼짐과 토리 output lifetimes를 분리한다.

## 구현과 검증

`public/voice-session.js`에 manualMode/submit/cancel/ready/제한 guard를 실제 구현했다. 수동 모드는 permission 이후에도 버튼 submit 없이 onUtterance를 호출하지 않는다. recorder 최종 dataavailable/onstop까지 기다린 뒤 valid voice만 전달한다. recorder를 끝내면 마이크 track/context를 즉시 해제하고 메모리 blob만 보관한다. 기존 continuous 모드는 별도 옵션 호환용으로 남았지만 root 앱에는 manualMode:true만 사용한다.

12개 manual 테스트가 통과했다. permission/capture는 start에서만, 긴 침묵 자동 제출 없음, submit 중복 click Promise 공유, 답변 후 녹음 자동 재개 없음, 무음 callback 0, 20초 ready 보관/paid 요청 0, ordinary phase suspend/resume capture 유지, permission 지연 취소, 최종 recorder event 전 취소, ready blob 취소, accepted answer 보존/ASR token 취소, WebM byte 초과 callback 0, recorder 오류 복구 리소스 해제가 포함된다.

전체 capture/VAD/adapter/server 회귀도 **94개 모두 통과**했다. normal explicit submit에서는 ready 상태를 UI에 다시 알리지 않는다(내부 final blob은 기다림). root의 ready handler가 '답변해줘' 버튼을 다시 켜는 문제를 피하기 위해 ready는 자동 제한/예상치 않은 recorder 종료로 제출을 기다릴 때만 알린다. captureMs는 ready 보관 대기시간을 포함하지 않고 recorder 실제 종료시점까지로 고정한다.

최신 root 소스에서 manualMode:true/자동 시작 제거/submit 연결을 확인했다. 아직 `handleUtterance` 첫 줄의 `if(capture.truncated)return`가 남아 있어 **20초 limited ready를 제출하면 ASR 없이 종료**될 수 있다. 사용자가 제한 blob 제출을 원한 계약대로 root에서 manual limited branch를 검토해야 한다. `capture.manual && capture.limited`에서는 전사 자체는 할 수 있지만 잘린 학습 답을 이해 판정에 쓰지 않도록 별도 재말하기 안내를 둔다. 이 소스 확인은 UI 동작을 실브라우저에서 검증한 결과는 아니다.

```powershell
node --test --test-name-pattern=manual artifacts/voice-session.test.mjs
# 전체 capture/VAD/adapter/server 회귀 검증
node --test server.test.mjs artifacts/voice-session.test.mjs artifacts/voice-activity.test.mjs artifacts/transcription-adapter.test.mjs
```

이는 모의 MediaRecorder/마이크·시계의 결정적 독립 테스트이며 실제 browser permission/목소리/버튼 UI 검증이 아니다. 새 수동 흐름을 위해 추가 paid fixture/실아동 녹음/대형 모델 실행/환경 비밀 조회를 수행하지 않았다. root가 공유 UI와 수동 흐름을 통합하고 실제 브라우저를 확인해야 한다. source owner 범위대로 app.js/UI는 직접 편집하지 않았다.
