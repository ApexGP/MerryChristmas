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
    this._start();
  }

  _initScene() {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 2, 50);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.3));
    this.renderer.toneMapping = THREE.ReinhardToneMapping;
    this.renderer.toneMappingExposure = 2.2;
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

  _initControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.controls.rotateSpeed = this.device.isMobile ? 0.5 : 0.9;
  }

  _initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.38,
      0.35,
      0.7
    );
    this.composer.addPass(bloomPass);
  }

  _initManagers() {
    this.uiManager = new UIManager((texture) =>
      this.particleSystem?.addPhoto(texture)
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

  _render() {
    if (this.particleSystem) this.particleSystem.update();
    if (this.controls) this.controls.update();
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
