# 3D 선택기 외부 패키지

설치한 버전은 `package-lock.json`으로 고정합니다. 현재 새 패키지는 아래 두 가지입니다.

| 패키지 | 설치 버전 | 사용 | 라이선스 |
|---|---|---|---|
| Three.js | 0.186.1 | 브라우저 3D 엔진과 공식 애드온 | MIT |
| esbuild | 0.28.2 | 개발 및 프런트엔드 번들 생성 | MIT |

원문 라이선스는 설치 패키지에서 그대로 복사했습니다: [Three.js](licenses/three-MIT.txt), [esbuild](licenses/esbuild-MIT.txt). 배포하는 Three.js 번들 옆에도 `public/vendor/three.LICENSE.txt`를 포함합니다. esbuild는 백엔드 런타임이나 브라우저 번들에 포함하지 않는 빌드 도구입니다.

공식 소스: [Three.js](https://github.com/mrdoob/three.js), [esbuild](https://github.com/evanw/esbuild). 기존 이미지, 음성 모델 등의 라이선스는 해당 문서를 별도로 확인해야 합니다.

진료실 가구 배치에 사용하는 `public/vendor/geometry-utils.js`는 같은 Three.js 버전의 공식 `BufferGeometryUtils.mergeGeometries`를 번들한 파일로, 위 MIT 라이선스가 적용됩니다. 새 진료실 GLB와 Blender 렌더는 직접 제작한 CC0-1.0 에셋이며, 제작 스크립트는 MIT입니다. 상세 출처는 `public/assets/clinic/blender-candidates/LICENSE.txt`와 각 패키지의 라이선스 파일에 있습니다. Blender 앱과 MCP 실행 환경은 저장소 밖 AppData에 설치되어 있습니다.
