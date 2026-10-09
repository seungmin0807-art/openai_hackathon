// Local, observable face movements only; these cues are uncertain and are NOT emotions.
// API/model: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js
// The containing UI must obtain guardian/participant consent before calling start().
const VISION_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
const LABELS = Object.freeze({
  smile: '입꼬리가 올라가는 모습이 보여요',
  mouth_open: '입이 열리는 모습이 보여요',
  brow_raise: '눈썹이 올라가는 모습이 보여요',
  neutral: '뚜렷한 표정 변화는 보이지 않아요'
});

export class ExpressionObserver {
  constructor({ video, onCue = () => {}, onStatus = () => {} } = {}) {
    this.video = video;
    this.onCue = onCue;
    this.onStatus = onStatus;
    this._generation = 0;
    this._detector = null;
    this._stream = null;
    this._timer = null;
    this._scores = null;
    this._candidate = null;
    this._candidateSince = 0;
    this._lastUiCue = null;
    this._lastNonNeutralAt = -Infinity;
    this._lastVideoTime = -1;
    this._lastStatus = null;
    this._trackHandlers = [];
    this.running = false;
  }

  _call(callback, value) {
    // A UI callback error must never leave a camera or detector running.
    try { callback(value); } catch (error) { console.warn('표정 관찰 UI 콜백 오류', error?.name || 'Error'); }
  }

  _status(label) {
    if (label === this._lastStatus) return;
    this._lastStatus = label;
    this._call(this.onStatus, label);
  }

  async start() {
    this.stop();
    const generation = ++this._generation;
    this._lastStatus = null;
    this._scores = null;
    this._candidate = null;
    this._lastUiCue = null;
    this._lastNonNeutralAt = -Infinity;
    this._lastVideoTime = -1;
    if (!this.video || typeof this.video.play !== 'function') {
      this._status('카메라 미리보기 화면을 찾을 수 없어요');
      return false;
    }
    if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this._status('카메라는 HTTPS 또는 localhost의 지원 브라우저에서 사용할 수 있어요');
      return false;
    }
    this._status('카메라 준비 중');
    let stream = null;
    let detector = null;
    let stage = 'camera';
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 20 } }
      });
      if (generation !== this._generation) {
        stream.getTracks().forEach(track => track.stop());
        return false;
      }
      this._stream = stream;
      this.video.muted = true;
      this.video.playsInline = true;
      this.video.srcObject = stream;
      await this.video.play();
      if (generation !== this._generation) return false;
      stage = 'model';
      this._status('기기 안에서 표정 도구 준비 중');
      const { FaceLandmarker, FilesetResolver } = await import(`${VISION_ROOT}/vision_bundle.mjs`);
      if (generation !== this._generation) return false;
      const fileset = await FilesetResolver.forVisionTasks(`${VISION_ROOT}/wasm`);
      if (generation !== this._generation) return false;
      detector = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: new URL('./models/face_landmarker.task', import.meta.url).href,
          delegate: 'CPU'
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
        minFaceDetectionConfidence: 0.65,
        minFacePresenceConfidence: 0.65,
        minTrackingConfidence: 0.65
      });
      if (generation !== this._generation) {
        detector.close();
        return false;
      }
      this._detector = detector;
      stream.getVideoTracks().forEach(track => {
        const ended = () => {
          if (generation !== this._generation) return;
          this.stop();
          this._status('카메라 연결이 끝났어요');
        };
        track.addEventListener('ended', ended);
        this._trackHandlers.push([track, ended]);
      });
      this.running = true;
      this._status('표정 변화 살피는 중');
      this._tick(generation);
      return true;
    } catch (error) {
      if (generation !== this._generation) {
        if (stream && stream !== this._stream) stream.getTracks().forEach(track => track.stop());
        if (detector && detector !== this._detector) detector.close();
        return false;
      }
      this.stop();
      const name = error?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        this._status('카메라 사용이 허용되지 않았어요');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        this._status('사용할 수 있는 카메라를 찾지 못했어요');
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        this._status('카메라가 다른 앱에서 사용 중이거나 연결되지 않았어요');
      } else {
        this._status(stage === 'model' ? '표정 도구를 불러오지 못했어요. 연결 상태를 확인해 주세요' : '카메라를 시작하지 못했어요');
      }
      return false;
    }
  }

  _tick(generation) {
    if (!this.running || generation !== this._generation) return;
    try {
      if (!this._stream?.getVideoTracks().some(track => track.readyState === 'live')) {
        this.stop();
        this._status('카메라 연결이 끝났어요');
        return;
      }
      // A new decoded frame only; a 250ms minimum delay caps detection at 4fps.
      if (this.video.readyState >= 2 && this.video.currentTime !== this._lastVideoTime) {
        this._lastVideoTime = this.video.currentTime;
        const now = performance.now();
        const result = this._detector.detectForVideo(this.video, now);
        const categories = result.faceBlendshapes?.[0]?.categories;
        if (!categories?.length) {
          this._scores = null;
          this._candidate = null;
          this._status('얼굴이 화면에 보이면 살펴볼게요');
          if (this._lastUiCue !== 'neutral') {
            this._lastUiCue = 'neutral';
            this._call(this.onCue, { cue: 'neutral', label: '지금은 표정 단서를 확인하기 어려워요' });
          }
        } else {
          this._status('표정 변화 살피는 중');
          this._observe(categories, now);
        }
      }
    } catch (error) {
      this.stop();
      this._status('표정 관찰이 중단됐어요. 다시 켜서 시도해 주세요');
      return;
    }
    if (this.running && generation === this._generation) {
      this._timer = setTimeout(() => this._tick(generation), 250);
    }
  }

  _observe(categories, now) {
    const values = Object.fromEntries(categories.map(item => [item.categoryName, item.score]));
    const raw = {
      smile: Math.min(values.mouthSmileLeft || 0, values.mouthSmileRight || 0),
      mouth_open: values.jawOpen || 0,
      brow_raise: ((values.browOuterUpLeft || 0) + (values.browOuterUpRight || 0)) / 2
    };
    if (!this._scores) this._scores = raw;
    else for (const key of Object.keys(raw)) this._scores[key] = this._scores[key] * 0.65 + raw[key] * 0.35;

    // Conservative geometry thresholds are prototype heuristics, not clinical scores.
    const cue = this._scores.smile >= 0.55 ? 'smile'
      : this._scores.mouth_open >= 0.55 ? 'mouth_open'
      : this._scores.brow_raise >= 0.55 ? 'brow_raise' : 'neutral';
    if (cue !== this._candidate) {
      this._candidate = cue;
      this._candidateSince = now;
      return;
    }
    if (now - this._candidateSince < 2000 || cue === this._lastUiCue) return;
    // Neutral is an interface update only. The host must never use it to prompt AI.
    if (cue !== 'neutral' && now - this._lastNonNeutralAt < 12000) return;
    this._lastUiCue = cue;
    if (cue !== 'neutral') this._lastNonNeutralAt = now;
    this._call(this.onCue, { cue, label: LABELS[cue] });
  }

  stop() {
    ++this._generation;
    this.running = false;
    clearTimeout(this._timer);
    this._timer = null;
    this._trackHandlers.forEach(([track, ended]) => track.removeEventListener('ended', ended));
    this._trackHandlers = [];
    if (this._stream) this._stream.getTracks().forEach(track => track.stop());
    this._stream = null;
    if (this.video) {
      try { this.video.pause(); } catch (_) { /* video may be disconnected */ }
      this.video.srcObject = null;
    }
    if (this._detector) {
      try { this._detector.close(); } catch (_) { /* idempotent cleanup */ }
    }
    this._detector = null;
    this._scores = null;
    this._candidate = null;
    this._lastUiCue = null;
    this._status('카메라 꺼짐');
  }
}
