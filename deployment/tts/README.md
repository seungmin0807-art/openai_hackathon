# 진료랑 놀아요! — Korean voice deployment candidate

This adapter reuses `voice/service.py` and its pinned Supertonic 3 ONNX weights. It does not adopt a new voice, use Qwen, or call an external speech-generation provider. F4 remains a temporary default until the user approves a replacement. The model weights use OpenRAIL-M and the SDK uses MIT; both license files are included in the image.

Build from the repository root:

```sh
docker build -f deployment/tts/Dockerfile.vercel -t mori-voice .
docker run --rm -p 8080:8080 --env-file <server-only-secret-file> mori-voice
```

For a standalone Vercel project, run `node deployment/tts/prepare.mjs`. It copies only the required source files to `.data/deploy-tts`, places `Dockerfile.vercel` and the permanent `vercel.json` container service configuration at that directory root, and prints the directory/environment contract. The configuration retains the `tts` service, catch-all service rewrite and Seoul `icn1` region every time staging is generated. Deploy that **generated directory**, whose Docker build context is self-contained. Models are fetched from their pinned public revision during the image build. Existing unknown files make staging fail rather than silently uploading or deleting them; `.vercel` link metadata is allowed and excluded from the Docker context. No secrets or local patient logs are copied.

Set `TTS_AUTH_TOKEN` to a new random server-only secret of at least 32 characters. Never place it in the frontend bundle. `POST /tts` accepts the existing JSON `{ "text": "...", "voice": "F4" }` and requires `Authorization: Bearer <token>`. `GET /health` exposes readiness without a token. The synthesis queue admits at most four requests per instance; overload returns HTTP503 with Retry-After. Request text/access logs are not stored. In-memory audio reuse remains bounded and ephemeral.

The backend integration must use an HTTPS `TTS_URL`, send the bearer secret, and probe `/health`. Browser requests continue through the existing backend `/api/tts`; they do not contact this service directly. These backend changes are owned by the main agent.

Current official Vercel documentation supports [Container Images in beta on all plans](https://vercel.com/docs/functions/container-images), including a `services` entrypoint pointing to a Dockerfile relative to the service root. For this Dockerfile the build context must remain the repository root. Containers must listen on `PORT`; the image defaults to8080. Standard [Python bundles are500MB, with Large Functions beta up to5GB](https://vercel.com/docs/functions/limitations). Cold starts, per-instance memory and CPU, maximum payload sizes, and account beta eligibility still require an actual deployment measurement; no latency or cost guarantee has been established.

Validation status: adapter authorization/queue behavior can be tested offline with a fake engine; Python syntax was checked. Docker is not installed on the current host, so the Linux image build, dependency resolution, cloud health and actual cloud WAV playback are **not verified**. This directory alone does not deploy or publish anything.
