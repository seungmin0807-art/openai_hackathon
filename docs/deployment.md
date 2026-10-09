# 진료랑 놀아요! — 현재 Vercel 배포

- 게임/의사/보호자 화면은 tori-hospital 프로젝트의 /, /clinician, /guardian 경로입니다.
- Node 24 Functions(api/index.mjs)는 기존 server.mjs request handler를 사용합니다. 정적 파일은 Vercel CDN이 제공합니다.
- 로그, 활동, 요약, 역할 세션, 의사 방문 설정은 서울 icn1 private Blob 저장소에 보관합니다. CareRepository는 로컬에서는 .data/care를 씁니다. /api/app-session의 HttpOnly capability cookie로 해당 브라우저의 놀이 sessionId를 묶습니다.
- 로그는 /api/learning-log, 완료 활동과 요약 요청은 /api/session-summary로 받습니다. gpt-6-luna reasoning none, store false, strict schema로 요약하고 같은 저장소의 두 역할 화면에 제공합니다. 읽음 확인/의료 평가가 아닙니다.
- 의사 계획은 /api/portal/visit, 조회는 /api/visit-state입니다. 신규 계획은 5개 검사만 받습니다. 아이 앱의 수동 상태/순서 수정은 유지합니다.
- 사용자 요청 접근 코드: 의사/보호자 모두 0807. 세션 cookie는 서버가 서명 대신 난수/hash 조회로 인증하며 guardian 수정 권한은 거절합니다. 단일 병원 공유 포털 시제품으로 환자별 계정 ACL은 없습니다.
- TTS는 별도 tori-voice Container Functions에 배포했습니다. deployment/tts/prepare.mjs로 .data/deploy-tts를 만들고 services entrypoint Dockerfile.vercel로 배포합니다. 자동 감지만 한 최초 시도는 정적 배포였으므로 사용하지 않습니다. Container 서비스는 pinned CPU ONNX 모델을 빌드 시 다운로드합니다.
- TTS_AUTH_TOKEN/TTS_SERVICE_TOKEN은 서버 전용 Bearer 비밀이고 TTS_URL은 HTTPS입니다. 기존 F4는 임시 목소리로 귀여운 목소리 교체는 미확정이며 Qwen을 사용하지 않습니다.
- 키와 접근 코드 자료는 .env 및 .data에만 두고 업로드하지 않습니다. 실제 성인 테스트 로그를 Luna 요약→두 포털 조회→cloud TTS WAV까지 HTTP로 검증했습니다(artifacts/cloud-verification.json). 실제 아동 성능/임상 이해도 검증은 아닙니다.

배포: node <vercel-cli>/dist/index.js deploy --prod --scope seungmin0807-6829s-projects
최종 URL 별칭이 새 deployment를 가리키는지 별도로 확인합니다. preview 인증은 유지하고 production 화면은 공개합니다. 포털 데이터는 자체 역할 인증으로 보호합니다.
