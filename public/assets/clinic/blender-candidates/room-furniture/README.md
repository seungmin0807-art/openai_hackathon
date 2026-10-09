# 실제 앱 크기의 진료실 가구

`patient-chair`, `storage-cabinet`, `monitor`, `diagnostic-holder`, `instrument-workbench`, `sink-workcounter`의 독립 GLB 6개입니다. 캐릭터와 기존 앱 코드는 이 작업에서 수정하지 않았습니다.

원점은 바닥/탁상 기준 Y=0이며 glTF의 +Z가 앞입니다. 의자는 좌판 중심 XZ=0과 seat top=.82, back top=2.48, arm top=1.3, footrest top=.22를 유지합니다. 작업대는 폭2.9×깊이3.7, 접촉 평면 .975이고 steel insert도 이 평면에 맞춥니다. 싱크 작업대는 폭4.65×깊이2.65, 상판1.415와 실제 recessed bowl·chrome faucet입니다. 앞쪽 도구와 두 upright 도구 위치는 같은 1.415 상판에 있습니다. 벽 거치대 받침 top=.079, 모니터의 탁상 바닥은0이며 중립 화면에는 측정 수치가 없습니다.

각 root의 `seat_top_m`, `top_m`, `support_top_m`, `contact_metadata`, `bounds_gltf`에 실제 접촉/높이와 경계를 기록합니다. 정적 메시를 내보낼 때만 같은 재질별로 묶어 draw call을 줄이며 `.blend`는 원래 부품과 bevel/solidify를 편집 가능하게 보존합니다. 소스 경로는 `artifacts/blender-mcp/room-furniture/room-furniture.blend`이며 Gitignored입니다.

재현 순서: `source/create_room_furniture.py` → `source/render_room_furniture.py`. `source/verify_furniture.mjs`는 앱과 동일한 Three.js GLTFLoader, 정밀한 world vertex bounds와 실제 상판 raycast로 검사합니다. MCP initialize/tools/list/execute/save/export/render 결과와 평가 메시 manifold 검사는 artifacts의 JSON과 공개 `proof.json`에 있습니다.

모든 geometry와 재질은 로컬 Blender Python으로 직접 제작했습니다. 외부 asset·생성 API를 사용하지 않았으며 Blender 앱·MCP 환경·큰 `.blend`는 공개 폴더에 포함하지 않습니다. 직접 제작 geometry/render는 CC0-1.0, 스크립트는 MIT입니다.
