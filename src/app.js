import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { detectDeviceProfile } from "./deviceProfile.js";
import { ParticleSystem } from "./particleSystem.js";
import { PerformanceGovernor } from "./performanceGovernor.js";
import { VisionManager } from "./visionManager.js";
import { UIManager } from "./uiManager.js";
import { STATE, MODES } from "./state.js";

export class App {
  constructor() {
    this.container = document.getElementById("canvas-container");
    this.device = detectDeviceProfile();

    this._initScene();
    this._initPostProcessing();
    this._initManagers();
    this._initShortcuts();
    this._start();
    this._camTargetZ = 50;
    this._camTargetY = 2;
    this._focusCamPos = null;
    this._suppressClickFocus = false;
    this._controlsFrozen = false;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.008);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 2, 50);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.toneMapping = THREE.ReinhardToneMapping;
    this.renderer.toneMappingExposure = 2.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 1);
    this.container.appendChild(this.renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const point = new THREE.PointLight(0xffaa00, 2, 50);
    this.scene.add(point);

    const fill = new THREE.DirectionalLight(0xffeebb, 0.8);
    fill.position.set(0, 0, 50);
    this.scene.add(fill);

    const spotGold = new THREE.SpotLight(0xffd700, 1200);
    spotGold.position.set(30, 40, 40);
    spotGold.angle = Math.PI / 4;
    spotGold.penumbra = 0.5;
    this.scene.add(spotGold);

    const spotBlue = new THREE.SpotLight(0x0000ff, 600);
    spotBlue.position.set(-30, 20, -30);
    this.scene.add(spotBlue);

    this.particleSystem = new ParticleSystem(this.scene, this.device.particles);
    window.particleSystem = this.particleSystem;

    this._initControls();
    this.performanceGovernor = new PerformanceGovernor(
      this.renderer,
      this.particleSystem
    );
    window.addEventListener("resize", this._onResize.bind(this));
  }

  _initShortcuts() {
    // 桌面双击：切换 TREE/SCATTER；移动端双击（双击触摸）同效
    const toggle = () => {
      // 双击强制在 TREE/SCATTER 间切换，忽略当前是否 FOCUS
      STATE.mode = STATE.mode === MODES.TREE ? MODES.SCATTER : MODES.TREE;
      STATE.focusTargetIndex = -1;
      this._focusCamPos = null;
      this._suppressClickFocus = true;
      setTimeout(() => (this._suppressClickFocus = false), 320);
    };

    this.renderer.domElement.addEventListener("dblclick", toggle);

    let lastTap = 0;
    this.renderer.domElement.addEventListener(
      "touchend",
      (e) => {
        const now = Date.now();
        const delta = now - lastTap;
        if (delta < 350) {
          toggle();
          lastTap = now;
          return;
        }
        // 单击（非双击）在 SCATTER 进入 FOCUS；FOCUS 时单击返回 SCATTER
        if (STATE.mode === MODES.SCATTER) {
          STATE.mode = MODES.FOCUS;
          this.particleSystem?.pickRandomPhoto();
          this._suppressClickFocus = true;
          setTimeout(() => (this._suppressClickFocus = false), 320);
        } else if (STATE.mode === MODES.FOCUS) {
          STATE.mode = MODES.SCATTER;
          STATE.focusTargetIndex = -1;
          this._focusCamPos = null;
          this._suppressClickFocus = true;
          setTimeout(() => (this._suppressClickFocus = false), 320);
        }
        lastTap = now;
      },
      { passive: true }
    );

    // 桌面单击在 SCATTER 进入 FOCUS，避免与双击冲突
    this.renderer.domElement.addEventListener("click", (e) => {
      if (e.detail > 1) return; // 双击情形交由 dblclick 处理
      if (this._suppressClickFocus) return;
      if (STATE.mode === MODES.SCATTER) {
        STATE.mode = MODES.FOCUS;
        this.particleSystem?.pickRandomPhoto();
      } else if (STATE.mode === MODES.FOCUS) {
        STATE.mode = MODES.SCATTER;
        STATE.focusTargetIndex = -1;
        this._focusCamPos = null;
      }
    });
  }

  _initControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.controls.rotateSpeed = this.device.isMobile ? 0.5 : 0.9;
    this.controls.target.set(0, 2, 0);
    const horizontalOnly = Math.PI / 2;
    this.controls.minPolarAngle = horizontalOnly;
    this.controls.maxPolarAngle = horizontalOnly;
  }

  _initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.45,
      0.4,
      0.7
    );
    this.composer.addPass(bloomPass);
  }

  _initManagers() {
    this.uiManager = new UIManager(
      (texture) => this.particleSystem?.addPhoto(texture),
      { isMobile: this.device.isMobile }
    );
    this.visionManager = new VisionManager(() =>
      this.particleSystem?.pickRandomPhoto()
    );
  }

  async _start() {
    const cvReady = await this.visionManager.init();
    if (cvReady) {
      this.visionManager.predict();
    }

    this.uiManager.hideLoader();
    this.renderer.setAnimationLoop(this._render.bind(this));
  }

  _syncControlLock() {
    if (!this.controls) return;
    const shouldFreeze = STATE.mode === MODES.FOCUS;
    if (shouldFreeze === this._controlsFrozen) return;
    this._controlsFrozen = shouldFreeze;
    this.controls.enabled = !shouldFreeze;
    if (!shouldFreeze) {
      this.controls.update();
    }
  }

  _render() {
    this._syncControlLock();
    // 固定视角目标，避免外部输入（手势/触控）改变相机指向
    if (this.controls && STATE.mode !== MODES.FOCUS) {
      this.controls.target.lerp(new THREE.Vector3(0, 2, 0), 0.1);
    }

    // FOCUS 阶段锁定当前镜头位置，不再推拉，仅照片前移
    if (STATE.mode === MODES.FOCUS) {
      if (!this._focusCamPos) {
        this._focusCamPos = this.camera.position.clone();
      }
      this.camera.position.copy(this._focusCamPos);
    } else {
      this._focusCamPos = null;
      // FOCUS 保持与 SCATTER 相同的相机距离，仅移动照片靠近
      const targetDist = STATE.mode === MODES.SCATTER ? 55 : 50;
      const targetY = STATE.mode === MODES.SCATTER ? 1.8 : 2;

      // 方向由 OrbitControls 决定，半径锁定 targetDist
      const dir = this.camera.position.clone().sub(this.controls.target);
      const len = dir.length() || targetDist;
      dir.divideScalar(len);
      const desiredPos = this.controls.target
        .clone()
        .addScaledVector(dir, targetDist);
      desiredPos.y = THREE.MathUtils.lerp(
        this.camera.position.y,
        targetY,
        0.05
      );
      this.camera.position.lerp(desiredPos, 0.08);
    }

    if (this.particleSystem)
      this.particleSystem.update(this.camera, this.controls);
    if (this.controls && STATE.mode !== MODES.FOCUS) this.controls.update();
    if (this.performanceGovernor) this.performanceGovernor.tick();
    this.composer.render();
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }
}
