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
    this.frozenYaw = null;

    this.config = {
      mainCount: 1500,
      dustCount: 2500,
      photoCount: 20,
      ...config,
    };
    this.activeFraction = 1;

    this.materials = this._initMaterials();
    this.geometries = this._initGeometries();
    this.fullnessScale = 1.5; // 粒子体积放大比例
    this.photoFrameTone = {
      normal: { env: 2.2, emissive: 0.25 },
      focus: { env: 1.2, emissive: 0.12 },
    };
    this.focusScaleBase = 4; // 聚焦模式下照片缩放比例
    this.focusScaleCap = 6;
    this.photoNativeMaxScale = 16;

    this._initParticles();
    this.setActiveFraction(1);
    this.lastMode = STATE.mode;
    this.focusPool = [];
    this.cachedFocusIndex = -1;
    this.cachedFocusLocal = null;

    this._addStar();
  }

  _initMaterials() {
    const candyTexture = TextureFactory.createCandyCaneTexture();
    const defaultPhotoTexture = TextureFactory.createDefaultPhotoTexture();
    this._tunePhotoTexture(defaultPhotoTexture);

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
      photoFrameGold: new THREE.MeshPhysicalMaterial({
        color: 0xd4af37,
        metalness: 1.0,
        roughness: 0.18,
        clearcoat: 1.0,
        clearcoatRoughness: 0.08,
        envMapIntensity: 2.2,
        emissive: 0x442200,
        emissiveIntensity: 0.25,
      }),
      defaultPhotoTexture,
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
      photoFrame: new THREE.BoxGeometry(1.15, 1.15, 0.1),
      photoPlane: new THREE.PlaneGeometry(1.05, 1.05),
    };
  }

  _createPhotoFrame(texture) {
    this._tunePhotoTexture(texture);
    const group = new THREE.Group();
    const frame = new THREE.Mesh(
      this.geometries.photoFrame,
      this.materials.photoFrameGold
    );
    const photoMat = new THREE.MeshPhysicalMaterial({
      map: texture,
      metalness: 0.02,
      roughness: 0.82,
      clearcoat: 0.02,
      clearcoatRoughness: 0.6,
      envMapIntensity: 0.12,
      transmission: 0,
      sheen: 0,
    });
    const photoPlane = new THREE.Mesh(this.geometries.photoPlane, photoMat);
    this._applyPhotoAspect(photoPlane, texture, frame);
    photoPlane.position.z = 0.055;
    group.userData.focusScale = this._computePhotoNativeScale(texture);
    group.add(frame);
    group.add(photoPlane);
    return group;
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
      mesh.scale.multiplyScalar(this.fullnessScale);

      this._addParticle(mesh, "DECO", i, mainCount);
    }

    for (let i = 0; i < photoCount; i++) {
      const mesh = this._createPhotoFrame(this.materials.defaultPhotoTexture);
      mesh.scale.multiplyScalar(this.fullnessScale);
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

  _addParticle(mesh, type, index, total, isUploaded = false) {
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
      isUploaded,
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
    const mesh = this._createPhotoFrame(texture);
    mesh.scale.multiplyScalar(this.fullnessScale);
    this._addParticle(
      mesh,
      "PHOTO",
      Math.random() * this.config.mainCount,
      this.config.mainCount,
      true
    );
    mesh.position.set(0, 0, 40);
    this._invalidateFocusPool();
  }

  update(camera, controls) {
    const now = performance.now();
    const glow = 0.35 + 0.2 * Math.sin(now * 0.003);
    this.materials.goldBox.emissiveIntensity = glow;
    this.materials.goldSphere.emissiveIntensity = glow + 0.1;

    const targetVec = new THREE.Vector3();
    const lerpSpeed = 0.05;
    const yAxis = new THREE.Vector3(0, 1, 0);

    if (STATE.mode === MODES.SCATTER || STATE.mode === MODES.FOCUS) {
      this.scatterAngle += 0.0055;
    }

    const modeChanged = this.lastMode !== STATE.mode;
    let focusLocalTarget = null;
    if (
      STATE.mode === MODES.FOCUS &&
      camera &&
      controls &&
      STATE.focusTargetIndex >= 0
    ) {
      if (this.cachedFocusIndex !== STATE.focusTargetIndex) {
        const dir = new THREE.Vector3()
          .subVectors(controls.target, camera.position)
          .normalize();
        const focusWorld = camera.position.clone().addScaledVector(dir, 9);
        this.cachedFocusLocal = this.group.worldToLocal(focusWorld);
        this.cachedFocusIndex = STATE.focusTargetIndex;
      }
      focusLocalTarget = this.cachedFocusLocal;
    } else {
      this.cachedFocusIndex = -1;
      this.cachedFocusLocal = null;
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
        this._setMeshOpacity(p, 1);
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
        this._setMeshOpacity(p, 1);
        return;
      } else if (STATE.mode === MODES.FOCUS) {
        const isFocus = idx === STATE.focusTargetIndex && focusLocalTarget;
        if (isFocus) {
          targetVec.copy(focusLocalTarget);
          const focusScale = this._getFocusScale(p);
          p.scale.lerp(
            new THREE.Vector3(focusScale, focusScale, focusScale),
            0.12
          );
          p.lookAt(camera.position);
          this._setMeshOpacity(p, 1);
        } else {
          targetVec
            .copy(data.scatterPos)
            .applyAxisAngle(yAxis, this.scatterAngle);
          const wobble =
            Math.sin(this.scatterAngle * 0.7 + (data.scatterPhase || 0)) * 0.6;
          targetVec.y += wobble;
          p.rotation.x += data.rotationSpeed.x;
          p.rotation.y += data.rotationSpeed.y;
          p.rotation.z += data.rotationSpeed.z;
          p.scale.lerp(data.originalScale, 0.08);
          this._setMeshOpacity(p, 1);
        }
        p.position.lerp(targetVec, isFocus ? 0.18 : 0.16);
        return;
      }

      p.position.lerp(targetVec, lerpSpeed);
    });

    // 持续自转：基础角度累积，再叠加手势偏移，确保即便无输入也持续逆时针
    if (modeChanged) {
      const inFocus = STATE.mode === MODES.FOCUS;
      this._refreshPhotoFrameMaterial(inFocus);
      if (inFocus) {
        this.frozenYaw = this.group.rotation.y;
      } else {
        this.frozenYaw = null;
      }
    } else if (STATE.mode === MODES.FOCUS) {
      // 在聚焦模式持续刷新材质，避免长时间散开/旋转后反光状态丢失
      this._refreshPhotoFrameMaterial(true);
    }

    if (STATE.mode === MODES.FOCUS) {
      const targetYaw = this.frozenYaw ?? this.group.rotation.y;
      this.group.rotation.y += (targetYaw - this.group.rotation.y) * 0.12;
    } else {
      this.idleYaw += 0.003;
      const targetYaw = this.idleYaw + STATE.handRotation.x;
      this.group.rotation.y += (targetYaw - this.group.rotation.y) * 0.08;
      this.frozenYaw = null;
    }
    // 锁定垂直旋转，避免镜头上下偏移
    this.group.rotation.x += (0 - this.group.rotation.x) * 0.05;
    this.lastMode = STATE.mode;
  }

  _setMeshOpacity(mesh, opacity) {
    if (mesh.isGroup) {
      mesh.children.forEach((child) => this._setMeshOpacity(child, opacity));
      return;
    }
    const material = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    material.forEach((mat) => {
      if (!mat) return;
      if (mat.opacity === opacity && mat.transparent === opacity < 1) return;
      mat.transparent = opacity < 1;
      mat.opacity = opacity;
    });
  }

  _refreshPhotoFrameMaterial(isFocus = false) {
    const frameMat = this.materials.photoFrameGold;
    if (!frameMat) return;
    const envMap = this.scene?.environment;
    let dirty = isFocus; // force refresh while in focus to keep highlights alive

    if (envMap && frameMat.envMap !== envMap) {
      frameMat.envMap = envMap;
      dirty = true;
    }
    const tone = this.photoFrameTone?.[isFocus ? "focus" : "normal"] ?? null;
    if (tone) {
      if (frameMat.envMapIntensity !== tone.env) {
        frameMat.envMapIntensity = tone.env;
        dirty = true;
      }
      if (frameMat.emissiveIntensity !== tone.emissive) {
        frameMat.emissiveIntensity = tone.emissive;
        dirty = true;
      }
    }

    if (frameMat.metalness !== 1) {
      frameMat.metalness = 1;
      dirty = true;
    }
    if (frameMat.roughness !== 0.18) {
      frameMat.roughness = 0.18;
      dirty = true;
    }
    if (frameMat.clearcoat !== 1) {
      frameMat.clearcoat = 1;
      dirty = true;
    }
    if (frameMat.clearcoatRoughness !== 0.08) {
      frameMat.clearcoatRoughness = 0.08;
      dirty = true;
    }

    if (dirty) frameMat.needsUpdate = true;
  }

  _applyPhotoAspect(photoPlane, texture, frame = null) {
    if (!photoPlane || !texture) return;
    const planeBase =
      this.geometries?.photoPlane?.parameters?.width ||
      this.geometries?.photoPlane?.parameters?.height ||
      1.05;
    const frameBase =
      this.geometries?.photoFrame?.parameters?.width ||
      this.geometries?.photoFrame?.parameters?.height ||
      planeBase;
    const frameBorder = Math.max(frameBase - planeBase, 0);
    const applyScale = (ratio) => {
      const maxSide = planeBase;
      const targetWidth = ratio >= 1 ? maxSide : maxSide * ratio;
      const targetHeight = ratio >= 1 ? maxSide / ratio : maxSide;
      photoPlane.scale.set(
        targetWidth / planeBase,
        targetHeight / planeBase,
        1
      );
      const frameMesh =
        frame ||
        (photoPlane.parent?.children || []).find(
          (c) => c !== photoPlane && c.geometry === this.geometries.photoFrame
        );
      if (frameMesh) {
        const frameWidth = targetWidth + frameBorder;
        const frameHeight = targetHeight + frameBorder;
        frameMesh.scale.set(frameWidth / frameBase, frameHeight / frameBase, 1);
      }
    };
    const img = texture.image;
    if (img && img.width && img.height) {
      applyScale(img.width / img.height);
    } else if (!texture.onUpdate) {
      texture.onUpdate = () => {
        const texImg = texture.image;
        const ratio =
          texImg && texImg.width && texImg.height
            ? texImg.width / texImg.height
            : 1;
        applyScale(ratio);
        texture.onUpdate = null;
      };
      texture.needsUpdate = true;
    } else {
      applyScale(1);
    }
  }

  _tunePhotoTexture(texture) {
    if (!texture) return;
    const img = texture.image;
    const isPOT =
      img &&
      THREE.MathUtils.isPowerOfTwo(img.width || 0) &&
      THREE.MathUtils.isPowerOfTwo(img.height || 0);
    texture.generateMipmaps = !!isPOT;
    texture.minFilter = isPOT
      ? THREE.LinearMipmapLinearFilter
      : THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = Math.max(texture.anisotropy || 1, 12);
    texture.needsUpdate = true;
  }

  _computePhotoNativeScale(texture) {
    const img = texture?.image;
    if (!img || !img.width || !img.height) return 1;
    const maxSide = Math.max(img.width, img.height);
    const boost = maxSide / 1200;
    return THREE.MathUtils.clamp(boost, 1, this.photoNativeMaxScale);
  }

  _getFocusScale(mesh) {
    const nativeScale = mesh?.userData?.focusScale || 1;
    const target = this.focusScaleBase * nativeScale;
    return Math.min(target, this.focusScaleCap);
  }

  pickRandomPhoto() {
    const pool = this._nextFocusPool();
    if (pool.length > 0) {
      const choice = pool.pop();
      STATE.focusTargetIndex = choice;
      this.focusPool = pool;
    } else {
      STATE.focusTargetIndex = -1;
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

  _invalidateFocusPool() {
    this.focusPool = [];
  }

  _nextFocusPool() {
    if (this.focusPool.length > 0) return this.focusPool;
    const uploaded = [];
    this.particles.forEach((p, idx) => {
      if (p.userData.type === "PHOTO" && p.userData.isUploaded) {
        uploaded.push(idx);
      }
    });
    for (let i = uploaded.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [uploaded[i], uploaded[j]] = [uploaded[j], uploaded[i]];
    }
    this.focusPool = uploaded;
    return this.focusPool;
  }

  _addStar() {
    // 五角星：锐利轮廓+柔和高光，竖向放置
    const outer = 1.6;
    const inner = 0.72;
    const shape = new THREE.Shape();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const ax = Math.cos(a) * outer;
      const ay = Math.sin(a) * outer;
      const b = a + Math.PI / 5;
      const bx = Math.cos(b) * inner;
      const by = Math.sin(b) * inner;
      if (i === 0) shape.moveTo(ax, ay);
      else shape.lineTo(ax, ay);
      shape.lineTo(bx, by);
    }
    shape.closePath();

    const starGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.5,
      bevelEnabled: true,
      bevelThickness: 0.18,
      bevelSize: 0.15,
      bevelSegments: 2,
      bevelOffset: 0,
    });
    starGeo.computeVertexNormals();

    const starMat = new THREE.MeshStandardMaterial({
      color: 0xf6d25e,
      metalness: 0.75,
      roughness: 0.38,
      emissive: 0xffc74a,
      emissiveIntensity: 0.32,
      envMapIntensity: 0.95,
    });

    const star = new THREE.Mesh(starGeo, starMat);
    star.position.set(0, 15.8, 0);
    // 朝前且尖端向上
    star.rotation.set(0, 0, Math.PI);
    star.castShadow = false;
    star.receiveShadow = false;
    this.group.add(star);
  }
}
