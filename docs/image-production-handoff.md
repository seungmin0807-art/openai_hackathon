# 3D 자산 제작 공유 인계

2026-10-09. 현재는 **청진기 한 과정**의 3D 진료실·앉은 의인화 동물 환자·사람 의사·직접 청진 조작에 집중한다. 이전 앞면 확대 거울, 2D PNG 본체/사물 놀이, 기구 카드와 SVG 최종 게임 기준은 현재 작업 기준이 아니다. 아홉 다른 과정은 기본 3D 스케치이며 모든 아트가 완성·승인됐다고 보지 않는다.

## 현재 제작 제약

사용자 최신 지시로 새 외부 자산 제작 서비스·이미지/3D 생성 API·모델 다운로드를 호출하지 않는다. 이미 로컬에 확보한 CC0 모델과 설치된 도구로만 변환·표면 수정·재질 보정·렌더한다. 별도 이미지 채팅에 추가 요청을 보내지 않는다. 새 Fal/ImageGen 작업이나 PNG billboard 몸을 제작하는 흐름은 중단된 기준이다.

한 장면에서 알아볼 수 있는 환자와 기구, 일관된 색·재질·크기, 직접 사물 조작을 우선한다. 트레이·작업대·가구·조명·기구는 같은 3D 진료실에 속한다. 환자는 동물 얼굴과 사람에 가까운 몸 비율의 머리·보이는 목·가슴·배·양팔·양다리를 갖추고 의자에 앉는다. 의사는 사람이다. 개별 구·타원을 붙인 캐릭터나 장면 전체를 한 이미지로 대신하는 방식은 사용하지 않는다.

## 현재 자산

| 경로 | 현재 역할 |
| --- | --- |
| `public/assets/clinic/patient.glb` | 흰 털·분홍 귀/코·검은 동공의 두발 토끼. 민트 옷/크림 테두리, 연결 목·긴 다리, 36,512 삼각형, 30 clips |
| `public/assets/clinic/doctor.glb` | 사람 의사, 피부/눈/머리/가운/셔츠/바지별 로컬 재질 색 보정. 6,498 삼각형, Idle/Walk |
| `public/assets/clinic/patient-portrait.png` | 실제 활성 환자 GLB의 얼굴을 로컬 WebGL로 렌더한 512×512 투명 PNG. 좌상단 대화용이며 3D 몸 대체 자산이 아님 |
| `public/assets/clinic/source/` | 확보한 원본과 재현 가능한 오프라인 변환/표면 수정/메타데이터 스크립트, 기존 생성 초안의 기록 |
| `public/assets/clinic/preview.html` | 단독 자산 표면 확인용 로컬 preview. 앱 통합 QA를 대신하지 않음 |
| `docs/clinic-character-art.json` | 파일 해시·연결 성분·법선·skin weights·bone·출처·실제 수정 과정과 검증 한계 |
| `public/assets/clinic/LICENSE-attribution.txt` | 이전에 읽은 공식 CC0 근거를 기록한 자체 출처 문서. 저작자의 원본 라이선스 파일이라고 주장하지 않음 |

원본은 Quaternius의 Sushi Restaurant Kit `Rabbit_Bald`와 Ultimate Animated Character Pack의 사람 의사이며 CC0 근거는 외부 호출 금지 이전에 확인했다. 최신 작업에서는 새 원격 확인이나 다운로드를 수행하지 않았다. 잘못된 HTML 응답 `doctor.gltf`/`LICENSE-quaternius.txt`는 제거했다. 이전 수달/의사 ImageGen PNG와 2D 목/손전등/청진기 후보는 현재 몸이나 검사 사물에 연결하지 않는다.

## 로컬 표면·rig 작업

Blender는 설치되어 있지 않다. 의사 FBX 변환은 설치된 Node.js/Three.js `FBXLoader`/`GLTFExporter`로 처리한다. 환자는 원본 glTF를 보존하고 Python/NumPy로 기존 연결 표면의 다리와 head/neck skin 영역을 늘렸다. rest bone·inverse bind·translation channels를 함께 보정하고 Loop subdivision 2회와 seam-welded smooth normals를 적용했다. UV·색·skin attributes를 보간하며 가중치 합을 정규화한다. 별도 목 오브젝트를 덧붙이지 않았다.

환자 몸 주 mesh는 weld 기준 연결 성분 1개, 경계와 비다양체 edge 0개다. 눈 mesh는 별도 성분 4개다. 의사는 원본의 낮은 폴리곤 윤곽과 분리된 얼굴/머리/옷 요소를 유지하며 환자와 같은 subdivision 완료 모델이라고 설명하지 않는다. 실제 topology와 제약은 JSON에 기록돼 있다.

회색 옷을 민트, 파란 테두리를 크림, 신발을 분홍 계열로 바꾸는 작업은 기존 로컬 atlas를 읽어 vertex colors를 보정했다. 원본 이미지 픽셀을 수정하지 않았다. `Sitting_Idle`은 허벅지를 앞으로, 정강이를 아래로 향하도록 기존 bone 자세를 보완했다. room은 Hips 위치로 의자 높이를 맞추며 발·목·가려짐·충돌은 실제 장면에서 다시 확인한다.

실제 부위 선택은 GLB 표면 raycast/geometry와 현재 camera/world transform을 따른다. 옛 1000×650 SVG 좌표·RGBA atlas 경계·PNG anchor를 3D 접촉 기준으로 대체하지 않는다. 청진기 끝은 표면에 닿고 관은 의사 귀로 이어진다. 얼굴 PNG를 다시 만들 때도 같은 GLB의 로컬 렌더를 사용한다.

## 다음 검수

앉은 몸의 목/가슴/배/팔다리가 실제로 보이는지, 발과 의자가 겹치지 않는지, 청진기 끝과 연결관이 자연스러운지, 기구가 트레이에서 놓이고 잡히는지, 작은 화면에서 큰 대상과 조작 여백이 유지되는지 확인한다. 자산 단독 Idle/Walk/Sitting 렌더 확인과 최종 room QA를 구분한다.

부위 mesh는 상징적 교육 표현이며 표준 해부 모델로 검증되지 않았다. 청진 소리는 로컬 합성 예시이고 실제 임상 녹음이 아니다. 이러한 개발상 제한은 어린이 화면의 긴 설명으로 표시하지 않는다. 미술의 최종 완성·실제 아동 선호·임상 효과나 재검증하지 않은 게임 인기 수치를 주장하지 않는다. [현재 틀 인계](framework-handoff.md)를 함께 사용한다.
