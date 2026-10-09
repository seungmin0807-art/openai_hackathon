# 모리 한국어 음성

실제 로컬 CPU에서 작동하는 Supertonic 3 ONNX 음성 합성입니다. 브라우저 기본 음성을 사용하지 않습니다. 모델 파일과 의존성 설치 이후에는 합성을 위해 외부 서버를 호출하지 않습니다. 사용자가 제공한 음성이나 실제 인물의 목소리를 복제하지 않고 공식 고정 프리셋만 사용합니다.

## 실행

PowerShell에서 `./voice/setup.ps1`을 한 번 실행한 뒤 `./voice/start.ps1`로 시작합니다. Python 3.12.4에서 검증했습니다. 재현용 설치 버전은 `requirements-lock.txt`에 있습니다.

서비스 주소는 `http://127.0.0.1:8011`입니다.

- `GET /health`: 준비 상태, 기본 음성, 프리셋 목록.
- `POST /tts`: JSON `{ "text": "안녕! 나는 모리야.", "voice": "F4" }` → `audio/wav`.
- 사용 가능 프리셋: F1, F2, F3, F4, F5, M1, M2, M3, M4, M5.
- 기본값: F4, 한국어 `ko`, 모델 표준 속도 1.05, 합성 10단계, 44.1kHz 모노 PCM16. 이전 F2 샘플은 비교용으로 보존합니다.
- 응답 헤더: `X-Audio-Duration`, `X-Generation-Seconds`, `X-Sample-Rate`, `X-Voice`, `X-Queue-Seconds`, `X-Cache-Hit` (뒤 두 헤더는 로컬 서비스 직접 응답).
- 최대 600자. 합성은 순차 처리합니다. 로컬 앱의 HTTP Origin만 허용합니다.

정상 속도의 발음과 억양을 유지하며 피치나 음색을 인위적으로 바꾸지 않습니다. 캐릭터 느낌은 문장, 구두점, 음성 프리셋으로 조절합니다. HTTP 요청이나 발화 내용을 파일에 저장하지 않습니다.

### CPU 지연 조정

기본 내부 스레드 4개와 10단계/속도 1.05/가중치를 유지하고, ONNX의 각 세션 작업 스레드 busy-waiting을 끕니다. `runtime.py`는 설치된 고정 SDK의 합성 함수와 모델을 그대로 사용하며 초기 세션 설정만 명시합니다. `service.py --threads 4 --spinning`으로 기존 대기 방식을 비교할 수 있습니다. 실제 앱의 CPU 경쟁이 있는 환경에서 스레드를 무조건 늘리지 않습니다.

같은 전체 문장·프리셋은 5분 동안 메모리 WAV 캐시를 재사용합니다. 해시 키, 최대 32개/16MiB, 디스크 저장 없음입니다. 음질·문장 억양은 다시 합성하지 않은 WAV 그대로입니다. 캐시 응답의 `X-Generation-Seconds`는 0, `X-Cache-Hit`는 true입니다. `/health`에는 threads/steps/spinning/현재 합성 및 대기 수가 표시됩니다. 기존 동작 중인 프로세스는 파일 수정만으로 바뀌지 않으므로 관리자가 서비스 재시작 후 적용 여부를 health로 확인해야 합니다.

문장별 분리는 SDK도 긴 문장에 적용하지만 짧은 문장까지 잘게 분리하면 억양과 경계가 바뀝니다. 현재는 기존 `max_chunk_length=100`을 유지하며, 브라우저의 문장별 선재생 기능은 이번 수정에 포함하지 않았습니다. 큐는 동시 모델 합성을 막는 기존 단일 lock을 유지합니다.

공식 [ONNX Runtime 스레드 안내](https://onnxruntime.ai/docs/performance/tune-performance/threading.html)는 spinning이 CPU·전력 사용을 늘리고 세션별 풀 경쟁이 생길 수 있음을 설명합니다. 이 설정의 지연 효과는 장치와 부하에 따라 달라집니다. 실측은 `artifacts/audio/tts-latency-review.json`, 로컬 재측정은 `python voice/latency_benchmark.py --base http://127.0.0.1:8011 --label baseline`입니다.

## 실제 생성 결과

`service.py --sample`로 다음 문장의 두 음성을 생성했습니다.

> 안녕! 나는 모리야. 궁금한 게 있다고? 좋아, 내 호기심 안테나가 삐빅! 우리 같이 알아보자!

| 파일 | 프리셋 | 음성 길이 | CPU 생성 시간 |
| --- | --- | --- | --- |
| sample-ko.wav | F2 | 9.125초 | 9.270초 |
| sample-ko-F1.wav | F1 | 9.613초 | 10.476초 |

모델 최초 초기화 3.465초. 측정 조건은 CPU ONNX, 내부 스레드 4개, 10단계입니다. 별도 실제 HTTP 요청도 44.1kHz WAV로 검증했습니다(4.389초 음성 / 5.027초 생성). 결과의 자연스러움과 캐릭터 적합성은 두 샘플을 직접 재생하여 비교해야 합니다. 이 구현에는 Chatterbox처럼 감정 강도를 직접 조절하는 파라미터가 없습니다. 스트리밍이 아니므로 문장 생성이 완료된 뒤 재생합니다.

## 선택 이유와 사용 범위

| 후보 | 한국어 | 상태와 라이선스 | 이 환경에서의 판단 |
| --- | --- | --- | --- |
| Supertonic 3 | 지원 | 공식 보관소, 코드 MIT / 모델 OpenRAIL-M | CPU용 ONNX 고정 프리셋을 실제 설치·생성 완료. 필요한 파일 401.3MB |
| Supertonic 2 | 지원 | 공식 보관소, 코드 MIT / 모델 OpenRAIL-M | 3과 동일한 ONNX 계약. 이번에는 3만 다운로드 |
| Chatterbox Multilingual V3 | 지원 | 활성 프로젝트, MIT, 500M 모델 | 감정 강도 조절 가능. 이번 컴퓨터에서 설치·속도·품질 검증하지 않음 |

Supertonic 공식 GitHub 보관소는 2026년 9월 9일 아카이브되었고 개발·지원이 종료되었습니다. 코드와 모델은 고정 리비전으로 내려받았습니다. ONNX 대용량 파일은 SHA-256도 검증합니다.

**실제 모델 라이선스에 의료 조언 및 검사 결과 해석 금지 조항이 있습니다** (`MODEL-LICENSE.txt`, Attachment A(l)). 따라서 이 데모의 용도는 병원 공간·절차 안내, 캐릭터 대화, 정서적 응원입니다. 개인의 진단·치료 조언이나 의료 결과 해석을 이 모델로 읽게 하지 않아야 합니다. 병원에서 사용한다는 이유만으로 모든 의료 기능에 사용할 수 있는 모델로 표현해서는 안 됩니다. 모델은 사용 제한이 있는 공개 가중치이며 무제한 MIT 모델이 아닙니다.

공식 자료:

- [Supertonic 공식 보관소 및 실행 안내](https://github.com/supertone-oss-archive/supertonic)
- [Supertonic Python SDK](https://github.com/supertone-oss-archive/supertonic-py)
- [고정 모델 리비전](https://huggingface.co/supertone-oss-archive/supertonic-3/tree/aafc6e32416a594460b32413efc49d7fe4ce6d46)
- [모델 라이선스](https://huggingface.co/supertone-oss-archive/supertonic-3/blob/aafc6e32416a594460b32413efc49d7fe4ce6d46/LICENSE)
- [Chatterbox 공식 저장소](https://github.com/resemble-ai/chatterbox)
- [Chatterbox 공식 모델 카드](https://huggingface.co/ResembleAI/chatterbox)

Supertonic SDK 소스 리비전: `df0f9686dac7fbbde391b759e2ee5286a3737622`.
모델 리비전: `aafc6e32416a594460b32413efc49d7fe4ce6d46`.
라이선스 원문은 `SDK-LICENSE.txt`, `MODEL-LICENSE.txt`에 보관했습니다.
