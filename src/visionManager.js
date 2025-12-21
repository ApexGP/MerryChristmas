import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { MODES, STATE } from "./state.js";

export class VisionManager {
  constructor(onFocusRequest) {
    this.video = document.getElementById("webcam");
    this.lastVideoTime = -1;
    this.handLandmarker = undefined;
    this.onFocusRequest = onFocusRequest;
  }

  async init() {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );

      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 1,
      });

      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      this.stream = stream;
      this.video.srcObject = stream;
      await this.video.play().catch(() => {});

      return true;
    } catch (e) {
      console.error("CV Init Failed:", e);
      alert("Camera access required for magic!");
      return false;
    }
  }

  predict() {
    if (!this.handLandmarker || !this.video) {
      requestAnimationFrame(() => this.predict());
      return;
    }

    if (!this.video.videoWidth || !this.video.videoHeight) {
      requestAnimationFrame(() => this.predict());
      return;
    }

    if (this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      const results = this.handLandmarker.detectForVideo(
        this.video,
        performance.now()
      );

      if (results.landmarks && results.landmarks.length > 0) {
        const landmarks = results.landmarks[0];
        this._processGestures(landmarks);
        this._mapHandToScene(landmarks);
      }
    }
    requestAnimationFrame(() => this.predict());
  }

  _processGestures(landmarks) {
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const wrist = landmarks[0];

    const pinchDist = this._distance(thumbTip, indexTip);
    if (pinchDist < 0.05 && STATE.mode === MODES.SCATTER) {
      if (STATE.mode !== MODES.FOCUS) {
        STATE.mode = MODES.FOCUS;
        this.onFocusRequest?.();
      }
      return;
    }

    const tips = [8, 12, 16, 20];
    let avgDist = 0;
    tips.forEach((i) => (avgDist += this._distance(landmarks[i], wrist)));
    avgDist /= 4;

    if (avgDist < 0.25) {
      STATE.mode = MODES.TREE;
    } else if (avgDist > 0.4) {
      STATE.mode = MODES.SCATTER;
    }
  }

  _mapHandToScene(landmarks) {
    const p = landmarks[9];
    const x = (p.x - 0.5) * 2;
    const y = (p.y - 0.5) * 2;

    STATE.handRotation.x = x * Math.PI;
    STATE.handRotation.y = y * Math.PI * 0.5;
  }

  _distance(p1, p2) {
    return Math.sqrt(
      Math.pow(p1.x - p2.x, 2) +
        Math.pow(p1.y - p2.y, 2) +
        Math.pow(p1.z - p2.z, 2)
    );
  }
}
