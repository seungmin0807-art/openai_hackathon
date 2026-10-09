# 진료 도구 검토용 Blender 시안

이경 `otoscope.glb`, 디지털 체온계 `thermometer.glb`, 펜라이트 `light.glb`를 각각 집을 수 있는 도구로 내보내고, 얕은 steel 트레이에 눕힌 세트를 `instruments-tray.glb`로 제공합니다. root의 `tool_id`/`selectable_tool`은 정확히 `otoscope`, `thermometer`, `light`입니다. 단독 도구의 원점은 손잡이 부근에 있습니다.

모든 geometry는 로컬 Blender Python으로 직접 제작했습니다. 이경 손잡이 홈과 hollow speculum, 연속된 체온계 몸체·probe, 펜라이트 스프링클립·반사경·렌즈는 실제 mesh입니다. 중립 LCD에는 실제 측정값이나 진단을 표시하지 않습니다. 도구 밑면의 평가 mesh 좌표를 검사해 트레이 바닥과의 접촉 높이를 맞췄습니다.

크림·민트·다크그린과 satin/brushed steel을 기존 수납장 미감에 맞췄습니다. 원본은 `artifacts/blender-mcp/instruments/instruments.blend`에 있고 Gitignored입니다. Blender 앱 자체는 사용자 `AppData/Local/Programs`에 설치되어 있습니다. 기존 캐릭터·진료실 앱 소스·서버는 수정하지 않습니다.

재현: `source/create_instruments.py`로 geometry와 GLB를 만들고 `source/render_instruments.py`로 Cycles 렌더를 실행합니다. 원본 스크립트의 OUT/PUBLIC은 현재 프로젝트 절대 경로입니다. 실제 MCP handshake·tools/list·제작/내보내기/렌더 결과는 artifacts 폴더의 JSON에 저장하고 이 폴더에는 작은 proof/validation 파일을 제공합니다.

이 도구들은 게임용 외형 시안입니다. 측정·조명·검사 기능이나 임상 기구 규격을 구현했다고 주장하지 않습니다. 앱의 실제 선택·집기 동작 통합은 별도입니다. 라이선스는 [LICENSE.md](LICENSE.md)를 참고하세요.
