# 진료 검사 모형

2026-10-09. 최종 게임 범위는 청진기·귀·예방접종·체온·배 살펴보기입니다. 별도 해부모형은 기존 토끼 귀를 사용한 ear.glb만 유지합니다. 캐릭터 GLB는 수정하지 않았습니다. 사용자의 최신 지시에 따라 산소포화도용 손·혈압용 팔·복부·채혈/세포 모형과 최종 게임에 쓰지 않는 목·코 모형은 공개 목록과 결과물에서 제외했습니다. 이 범위를 과거의 7종 제작 요청보다 우선합니다. 예방접종과 배 살펴보기는 기존 환자의 몸을 사용하므로 별도 팔·배 모형이 필요하지 않습니다. 새 제작은 종료했습니다.

`manifest.json`의 `completedCases`와 `cases`가 게임에 전달하는 목록입니다. 각 모형의 `*-manifest.json`에는 실제 GLB의 목표 좌표·반경·도구 시작점·단계별 노드가, `*-validation.json`에는 로딩·표면·형상 검사 결과가 있습니다.

| 파일 | 구성과 조작 자료 |
| --- | --- |
| ear.glb | 기존 토끼의 긴 귀 한쪽, 아래의 작은 수평 귓길과 고막, 입구·이경 시작점·관찰 지점 |

좌표는 GLB root의 로컬 좌표입니다. +Y가 위, +Z가 앞입니다. `point`는 표면 접촉점 또는 별도로 표시된 관찰 공간이며, 도구의 접촉점과 root 위치는 다릅니다. 도구 root를 배치할 때 변환된 접촉 오프셋을 빼야 합니다.

귀는 `EarAnatomy` root와 `NativeRabbitPinna`·귓길·고막 노드로 구성합니다. 권장 sceneScale은 .18이며 실제 노드 이름은 ear-manifest.json의 nodes를 사용합니다. 입구와 시작점은 같은 Z 평면에 있습니다. 이경 전체를 +Y축으로 90도 회전하면 제작 당시 +Z 방향의 speculum이 귓길의 +X를 향합니다. 손잡이와 speculum을 함께 회전하며 scale은 양수로 유지합니다. 원본 귀의 긴 윤곽과 분홍색 vertex color를 유지했습니다. 추출된 밑동의 연결 조각만 Y=.105 아래에서 잘라 닫고, 남은 귀 전체를 Y=-.125만큼 내려 귓길 위에 놓았습니다.

GLB와 검토 PNG는 실행용·공유용 자산입니다. 재현 스크립트는 source/에 있습니다. .blend 원본, 추출 중간 파일, MCP 로그는 Git에서 제외한 artifacts/blender-mcp/anatomy/에만 있습니다. Blender 실행 파일과 MCP/Python 런타임은 프로젝트 밖 사용자 앱 폴더에 설치돼 있습니다.

검토 이미지는 CPU 4 threads·20 samples로 순서대로 렌더하며 직접 열어 확인합니다. 완료 상태는 각 manifest/validation에 기록합니다. review.html에서 이미지를 볼 수 있습니다.

프로젝트 root에서 `node public/assets/clinic/blender-candidates/anatomy/source/verify_bundle.mjs`를 실행하면 실제 Three.js GLTFLoader로 귀 모형을 읽고 유한 좌표·노드·목표점·단계·PNG 해상도와 최신성·원본 캐릭터 해시·취소된 모형 및 개발 바이너리 제외 여부를 검사합니다. 결과는 bundle-validation.json에 저장합니다. 표면과 연결성 검사는 ear-validation.json에 있습니다.

출처와 사용 조건은 LICENSE.md를 확인하세요. 자산 검사 결과는 게임의 최종 조작 검증과 별개이며, 앱 연결은 현재 메인 작업에서 진행합니다.
