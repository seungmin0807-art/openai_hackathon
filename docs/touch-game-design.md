# 직접 조작하는 3D 청진 놀이 설계

2026-10-09. 현재 완성도를 높이는 대상은 **청진기 단일 과정**이다. 큰 환자와 실제 3D 기구를 한 진료실에서 직접 조작한다. 나머지 아홉 과정은 기본 procedural 3D 스케치다. 단계 버튼을 차례로 누르거나 모든 과정을 같은 드롭 판정으로 처리하는 틀로 돌아가지 않는다. 실제 4–7세의 재미·이해·불안 감소와 임상 효과는 미검증이다.

## 활성 청진 동작

진료실 트레이/선반의 기본 여섯 기구에서 청진기를 고르면 사람 의사가 걸어서 가져온다. 의자에 앉은 의인화 토끼의 몸 부위를 선택하고, 가까워진 실제 환자 mesh 표면에서 청진기 끝을 잡아 이동한다. 본체는 GLB, 검사 사물은 3D geometry이며 PNG billboard나 SVG 최종 게임 사물을 사용하지 않는다. 같은 GLB 얼굴의 PNG는 좌상단 대화창에만 쓴다.

`AuscultationGame`은 `plan.auscultation.sites`에 지정된 위치를 표시한다. 가슴판을 해당 환자 표면에 옮겨 잠깐 유지하면 소리가 나고 발견 표시가 바뀐다. 위치를 벗어나거나 놓거나 쉬면 소리를 멈춘다. 청진기 관은 의사 귀 쪽으로 이어진다. 아이에게는 행동 안내와 짧은 발견 자막만 보여주며 영문 필드·엔진·source 용어는 표시하지 않는다.

| 위치 ID | 짧은 화면 의미 | 현재 소리 |
| --- | --- | --- |
| `heart` | 심장 소리 | 낮은 음 두 번의 반복으로 만든 심장 예시 |
| `breath-left` | 왼쪽 가슴의 숨 소리 | noise/filter/envelope로 만든 숨 예시 |
| `breath-right` | 오른쪽 가슴의 숨 소리 | 같은 종류의 숨 예시 |
| `bowel` | 배 속 장 소리 | 짧고 불규칙한 음으로 만든 장 예시 |

현재 두 폐 위치의 소리는 동일 종류이며 좌우의 임상적 차이를 재현하지 않는다. 모든 소리는 **로컬 합성 교육 예시**이고 실제 환자·아동 녹음이나 진단용 정상/비정상 표본이 아니다. 실제 심박수·호흡수·장음 횟수나 검사 결과 수치를 측정해 보여주지 않는다. 청진 소리 재생 중에는 TTS 설명이 덮지 않도록 연결한다.

소리 시작 약 .25초·발견 약 1.6초, 표시 반지름과 거리 허용값은 조작을 알아보기 위한 시제품 값이다. 의학적 청진 위치·압력·소요 시간 지침이 아니다. `stage`, `sound`, `check`, `complete` 이벤트는 놀이 동작을 기록하고 이해·용기·진료 협조를 평가하지 않는다.

청진기는 심장·폐·장 등 몸 안의 소리를 듣는 도구라는 역할을 사용한다. [Cleveland Clinic: Auscultation](https://my.clevelandclinic.org/health/diagnostics/23080-auscultation)은 청진의 역할과 여러 부위를 설명한다. 현재 구현은 심장·숨·장 세 소리 종류/네 표시 위치의 교육 시안이며 원문 전체 검사 범위나 의료진 지침을 구현한 것은 아니다. 도구가 장기를 고치거나 아픈 소리를 지우는 연출은 넣지 않는다.

## 방문 상태와 조작 데이터

앱 기본은 `custom` + `steps:['stethoscope']`와 위 네 위치를 명시한 체험 상태다. 의료진이 제공하는 `plan.steps`/`plan.auscultation.sites`를 따르는 계약과 앱의 로컬 편집을 구분한다. 청진 위치는 지원하는 네 ID 중 중복 없는 1–4개이다. 상태 단서가 바뀐다고 검사 순서·진단·청진 위치를 자동 추론하지 않는다.

`GET /api/visit-state`의 제공자 URL/토큰은 아직 미설정이며 실제 병원 연결은 없다. 계약의 입력 검증·revision 처리와 실제 임상 시스템 연동은 별개다. 전체 방문 상태·ID·별명을 AI에 그대로 보내지 않는다. [틀 인계](framework-handoff.md)에 필드와 예시를 둔다.

`TOUCH_CASES`의 10 ID와 짧은 `purpose`/`hint`, `tool`/`mechanic`/`targets`는 남아 있다. `TouchSession`은 다른 3D 스케치의 연속 조작 판정에 사용한다. 기존 1000×650 좌표는 내부 gesture 매핑이며 현재 환자 geometry·카메라·접촉점을 확정하는 화면 좌표가 아니다. 과거 2D `TouchRenderer`/`toolArt()`와 별도 앞면 거울은 현재 앱의 활성 검사 화면이 아니다.

## 다른 아홉 과정의 기본 스케치

| 과정 | 유지할 교육 목적과 서로 다른 조작 |
| --- | --- |
| 목 | 가느다란 검사 거울로 옆면 목 단면의 안쪽을 살펴보기. 거울은 확대경·치료 도구가 아님 |
| 귀·코 | 빛을 옮겨 통로/고막 또는 양쪽 모습을 관찰. 찌르기·적 제거·치료가 아님 |
| 예방접종 | 솜으로 문지르기 → 접종의 뜻 관찰 → 밴드 옮기기. 직접 주사 바늘 삽입 없음 |
| 체온 | 이마 앞에 체온계를 잠깐 유지. 실제 수치 측정 없음 |
| 혈압 | 커프 이동 → 반복 누름/놓기. 힘 겨루기나 혈압 정상화 목표 없음 |
| 산소 | 집게를 손가락에 놓고 기다리기. 집게가 산소를 공급하는 연출 없음 |
| 피 검사 | 준비된 튜브 옮기기 → 세포 그림 관찰. 직접 채혈이나 피를 깨끗하게 만들기 없음 |
| 배 | 손 도구를 모형 배에 살짝 대고 놓기. 누른 위치로 진단하거나 통증을 없애지 않음 |

이 표는 목적과 기본 동작 범위다. 청진기와 같은 수준의 미술·음향·재미·QA가 완료됐다는 뜻이 아니다. `scan`/`hover`/`clip`/`press`/`wipe-bandage`/`pump`/`sample`을 단일 drop으로 합치지 않는다. 일반 스케치의 저장된 `/assets/touch/check.wav` 반응과 새 청진 소리 체계를 구분한다.

## 기존 의료 참고 범위

- 목 모습만으로 질병을 판정하지 않는다. [NHS: Tonsillitis](https://www.nhs.uk/conditions/tonsillitis/). 거울 간접 후두경 검사의 존재를 일반 감기 목 진찰의 보편적인 도구라고 확대하지 않는다. [Cleveland Clinic: Laryngoscopy](https://my.clevelandclinic.org/health/diagnostics/22803-laryngoscopy).
- 귀는 이경으로 고막을 살피는 역할을 참고한다. [NIDCD](https://www.nidcd.nih.gov/health/ear-infections-children). 코의 관찰과 콧물 제거를 구분한다. [Merck Manual](https://www.merckmanuals.com/professional/ear-nose-and-throat-disorders/approach-to-the-patient-with-nasal-and-pharyngeal-symptoms/evaluation-of-the-patient-with-nasal-and-pharyngeal-symptoms).
- 백신은 면역계가 기억하고 반응하도록 도와 병을 예방한다. 즉시 병원체를 쏴 없애거나 완벽한 보호를 얻는 연출은 하지 않는다. [WHO](https://www.who.int/news-room/questions-and-answers/item/vaccines-and-immunization-what-is-vaccination). 준비·접종·이후 돌봄이라는 뜻만 참고하며 용량·일정·주사법은 제공하지 않는다. [CDC Pink Book](https://www.cdc.gov/pinkbook/hcp/table-of-contents/chapter-6-vaccine-administration.html).
- 비접촉 체온계의 실제 거리는 기기별 지침이고, 산소 집게는 산소 포화도를 추정한다. [FDA: Thermometers](https://www.fda.gov/medical-devices/general-hospital-devices-and-supplies/non-contact-infrared-thermometers), [FDA: Pulse Oximeters](https://www.fda.gov/medical-devices/products-and-medical-procedures/pulse-oximeters).
- 혈압·피 검사·배 진찰은 정보를 살피는 과정이다. [MedlinePlus: Blood Pressure](https://medlineplus.gov/ency/article/007490.htm), [Blood Testing](https://medlineplus.gov/lab-tests/what-you-need-to-know-about-blood-testing/), [Abdominal Pain](https://medlineplus.gov/ency/article/003273.htm).

부위는 표준 해부도로 검증되지 않은 상징적 모델이다. 실제 의료진 검수와 아동의 행동·반복·소리 구분·목적 이해는 별도 확인한다. 순수/backend 테스트와 과거 거울 QA는 현재 청진 장면의 사용자 검증을 대신하지 않는다. 의료 참고 문장을 어린이 화면의 장문 안내로 옮기지 않는다.
