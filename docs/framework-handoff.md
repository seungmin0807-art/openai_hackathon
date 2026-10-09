# 진료랑 놀아요! — 최신 인수인계 (2026-10-09)

최종 범위: 청진기·귀·예방접종·체온·배 5개. 목/코/혈압/산소/피 검사는 새 메뉴·의사 플랜에서 불허한다. Blender 채팅에도 제작 범위 축소와 독립 복부 객체 취소를 전달했다. 기존 환자 토끼와 사람 의사는 유지한다.

진료실은 최신 Blender 가구 17개와 도구4개만 사용한다. ToolSelector._makeRoom의 이전 절차형 가구 생성 코드는 완전히 삭제했다. 가구 로딩 실패 시 옛 모양으로 대체하지 않는다. 실제 가구/도구 선로딩과 chooserReady로 최초 구버전 화면 노출을 막는다.

청진: 심장/양쪽 숨/장 중 명시된 부위에 놓고 떼어도 1.6초 대기하면 노랑→초록. 교육용 합성 소리이며 목소리와 공존한다. 도구는 검사 때 환자 앞에 보인다. 같은 부위 설명은1회이고 효과음 재청진은 가능하다.
체온: 양쪽 겨드랑이 모두 가능, 어느 한쪽1.6초. 좌우 변경/쉬기/잘못된 위치는 대기를 초기화한다. 수치를 만들지 않는다.
복부: 독립 모형을 쓰지 않고 실제 토끼 배 표면3곳을 누르고 떼는 검사. 귀: 기존 토끼 한쪽 귀 아래 짧은 수평 통로/고막 Blender 객체와 이경. 고막 관찰0.9초가 완료 조건이며 귓길을 먼저 체크하지 않아도 공통 목적질문→답변→피드백→완료로 진행한다. 관찰하지 않은 귓길은 기록에 추가하지 않는다. 예방접종: 토끼 팔 그대로 솜→의사 시연→밴드.

일반 질문은 토리에게 말하기→녹음→답변해줘 토리야!의 수동 제출이다. WHY만 질문음성이 끝나면 자동녹음을 시작한다. 답을 목적 응답으로 분류하여 짧은 피드백/추가 질문(최대3회)→칭찬→완료한다. 다음 검사/다시 하기는 버튼으로 진행한다. 카메라 표정 분석은 없다.

음성: 실제 playing에 AI 자막을 맞추고 답변끝5초후 숨긴다. 새녹음시 예약을 취소하고 stale callback은 무시한다. read/sample/legacy ask는 녹음중 차단한다. 안내 goalQueue는 문장을 끝낸 뒤 다음 안내를 이어간다. latestSubtitle은 게임 논리상의 최신 문구이며 DOM은 현재 음성 문구를 유지하고 다음 playing 시점에 갱신한다. 앞 문장이 끝나기 전에 다음 게임 이벤트가 와도 글이 먼저 바뀌지 않는다. 음성 비활성/실패는 글을 표시한다. 명시적 마이크 시작/쉬기/새 검사에서만 중단한다. 고정45클립을 Blob으로 선로딩한다. 동적 TTS F4는 임시이며 사용자가 F3/F5/M3를 귀엽지 않다고 평가했다. Qwen 금지. 대체 귀여운 목소리는 아직 미확정이다.

배포: https://tori-hospital.vercel.app (게임), /clinician (의사), /guardian (보호자). 모두 접근 코드0807(사용자 지시). 동일 Node API+서울 Vercel private Blob 공유. 별도 https://tori-voice.vercel.app CPU ONNX Container TTS. .data/deployment-secrets.json/.env를 절대 출력하거나 업로드하지 않는다. Vercel 프로젝트 prj_zKn3u78B7tXfUfYE1JsCfnubiWnu, TTS prj_y0MMmyWTySmrnhel1kJ98oMXgbrN. 실제 cloud 루나요약→양쪽포털조회→WAV 성공 보고서 artifacts/cloud-verification.json. API model gpt-6-luna none, ASR gpt-4o-mini-transcribe, childenabled는 기본false(성인 테스트).

게임 활동과 Q&A는 session-report.js/learning-journal.js로 전송한다. CareReports는 실제 기록만 strict JSON 요약하며 진단/검사수치/검증된 이해점수를 만들지 않는다. 의사 계획은 명시적순서로만 적용하고 아이앱설정의수동변경 유지. 단일병원 역할 포털이며 환자별계정 ACL/읽음확인/분산CAS는 아직 없다.

검증: npm test84, CareReports19, 실제 HTTP 통합3, 양겨드랑이조건6, actual mobile 오른겨드랑이 touch, 복부 실제배3대상, 도구4/furniture17, 실제수동재녹음/WHY자동녹음흐름. 청진기 실제 조작에서 안내8문장 전체 종료와 WHY종료 후 자동녹음을 확인했다(artifacts/stethoscope-narration-queue-revalidated.json, 원본 실측 타임스탬프 재검증). 최종배포 dpl_Cm8U2zLn9URS7FGFCipKv6y8bxve의 세 화면 이름 ‘진료랑 놀아요!’와 양쪽0807로그인, 보호자수정403, 안내queue소스, TTS준비를 검증했다(artifacts/final-release-check.json). 고정 테스트/성인 합성은 실제 아동 사용성/임상 검증이 아니다.

별도 사용자 채팅 Blender: 01a11ee5-d0be-7783-bd6c-734fe06ea459. 음성 파이프라인: 01a11f5b-b4f2-7a02-b879-b90a6268247a. 파일공유이므로 소유/브라우저슬롯 조율.

자막 동기 수정 후 최종 배포: dpl_em6iEXNrqNfui2WdgfyBn9De66iu. npm test88개 통과. 실제 청진기 heart→bowel 안내9개 natural ended, 재생 중 DOM샘플348개 현재문구 유지, DOM변경8회가 해당 playing에만 발생했다. WHY 종료 뒤 자동녹음도 통과했다(artifacts/stethoscope-narration-caption-sync-report.json). 공개 별칭의 app.js가 최종 로컬 소스와 일치함을 확인했다(artifacts/narration-caption-release.json).
