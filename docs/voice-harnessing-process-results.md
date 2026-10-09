# 어린이 병원 진찰 게임: 음성 파이프라인 하네싱 과정과 결과

작성일: 2026-10-09 · Asia/Seoul  
대상 작업공간: `C:\dev\openai_hackathon`  
범위: 음성 입력·전사·대화·음성 출력·말풍선·학습 확인의 테스트 하네스와 실증 결과

## 1. 현재 결과

최종 제품 방향은 **수동 버튼 녹음·제출**이다. 사용자가 ‘토리에게 말하기’를 누르면 녹음하고, ‘답변해줘 토리야!’를 누르면 전사·AI 답변·토리 음성으로 이어진다. 침묵이나 답변 종료로 자동 제출·재녹음하지 않는다.

문서 작성 시 현재 소스를 대상으로 독립·서버 테스트를 다시 실행한 결과 **95개 모두 통과**했다. 별도의 앱 함수·말풍선 타이머 하네스는 **18개 중 17개 통과, 1개 실패**했다. 저장된 브라우저 보고서에서는 기본 수동 입력과 반복 녹음 검증이 통과했고, 전체 게임·학습 흐름 검증에는 **60초 타임아웃**이 남아 있다. 따라서 전체 흐름이 완전히 검증됐다고 결론 내리지 않는다.

| 검증 층 | 결과 | 판단 범위 |
| --- | --- | --- |
| 독립 capture/VAD/adapter 및 서버 회귀 | 95/95 통과 | 상태·취소·입력 검증·서버 계약 |
| 위 테스트 중 수동 녹음 | 12/12 통과 | 버튼 제출·무음·제한·중복 클릭·취소 |
| 현재 앱 함수·말풍선 타이머 하네스 | 17/18 통과 | 오프라인 통합 상태, 학습 경로 1건 실패 |
| 저장된 수동 입력 브라우저 QA | 제한한 범위 통과 | 실제 앱·녹음·재생, API 응답은 fixture |
| 저장된 반복 녹음 브라우저 QA | 제한한 범위 통과 | 이전 답변 타이머와 다음 녹음의 충돌 방지 |
| 저장된 전체 게임·학습 브라우저 QA | 미완료 | 60초 기다림 타임아웃 |
| 실제 전사 API 소량 실증 | 성인 합성 음성 4개 + 무음 | 33글자 중 오류 2개, CER 6.06% |
| 실제 Luna 의미 피드백 소량 실증 | 작성자 기대 신호 3/3 일치 | 아동 이해도·임상 검증 아님 |

## 2. 하네싱을 구성한 방식

### 2.1 검증 계약을 먼저 고정

초기 요구는 상시 마이크/VAD 대화였다. 이후 실제 사용자 피드백을 반영해 수동 입력으로 바뀌었다. 이전 연속 듣기 테스트는 호환·과거 개선 근거로 보관하고, 현재 앱의 사용 계약은 `manualMode: true`로 고정했다.

현재 계약은 다음과 같다.

1. 생성자·게임 단계 갱신·`resume()`만으로 권한 요청이나 녹음을 시작하지 않는다.
2. 첫 버튼 클릭과 전송 동의 후 `start()`에서만 녹음한다.
3. 침묵은 제출 조건이 아니다. 둘째 클릭의 `submit()`에서만 전사 요청을 시작한다.
4. `MediaRecorder`의 최종 `dataavailable`/`onstop`을 기다려 완성된 blob을 사용한다.
5. 유효한 VAD 발화가 없는 녹음은 명시적 제출 후 `no_speech`로 끝내고 질문·학습 기록·paid 요청을 만들지 않는다.
6. 기본 20초 제한은 녹음만 끝내고 ready blob을 메모리에 보관한다. 자동 AI 요청은 없다.
7. 4.75MiB byte 제한을 넘긴 녹음은 불완전 WebM 조각을 전사하지 않는다. 서버 업로드 제한은 5MiB다.
8. 일반 게임 phase 변화는 현재 수동 녹음을 유지한다. 실제 pause/pagehide/검사 변경/입력 취소는 버리고 ASR를 abort한다.
9. 입력 취소는 이미 수락한 질문의 AI 답변·토리 재생과 수명을 분리한다.
10. 답변 완료 후 다음 녹음을 자동 시작하지 않는다.

계약 원문: [manual-voice-contract.md](C:/dev/openai_hackathon/docs/manual-voice-contract.md).

### 2.2 브라우저 장치를 모의 환경으로 치환

`artifacts/voice-session.test.mjs`는 마이크 stream/track, AudioContext/analyser, MediaRecorder, 시계, interval/timeout을 모의 구현한다. 시간을 직접 전진시키고 녹음 종료 이벤트·권한 지연·오류·취소 순서를 제어한다.

확인 대상은 ‘좋은 답이 나왔는가’만이 아니다. callback 호출 횟수, 동시에 열린 recorder 수, 늦게 도착한 stream 폐기, track stop/context close, 취소 신호, 재녹음 여부를 직접 검증한다. 수동 테스트의 callback 0건은 이 층에서 전사/AI 처리로 넘긴 발화가 없다는 뜻이다. 이 테스트 자체는 외부 API를 호출하지 않는다.

### 2.3 VAD와 전사 adapter를 분리

VAD는 에너지 기반 RMS 검사다. 기본 60ms 간격과 연속 최소 120ms 발화 증거를 사용한다. 수동 모드에서 VAD는 입력 gate이며 자동 제출을 유발하지 않는다.

전사 adapter는 모델·multipart·한국어 설정·결과 검증·timeout/abort를 따로 검증한다. 실제 provider 대신 fixture 응답을 주어 빈 결과, 잘못된 JSON, 장문, 취소 후 결과 도착, prompt 복사를 재현한다. `transcribed`는 모델이 반환한 글이라는 뜻이며 실제 발화의 정확성을 보증하지 않는다.

### 2.4 서버 계약을 실제 로컬 HTTP로 검증

서버 테스트는 임시 loopback HTTP 서버와 모의 upstream을 사용한다. 보호자/성인 확인, 어린이 처리 차단, MIME·본문 크기, 출처 제한, 모델 payload, journal 저장·중복·재시도 계약을 확인한다. 외부 모델 응답을 모의하므로 서버 테스트 통과를 실제 인식 정확도 근거로 사용하지 않는다.

### 2.5 실제 API 실증을 작은 fixture로 제한

기존 로컬 TTS로 만든 성인 합성 음성과 작성자 기대 문장을 사용했다. 실제 아동 녹음은 없었다. 한국어 오디오 fixture 6개와 의미 fixture 12개를 준비하고, 그중 제한한 subset만 paid API로 실행했다.

오프라인 실행은 WAV 변형 준비와 같은 VAD의 분할 결과를 기록한다. 실제 API 실행은 요청 횟수 상한을 적용하며, 디지털 무음 WAV는 provider에 보내지 않는다. API 키 내용을 도구로 읽거나 문서에 출력하지 않았고, 외부 음성 생성 서비스나 새 대형 모델을 사용하지 않았다.

### 2.6 앱·브라우저 증거를 별도 층으로 유지

앱 함수 하네스는 현재 `app.js`의 실제 함수들을 VM에 넣고 permission/ASR/chat/TTS를 fixture로 대체한다. 말풍선 타이머 하네스는 이미 큐에 들어간 과거 timeout이 다음 녹음이나 답변을 지우는 경우를 검증한다. 전체 3D 화면을 렌더링하는 검증은 아니다.

공유 작업공간에 저장된 브라우저 보고서도 검토했다. 기본/반복 수동 QA는 WebGL을 꺼 음성 흐름만 검증했고 모델 API는 fixture였다. 별도의 전체 게임 QA는 타임아웃으로 완료되지 않았다. 이 문서 작성 과정에서 브라우저 검증을 새로 실행한 것은 아니다.

## 3. 사용자 피드백을 재현 조건으로 바꾼 과정

| 피드백·문제 | 하네스에 넣은 조건 | 수정·결과 |
| --- | --- | --- |
| 말하지 않은 병원 용어 문장이 질문으로 표시됨 | 과거 ASR prompt 문장/장문 용어목록을 전사 결과로 반환 | prompt 제거, `language=ko` 유지, 좁은 prompt-copy 방어. 정상 ‘청진기 뭐야?’ 보존 |
| 늦게 시작한 짧은 질문이 잘림 | 상시 모드에서 19초 대기 후 발화 및 idle 경계 onset | 발화 시작 기준 제한 및 onset 후보 보존. 현재 수동 모드에서는 침묵 자동 제출 제거 |
| 게임 중 듣기가 멎음 | permission/config 순서, stale suspension, AI/TTS 준비 대기 | 상시 개선 후 요구 변경. 현재는 수동 녹음의 ordinary suspend/resume를 no-op으로 처리 |
| 마이크 끄기가 토리 답변도 끊음 | ASR 취소와 이미 수락한 답변 Promise를 분리 | input token만 abort, 이미 수락된 출력은 caller의 별도 flow로 관리 |
| 제출 버튼 중복 클릭 | 같은 recorder에 연속 `submit()` | 같은 Promise 공유, 한 callback |
| 녹음을 방치함 | 20초 동안 말하기/침묵 | ready blob 보관, 자동 요청 0, 제출 후 처리 |
| 다음 녹음을 이전 자막 타이머가 끔 | 이전 답변 5초 deadline 중 새 녹음 | timer epoch 및 취소 검증, 저장된 반복 브라우저 QA 통과 |

prompt 복사는 원본 문제 녹음이 없어 실제 발생 원인을 확정하지 않았다. 확인한 것은 기존 코드가 해당 문장을 ASR prompt로 보내고 있었다는 사실이며, 제거와 필터는 그 가능성에 대한 방어다. 모든 자연스러운 오전사를 탐지하는 기능은 아니다.

## 4. 독립·통합 테스트 결과

문서 작성 시 실행 환경은 Node.js `v24.18.1`이었다.

| 파일 | 개수 | 결과 |
| --- | ---: | --- |
| `artifacts/voice-session.test.mjs` | 32 | 32 통과; 수동 12 + 기존 연속 모드 호환 20 |
| `artifacts/voice-activity.test.mjs` | 11 | 11 통과; 알려진 잡음·작은 발화 한계도 테스트에 명시 |
| `artifacts/transcription-adapter.test.mjs` | 9 | 9 통과 |
| `server.test.mjs` | 43 | 43 통과 |
| 위 네 파일 합계 | 95 | 95 통과, 실패/취소/건너뜀 0 |
| 앱 함수·말풍선 타이머 두 파일 | 18 | 17 통과, 1 실패 |

수동 12개는 최초 클릭 전 입력 없음, explicit submit, 긴 침묵 유지, 답변 후 자동 녹음 없음, 무음 skip, 시간/byte 제한, 일반 단계 capture 유지, 권한 지연 취소, 최종 이벤트 전 취소, ready 취소, accepted output 보존, recorder 오류 정리를 검증한다.

원본 실행 로그:

- [독립·서버 95개 로그](C:/dev/openai_hackathon/artifacts/voice-harness-export-test.log)
- [앱 함수·타이머 18개 로그](C:/dev/openai_hackathon/artifacts/voice-harness-export-integration-test.log)

**앱 함수 실패:** `WHY manual response preserves the learning route and remains an unvalidated signal`에서 예상 요청 수 2와 실제 1이 달랐다. 즉 이 하네스 실행에서는 전사 뒤 기대한 다음 요청까지 진행하지 않았다. 앱 오류인지 최신 질문/음성 대기 상태와 fixture의 불일치인지 이 문서 작업에서 확정하거나 수정하지 않았다. 단위 테스트 95개 통과와 별도로 남은 통합 검증 항목이다.

## 5. 실제 API 실증 결과

### 5.1 초기 전체 파이프라인 1건

저장된 `pipeline-live-report.json`은 1.95초 합성 질문 한 건으로 전사→답변→TTS→학습 피드백→journal 접수를 확인한 결과다.

| 단계 | 지연 |
| --- | ---: |
| gpt-4o-mini-transcribe 전사 | 1,639ms |
| gpt-6-luna 일반 답변 | 1,756ms |
| 로컬 TTS 생성·응답 | 25,103ms |
| Luna 학습 피드백 | 2,227ms |

당시 TTS 출력은 비무음 WAV였고 길이 9.543초였다. 이 사례에서 TTS가 전체 대기의 큰 부분을 차지했지만, 현재 모든 답변의 지연이 이 값과 같다고 일반화할 수 없다. 보호자·의사 journal은 `pending/not_configured`였으며 실제 전달 완료가 아니다.

### 5.2 prompt 제거 후 한국어 소량 평가

별도 loopback 서버에서 API 요청 8회, 실제 provider 요청 상한 7회(전사 4 + 대화 3)를 실행했다. 디지털 무음 1회는 로컬에서 반환했다.

| 오디오 fixture | 기대 문장 | 실제 전사 | 지연 | 결과 |
| --- | --- | --- | ---: | --- |
| 짧은 질문 | 이건 왜 검사하는 걸까? | 이건 왜 검사하는 걸까? | 2,003ms | 일치 |
| 귀 목적 | 이경은 귀 안과 고막을 살펴봐. | 이경은 귀안과 고막을 살펴왔다. | 820ms | 2글자 오류 |
| 같은 질문 + 합성 백색잡음 10dB | 이건 왜 검사하는 걸까? | 이건 왜 검사하는 걸까? | 970ms | 일치 |
| 디지털 무음 | 빈 값 | 빈 값 | 21ms | provider 호출 없음 |
| 짧은 표현 | 잘했어! | 잘했어. | 1,119ms | 문장부호 제외 일치 |

CER은 NFC 정규화 후 공백·문장부호를 제외한 글자 단위 편집거리다. 유성 fixture 4개의 기준 33글자에서 2글자 오류로 **6.06%**였다. 표본이 작고 질문 하나를 clean/noisy로 반복했으므로 일반 한국어·아동 정확도로 해석하지 않는다. 900ms pause 합성 fixture는 VAD에서 한 발화를 보존했지만 paid 전사는 실행하지 않았다.

| 의미 fixture | 작성자 기대 신호 | 실제 신호 | 지연 |
| --- | --- | --- | ---: |
| 심장/숨소리 목적을 자기 말로 표현 | understood | understood | 1,990ms |
| ‘응’만 말함 | unclear | unclear | 1,646ms |
| 청진기 목적을 키 재기라고 설명 | revisit | revisit | 1,959ms |

실제 피드백 3개는 기대 신호와 일치하고 스키마 형식에 맞았다. 이는 작성자 기준의 작은 의미 평가이며, 아이가 실제로 이해했는지 검증한 점수나 진단이 아니다. 앱 답변 모델은 `gpt-6-luna`, 추론 강도는 명시적 `none`으로 유지했다.

원본: [초기 파이프라인 실증](C:/dev/openai_hackathon/artifacts/pipeline-live-report.json), [한국어 실증](C:/dev/openai_hackathon/artifacts/voice-korean-live-report.json), [오프라인 fixture/VAD](C:/dev/openai_hackathon/artifacts/voice-korean-offline-report.json).

## 6. 저장된 브라우저 검증과 미완료 항목

| 보고서 | 확인된 범위 | 한계·결과 |
| --- | --- | --- |
| `manual-voice-audio-only-report.json` | 첫 버튼 이후만 녹음, 둘째 버튼 이후만 ASR, 응답 후 capture off, 동의 취소, playing 자막, pending, 5초 hide, 목표말풍선 보존 | 범위 통과, ASR 1/chat 1/TTS 2; API fixture, WebGL off |
| `manual-repeat-voice-report.json` | 이전 답변이 보일 때 새 녹음, 이전 5초 deadline 이후 녹음 유지, 두 번째 explicit submit | 범위 통과, ASR 2/chat 2/TTS 4; API fixture, WebGL off |
| `manual-voice-qa-report.json` | 전체 게임과 목적 대화/추가 질문/학습 기록 시도 | `completeClaim:false`, `page.waitForFunction` 60초 타임아웃; 전체 성공 판정 불가 |
| `voice-bubble-qa-report.json` | pending과 실제 답변 분리, 새 녹음의 과거 hide 취소, 작은 말풍선/목표 유지 | 분리된 실제 DOM 검증; 전체 학습/paid API 검증 아님 |

추가로 현재 root 소스에는 `capture.truncated` 즉시 반환이 남아 있다. 엔진은 20초 제한 blob을 ready로 보관하고 명시적 submit에서 전달하지만, 앱은 이 조건으로 전사를 건너뛸 수 있다. 제한 녹음을 제출하는 제품 동작과 잘린 학습 답을 평가하지 않는 기준을 함께 정리해야 한다.

실제 병원 잡음·어린이 발음·실제 아동 목소리·실기기 speaker echo·모든 권한/기기 조합은 검증하지 않았다. energy VAD는 큰 지속 잡음을 말로 감지할 수 있고, 아주 작거나 120ms 미만인 발화를 놓칠 수 있다. 짧은 응답 속도·CER·기대 신호 일치를 이해도나 임상 정확도의 근거로 사용하지 않는다.

## 7. 재현 명령과 자료

PowerShell에서 작업공간으로 이동한 후 실행한다.

```powershell
Set-Location C:\dev\openai_hackathon

# 무료: 수동 모드 12개
node --test --test-name-pattern=manual artifacts/voice-session.test.mjs

# 무료: 독립·서버 95개 (작성 시점 기준)
node --test server.test.mjs artifacts/voice-session.test.mjs artifacts/voice-activity.test.mjs artifacts/transcription-adapter.test.mjs

# 무료: 앱 함수/타이머 18개; 작성 시점에 1개 실패
node --test artifacts/manual-app-integration.test.mjs artifacts/voice-dialogue-timer.test.mjs

# 무료: 합성 fixture 준비와 VAD 평가
node artifacts/evaluate-voice-korean.mjs

# 유료 API: 이미 실행 중인 최신 로컬 서버에 제한된 성인 합성 subset
# 최대 로컬 API 요청 8회; 디지털 무음은 provider 전송 생략
node artifacts/evaluate-voice-korean.mjs --live --limit=8
```

`npm test`는 현재 별도의 음성 artifact 테스트 전체를 포함하지 않으므로 위 명령을 함께 사용한다. live 명령은 기존 보고서를 덮어쓸 수 있으며, 실행한 모델·소스·네트워크 상태에 따라 결과가 달라진다. 문서 작성 시 새로운 paid 평가나 브라우저/모델 동시 실행은 하지 않았다.

구현·평가 자료:

- [입력 세션 엔진](C:/dev/openai_hackathon/public/voice-session.js)
- [VAD](C:/dev/openai_hackathon/public/voice-activity.js)
- [전사 adapter](C:/dev/openai_hackathon/transcription-adapter.mjs)
- [과거 prompt 복사 방어](C:/dev/openai_hackathon/public/transcript-policy.js)
- [한국어 fixture 목록](C:/dev/openai_hackathon/artifacts/voice-korean-fixtures.json)
- [평가 실행기](C:/dev/openai_hackathon/artifacts/evaluate-voice-korean.mjs)
- [수동 입력 계약](C:/dev/openai_hackathon/docs/manual-voice-contract.md)
- [이전 과정·변경 이력](C:/dev/openai_hackathon/docs/voice-pipeline-handoff.md)

문서 범위는 음성 작업이다. 3D/Blender 전체 제작·게임 전체 기능·실제 병원 전달 시스템까지 완료했다는 보고서가 아니다.
