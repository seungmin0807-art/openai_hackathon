# 음성 파이프라인 인계 (2026-10-09)

**최신 사용자 요청은 수동 버튼 녹음/제출이다.** 상시 듣기/releaseInput/root 자동 재개 제안은 새 앱에서 중단한다. 새 계약과 검증은 [manual-voice-contract.md](manual-voice-contract.md)를 기준으로 한다. 아래 continuous 기록은 과거 작업 증거다. 전사 prompt 제거/echo 방어/취소 adapter는 수동 모드에도 유지한다.

## 담당 범위와 서버 패치 계획

이 채팅은 `public/voice-session.js`, 독립 VAD/전사 adapter, 평가 fixture와 테스트를 담당한다. `public/app.js`와 말풍선 UI는 root 소유이며 직접 편집하지 않는다. 브라우저 슬롯 인계 전에는 UI/추론을 동시에 실행하지 않는다. .env와 비밀값을 읽거나 출력하지 않는다.

`server.mjs` 변경 계획(변경 전 기록): 기존 /api/transcribe의 동의·어린이 차단·5MiB 제한·MIME 제한을 그대로 유지한다. multipart 구성과 결과 검증만 `transcription-adapter.mjs`로 옮긴다. 모델 기본은 gpt-4o-mini-transcribe, 기존 명시적 gpt-4o-transcribe 선택을 유지한다. /api/chat의 gpt-6-luna 및 학습/보호자/의사 journal 계약은 변경하지 않는다. 브라우저가 취소/연결 종료하면 전사 upstream도 abort하도록 전사 경로에만 연결한다. 텍스트를 1000자에서 잘라 평가에 사용하는 동작은 오류로 바꾸고 빈 전사는 `text:''`/`status:'no_speech'`로 반환한다. confidence나 이해 점수를 지어내지 않는다. 다른 경로/환경설정/키 입력 UI는 변경하지 않는다.

## 현재 근거

artifacts/pipeline-live-report.json은 성인 합성 1.95초 문장 1개의 실제 전사/답변/음성 실증이다. 전사 1639ms, 대화 1756ms, TTS 25103ms, 학습응답 2227ms였다. 이것은 정확도/아동 이해도/자연스러움의 검증이 아니다. guardian/clinician 전달은 not_configured/pending이므로 실제 전달 완료를 주장하지 않는다. 이전 voice-loop QA는 API mock이며 음성 끄기가 TTS까지 막는 과거 계약을 사용했으므로 새 계약의 근거로 사용할 수 없다.

## 긴급 ASR prompt 복사 문제 (15:40 KST 진행 기록)

사용자가 말하지 않은 '한국어 병원 체험 대화. 용어: ... 은 뭐야?'가 표시됐다고 root에서 전달받았다. 기존 /api/transcribe가 바로 이 문장을 prompt로 보내던 것은 확인했다. 원본 녹음이 없으므로 실제 발생 원인을 확정할 수 없으나, 무음/잡음에서 prompt가 전사에 복사됐을 가능성을 고려한다. 이제 adapter에서 **prompt를 완전히 제거**, `language=ko` 유지, 해당 과거 문장/장문 용어목록을 `text:''`, `status:'rejected'`, `reason:'prompt_echo'`로 반환한다. '청진기 뭐야?' 같은 정상 짧은 질문은 그대로 보존한다. PCM16 WAV의 디지털 무음은 API에 전송하지 않고 `no_speech`로 반환한다. WebM/실제 주변잡음의 무음 판정은 아직 클라이언트 VAD 범위다.

[공식 Create transcription](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create)은 prompt를 선택적인 안내 텍스트로 정의하고 ISO-639-1 language가 정확도·지연에 도움을 줄 수 있다고 설명한다. 공식 문서가 prompt echo를 완전히 해결한다고 보증하는 것은 아니다. 이 제거/좁은 방어는 보고된 현상을 줄이는 프로젝트 판단이다. 소스 변경 후 **실행 중 Node 서버 재시작이 필요**하다. root 서버 3000은 아직 구버전일 수 있으므로 브라우저에 `isLegacyPromptEcho`를 적용하는 통합 patch도 제공한다.

## root 통합 계약

- onUtterance의 추가 metadata는 AbortSignal/isCurrent/sequence/발화 종료 이유를 포함한다. signal/isCurrent는 **전사까지만** 적용한다. 이미 질문을 받은 뒤 AI답변/재생에는 마이크의 signal을 전달하지 않는다. 답변은 root의 별도 flowEpoch/turnId로 화면 전환 취소를 처리한다.
- 마이크 끄기는 VoiceSession.stop만 호출하고 현재 토리 재생·안내·답변 promise는 유지한다. 새 아이 입력은 수집하지 않는다.
- 화면/검사 전환은 cancelPending 또는 stop으로 취소하며 기존 flowEpoch도 무효화한다. 일반 speak/ask의 suspend는 자기 요청을 취소하지 않는다.
- onUtterance promise는 전사→답변→실제 audio ended/error까지 기다려야 한다. 재생 직전에 suspend, 재생 종료 후 resume. processing은 '토리가 답변 대기 중…', 자막은 실제 playing부터, finishReply(5000)는 실제 ended부터. 목표말풍선은 별도로 유지.
- max-duration 끝난 불완전 발화는 이해 판정/학습 로그에 넣지 않고 짧게 다시 말하도록 안내한다. silence/연결 오류를 이해 부족으로 기록하지 않는다.

## 구현 파일

`public/voice-activity.js`: 60ms RMS 검사, 연속 최소 120ms onset, 1200ms 말끝 침묵, **발화 시작**부터 20초 제한, idle 20초 회전. idle 경계에서 시작한 첫 음절도 후보가 끝나기 전에는 버리지 않는다. 녹음은 onset 전부터 시작하므로 첫 자음을 보존한다. noise estimate는 onset 후보에서 고정, quiet-noise 보정과 hysteresis를 사용한다.

`public/voice-session.js`: 독점 recorder, permission/start epoch, 출력 Promise barrier, `onUtterance(blob, {signal,isCurrent,sequence,endReason,truncated,voiceMs,speechMs,captureMs})`, `cancelPending()`, 기본 재생 후 300ms 에코 대기. `suspend()`는 자기 요청을 취소하지 않는다. stop은 input signal만 취소하고 callback Promise가 끝날 때까지 barrier를 유지한다. 마이크 off→on에서도 아직 재생하는 답변과 녹음이 겹치지 않는다. 콜백은 metadata signal을 전사에만 적용해야 한다.

`transcription-adapter.mjs`: prompt 없음, language=ko, 모델·multipart, 빈/장문/형식오류 결과 검사, 취소/45초 timeout, 디지털 PCM 무음 paid-call 생략, 과거 prompt 복사 반환 차단. `server.mjs`의 전사 route에만 연동했고 upstream은 브라우저 연결 종료에도 abort한다. 실제 녹음/음량을 모르므로 일반적인 문장이 진짜 발화인지 판단할 수 없다. `status:'transcribed'`는 모델의 전사 텍스트라는 뜻이지 검증된 실발화라는 뜻이 아니다.

`public/transcript-policy.js`: root가 구버전 서버 결과에도 적용 가능한 좁은 prompt-copy 방어. `docs/app-voice-integration.patch`는 root 소스에 대한 제안이며 실제 app.js는 편집하지 않았다. 긴발화 metadata 미통합 시 root 기존 handleUtterance가 잘린 조각을 평가할 수 있으므로 **통합 필요**하다. 추론 중 `turnId`/`flowEpoch` 폐기를 전사 단계에서도 함께 확인해야 한다.

## 검증과 재현

독립 capture/VAD/adapter와 서버 테스트는 최종 **82개 모두 통과**했다. 합성 대기 중 input release/한 질문 queue, queued-resume, onset recording 상태도 포함한다. 실제 마이크/스피커/브라우저 통합 검증은 root 브라우저 슬롯 인계 전이므로 수행하지 않았다. 기존 mocked voice-loop 보고서로 이 변경을 검증했다고 주장하지 않는다.

```powershell
node --test server.test.mjs artifacts/voice-session.test.mjs artifacts/voice-activity.test.mjs artifacts/transcription-adapter.test.mjs
node artifacts/evaluate-voice-korean.mjs
# 이미 실행 중인 최신 서버에 성인 합성 fixture만 소량 전송한다.
node artifacts/evaluate-voice-korean.mjs --live --limit=8
# 900ms 생각 pause fixture도 실전사하려면 --all-recognition (기본 subset에는 미실행)
```

`artifacts/voice-korean-fixtures.json`에는 한국어 오디오 6개(깨끗한 질문, 귀 목적, 10dB 합성 백색잡음, 무음, 짧은 표현, 900ms pause)와 의미 fixture 12개(자기말 목적·응·모르겠어·잘못된 목적·짧은 호기심·깨진 전사)가 있다. `evaluate-voice-korean.mjs` 기본 실행은 무료 오프라인 WAV 준비/VAD 평가다. `--live`에만 최대 API 요청 수를 적용하며 원본 아동 음성·키 조회·TTS 생성·journal 전달·브라우저 시작은 없다. 평가 API는 loopback만 허용한다.

소스가 갱신된 별도 loopback 서버 3001에서 `--live --api=http://127.0.0.1:3001 --limit=8`을 실행했다. 보고서는 `artifacts/voice-korean-live-report.json`, 오프라인 분할은 `artifacts/voice-korean-offline-report.json`이다. API 호출 8회 중 디지털 무음 1회는 provider 전송 생략되어 paid upstream 최대 7회(전사 4+대화 3)다. 새 TTS/대형 모델 생성 없이 기존 성인 합성 캐시를 사용했다. root 3000은 임의로 재시작하지 않았다.

| 항목 | 결과 |
| --- | --- |
| 실제 clean/10dB noise/brief 전사 | 4개, 정규화 기준 33글자에서 2글자 오류, corpus CER 6.06% |
| 이건 왜 검사하는 걸까? | clean/noisy 모두 일치, 2003/970ms |
| 이경은 귀 안과 고막을 살펴봐. | 이경은 귀안과 고막을 살펴왔다. (2/12글자 오류), 820ms |
| 잘했어! | 문장부호 제외 일치, 1119ms |
| 디지털 무음 | text 빈 값, 21ms, provider 호출 없음 |
| 이해 목적/응/틀린 목적 의미 fixture | 3/3 작성자 기대 신호 일치, 1990/1646/1959ms, strict schema 적합 |
| 900ms pause 음성 | 실제 WAV VAD 한 발화 보존 확인, paid 전사는 미실행 |

지속 큰 잡음·실제 병원 잡음·작은/120ms 미만 목소리·어린이 발음·실제 speaker echo·실제 권한/기기 단절·긴 아동 대화는 검증하지 않았다. sustained loud noise를 speech로 감지하는 실패와 soft/sub-120ms 발화 누락을 독립 테스트에 **기대된 한계**로 남겼다. 이는 좋은 성능 주장으로 세지 않는다. CER, latency, 3/3 의미 신호는 이해 점수/인지 평가/임상 판정을 뜻하지 않는다. 잘못 전사된 말이 자연스러울 때 이를 자동으로 모두 탐지하는 기능은 없다.

## root 후속 통합 확인

1. 3000 서버를 root 소유 QA에 맞춰 재시작하고, 브라우저 module 새로고침. prompt echo 방어/metadata patch를 반영한다.
2. 마이크 off 중 ASR는 취소되고 이미 ASR 수락된 AI 답변/토리 audio는 계속 재생하는지 확인한다.
3. 화면 전환·pause·pagehide는 input+output+reply timer를 모두 취소하고 과거 답변이 새 검사에 나타나지 않도록 한다.
4. 준비중 pending 문구, 실제 playing부터 자막, ended 후 5초 hide, 목표말풍선 유지, 학습 round 1–3→짧은 칭찬→완료/다시하기를 실제 브라우저로 확인한다.
5. `Dockerfile.backend`는 기존부터 LearningLogStore 복사가 누락돼 있다. 이후 컨테이너 통합 시 `learning-log-store.mjs`, `transcription-adapter.mjs`, `public/transcript-policy.js`도 복사해야 한다. 이 채팅은 배포 파일/other-owner UI는 편집하지 않았다.
6. guardian/clinician journal의 pending/not_configured 계약은 유지했고 실제 수신처 전달은 미설정이다. 오인식/무음/잘린 발화는 학습 event로 기록하지 않는다.

## 게임 중 듣기 끊김 후속 (추가 사용자 피드백)

소스에서 확인된 세 지점: 첫 pointerdown이 config보다 빠르면 `reconcileVoice(true)`가 aiReady에서 조기 반환하고 뒤의 config callback은 consent=false여서 동의창을 요청하지 않는다. `stopAudio()`는 suspend를 해제하지 않아 이전 안내 취소 뒤에도 input이 멎을 수 있다. `ask()`의 앞부분 suspend와 기존 callback 전체 Promise barrier가 AI+TTS 대기 전체에 적용된다. 실제 사용자 기기에서 무엇이 발생했는지는 UI를 아직 직접 재현하지 못했다.

root에 `docs/voice-listening-integration.patch`(6개 hunk, git apply --check --unidiff-zero 검증)와 생성기 `tools/propose-voice-listening-integration.mjs`를 제공했다. 기존 app.js는 직접 편집하지 않았다. root가 같은 변경을 이미 작업 중이라 patch는 제안이며 현재 소스와 병합 검토한다.

root에서 ASR metadata/prompt reject를 app.js에 통합하고 3000 서버를 재시작해 aiReady/ttsReady를 확인했다고 알려 왔다. 또한 stopAudio guarded resume, ask upfront suspend 제거, ASR 수락 후 releaseInput 연결 및 recording onset에서 pending goal만 취소하는 작업을 root가 수행 중이다. 이 채팅이 root 소유 UI를 직접 적용/검증했다는 뜻은 아니다. 제공된 첫 `app-voice-integration.patch`의 일부는 이미 통합됐으므로 중복 적용하지 않는다.

VoiceSession에는 `releaseInput()`을 추가했다. **ASR 수락 직후** 호출하면 대화/합성 준비 중 녹음을 다시 연다. 한 개의 완성된 다음 질문만 메모리에 queue하고 이전 onUtterance/재생이 끝난 뒤 순서대로 callback을 호출한다. 별도 병렬 ASR/답변을 실행하지 않고 max-one queue라 무한 backlog를 만들지 않는다. mic-off/screen-stop은 queue도 버린다. 실제 speaker 재생은 suspend하고 끝/취소 시 resume한다. 이전 callback이 suspended 상태에서 끝나도 resume에서 queue를 다시 전달한다. 기본 API를 안 쓰는 root에서는 종전 안전 barrier를 유지한다.

`_checkVoice`는 false→true의 **확인된 onset 한 번**에 `onState('recording','듣고 있어!')`를 전달한다. root는 이때 아직 합성중인 goal/narrationTimer만 취소해 아이의 첫 질문이 안내로 잘리지 않도록 연결한다. 게임 효과음은 microphone suspend의 이유로 사용하지 않는다. 지속 잡음이 onset처럼 보일 수 있다는 VAD 한계는 유지한다.

사용자가 Luna 강도를 가볍게 요청했다. server.mjs는 현재 gpt-6-luna에 reasoning.effort='none'을 명시하고, 실제 Luna 실증도 그 서버에서 수행했다. [공식 Luna 모델 문서](https://developers.openai.com/api/docs/models/gpt-6-luna)에 none/low/medium/high/xhigh/max가 있고 light 값은 없다. 요청한 속도 목적에 맞춰 이미 가장 가벼운 none을 유지한다(기본 medium으로 돌아가지 않는다).
