import * as THREE from "three";
import { TextureFactory } from "./textureFactory.js";
import { MODES, STATE } from "./state.js";

export class ParticleSystem {
  constructor(scene, config = {}) {
    this.scene = scene;
    this.particles = [];
    this.group = new THREE.Group();
    this.group.scale.set(1.2, 1.2, 1.2);
    this.scene.add(this.group);
    this.idleYaw = 0;
    this.scatterAngle = 0;

    this.config = {
      mainCount: 1500,
      dustCount: 2500,
      photoCount: 20,
      ...config,
    };
    this.activeFraction = 1;

    this.materials = this._initMaterials();
    this.geometries = this._initGeometries();

    this._initParticles();
    this.setActiveFraction(1);
  }

  _initMaterials() {
    const candyTexture = TextureFactory.createCandyCaneTexture();

    return {
      goldBox: new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        roughness: 0.22,
        metalness: 0.95,
        emissive: 0x332200,
        emissiveIntensity: 0.45,
        envMapIntensity: 1.6,
      }),
      greenBox: new THREE.MeshStandardMaterial({
        color: 0x004400,
        roughness: 0.65,
        metalness: 0.35,
        emissive: 0x001800,
        emissiveIntensity: 0.25,
        envMapIntensity: 1.1,
      }),
      goldSphere: new THREE.MeshPhysicalMaterial({
        color: 0xd4af37,
        roughness: 0.15,
        metalness: 1.0,
        clearcoat: 1.0,
        envMapIntensity: 2.0,
      }),
      redSphere: new THREE.MeshPhysicalMaterial({
        color: 0xcc0000,
        roughness: 0.15,
        metalness: 0.5,
        clearcoat: 1.0,
        emissive: 0x330000,
        emissiveIntensity: 0.5,
        envMapIntensity: 1.7,
      }),
      candy: new THREE.MeshStandardMaterial({
        map: candyTexture,
        roughness: 0.4,
        metalness: 0.1,
      }),
      photo: new THREE.MeshBasicMaterial({
        map: TextureFactory.createDefaultPhotoTexture(),
      }),
    };
  }

  _initGeometries() {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.5, 0),
      new THREE.Vector3(0, 0.5, 0),
      new THREE.Vector3(0.2, 0.7, 0),
    ]);

    return {
      box: new THREE.BoxGeometry(0.5, 0.5, 0.5),
      sphere: new THREE.SphereGeometry(0.3, 22, 16),
      candy: new THREE.TubeGeometry(curve, 8, 0.1, 8, false),
      photoFrame: new THREE.BoxGeometry(1.2, 1.2, 0.1),
    };
  }

  _initParticles() {
    const { mainCount, dustCount, photoCount } = this.config;

    for (let i = 0; i < mainCount; i++) {
      let mesh;
      const rand = Math.random();

      if (rand < 0.4) {
        mesh = new THREE.Mesh(
          this.geometries.box,
          Math.random() > 0.5 ? this.materials.goldBox : this.materials.greenBox
        );
      } else if (rand < 0.7) {
        mesh = new THREE.Mesh(
          this.geometries.sphere,
          Math.random() > 0.5
            ? this.materials.goldSphere
            : this.materials.redSphere
        );
      } else {
        mesh = new THREE.Mesh(this.geometries.candy, this.materials.candy);
      }

      this._addParticle(mesh, "DECO", i, mainCount);
    }

    for (let i = 0; i < photoCount; i++) {
      const mesh = new THREE.Mesh(
        this.geometries.photoFrame,
        this.materials.photo.clone()
      );
      this._addParticle(mesh, "PHOTO", i, photoCount);
    }

    const dustGeo = new THREE.PlaneGeometry(0.1, 0.1);
    const dustMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < dustCount; i++) {
      const mesh = new THREE.Mesh(dustGeo, dustMat);
      this._addParticle(mesh, "DUST", i, dustCount);
    }
  }

  _addParticle(mesh, type, index, total) {
    // 使用非线性分布让更多粒子落在底部，提升下缘密度
    const tLinear = index / total;
    const t = Math.pow(tLinear, 0.7);
    const height = 26 * (1 - t) - 13;
    const maxRadius = 10;
    const radius = maxRadius * t;
    const angle = t * 50 * Math.PI;

    const treePos = new THREE.Vector3(
      Math.cos(angle) * radius,
      height,
      Math.sin(angle) * radius
    );

    if (type !== "DUST") {
      treePos.x += (Math.random() - 0.5) * 1.5;
      treePos.y += (Math.random() - 0.5) * 1.5;
      treePos.z += (Math.random() - 0.5) * 1.5;
    } else {
      treePos.multiplyScalar(1.5);
    }

    // 散开目标：分层环绕分布（圆柱壳+轻锥形），半径随高度递减，贴近 TREE.html 视觉
    const heightNorm = (treePos.y + 13) / 26; // 0 底部，1 顶部
    const theta = Math.random() * Math.PI * 2;
    const radialPow = Math.pow(Math.random(), 0.6); // 更偏向外圈
    const baseRadius = 12 + radialPow * 20; // 12-32
    const radialJitter = 1 + (Math.random() - 0.5) * 0.06;
    const r = baseRadius * radialJitter;
    const scatterPos = new THREE.Vector3(
      Math.cos(theta) * r,
      THREE.MathUtils.clamp(-8 + Math.random() * 16, -8, 8),
      Math.sin(theta) * r
    );

    // 雪花（DUST）在散开时单独更大半径与更高层，模拟雪层
    if (type === "DUST") {
      const dustR = 18 + Math.random() * 18; // 18-36
      const dustTheta = Math.random() * Math.PI * 2;
      const dustY = THREE.MathUtils.clamp(-6 + Math.random() * 18, -6, 12);
      scatterPos.set(
        Math.cos(dustTheta) * dustR,
        dustY,
        Math.sin(dustTheta) * dustR
      );
    }

    mesh.position.set(
      (Math.random() - 0.5) * 50,
      (Math.random() - 0.5) * 50,
      (Math.random() - 0.5) * 50
    );
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);

    mesh.userData = {
      type,
      treePos,
      scatterPos,
      scatterPhase: Math.random() * Math.PI * 2,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.1
      ),
      rotationSpeed: new THREE.Vector3(
        (Math.random() - 0.5) * 0.05,
        (Math.random() - 0.5) * 0.05,
        (Math.random() - 0.5) * 0.05
      ),
      originalScale: mesh.scale.clone(),
      active: true,
    };

    this.group.add(mesh);
    this.particles.push(mesh);
  }

  addPhoto(texture) {
    const mat = new THREE.MeshBasicMaterial({ map: texture });
    const mesh = new THREE.Mesh(this.geometries.photoFrame, mat);
    this._addParticle(
      mesh,
      "PHOTO",
      Math.random() * this.config.mainCount,
      this.config.mainCount
    );
    mesh.position.set(0, 0, 40);
  }

  update() {
    const now = performance.now();
    const glow = 0.35 + 0.2 * Math.sin(now * 0.003);
    this.materials.goldBox.emissiveIntensity = glow;
    this.materials.goldSphere.emissiveIntensity = glow + 0.1;

    const targetVec = new THREE.Vector3();
    const lerpSpeed = 0.05;
    const yAxis = new THREE.Vector3(0, 1, 0);

    if (STATE.mode === MODES.SCATTER) {
      this.scatterAngle += 0.0055;
    }

    this.particles.forEach((p, idx) => {
      const data = p.userData;
      const active = data.active || data.type === "PHOTO";
      if (!active) {
        p.visible = false;
        return;
      }
      p.visible = true;

      if (STATE.mode === MODES.TREE) {
        targetVec.copy(data.treePos);
        p.scale.lerp(data.originalScale, 0.1);
      } else if (STATE.mode === MODES.SCATTER) {
        targetVec
          .copy(data.scatterPos)
          .applyAxisAngle(yAxis, this.scatterAngle);
        const wobble =
          Math.sin(this.scatterAngle * 0.7 + (data.scatterPhase || 0)) * 0.6;
        targetVec.y += wobble;
        p.rotation.x += data.rotationSpeed.x;
        p.rotation.y += data.rotationSpeed.y;
        p.rotation.z += data.rotationSpeed.z;
        p.position.lerp(targetVec, 0.18);
        return;
      } else if (STATE.mode === MODES.FOCUS) {
        if (idx === STATE.focusTargetIndex) {
          targetVec.set(0, 2, 35);
          p.scale.lerp(new THREE.Vector3(4.5, 4.5, 4.5), 0.1);
          p.rotation.set(0, 0, 0);
        } else {
          targetVec
            .copy(data.treePos)
            .multiplyScalar(1.5)
            .add(new THREE.Vector3(0, 0, -20));
          p.scale.lerp(data.originalScale, 0.1);
        }
      }

      p.position.lerp(targetVec, lerpSpeed);
    });

    // 持续自转：基础角度累积，再叠加手势偏移，确保即便无输入也持续逆时针
    this.idleYaw += 0.003;
    const targetYaw = this.idleYaw + STATE.handRotation.x;
    this.group.rotation.y += (targetYaw - this.group.rotation.y) * 0.08;
    this.group.rotation.x +=
      (STATE.handRotation.y - this.group.rotation.x) * 0.05;
  }

  pickRandomPhoto() {
    const photos = this.particles
      .map((p, i) => ({ p, i }))
      .filter((item) => item.p.userData.type === "PHOTO");
    if (photos.length > 0) {
      const choice = photos[Math.floor(Math.random() * photos.length)];
      STATE.focusTargetIndex = choice.i;
    } else {
      STATE.focusTargetIndex = Math.floor(
        Math.random() * this.particles.length
      );
    }
  }

  setActiveFraction(fraction = 1) {
    this.activeFraction = Math.max(0.5, Math.min(1, fraction));
    const nonPhotos = this.particles.filter((p) => p.userData.type !== "PHOTO");
    const budget = Math.floor(nonPhotos.length * this.activeFraction);
    let used = 0;
    this.particles.forEach((p) => {
      if (p.userData.type === "PHOTO") {
        p.userData.active = true;
        p.visible = true;
        return;
      }
      const active = used < budget;
      p.userData.active = active;
      p.visible = active;
      if (active) used += 1;
    });
  }
}
