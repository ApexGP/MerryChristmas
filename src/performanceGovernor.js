export class PerformanceGovernor {
  constructor(renderer, particleSystem) {
    this.renderer = renderer;
    this.particleSystem = particleSystem;
    this.target = 60;
    this.samples = [];
    this.lastTime = performance.now();
    this.lastAdjust = this.lastTime;
    this.lastEmergency = 0;
    this.cooldownMs = 3500;
    this.minRatio = 1.05;
    this.maxRatio = Math.min(window.devicePixelRatio || 1, 1.6);
    this.pixelRatio = Math.min(
      this.maxRatio,
      Math.max(this.minRatio, (window.devicePixelRatio || 1) * 0.95)
    );
    this.activeFraction = 1;

    this.renderer.setPixelRatio(this.pixelRatio);
    this.particleSystem?.setActiveFraction(this.activeFraction);
  }

  tick() {
    const now = performance.now();
    const delta = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const fps = 1 / delta;
    if (!isFinite(fps) || fps > 180) return;

    this.samples.push(fps);
    if (this.samples.length > 90) this.samples.shift();

    if (now - this.lastAdjust < 1500 || this.samples.length < 30) return;
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    this.samples.length = 0;
    this.lastAdjust = now;
    this._rebalance(avg);
  }

  _rebalance(avg) {
    const now = performance.now();
    // 应对模式切换瞬时掉帧：快速降级一次，进入冷却期，避免频繁抖动
    if (avg < 45 && now - this.lastEmergency > this.cooldownMs) {
      const emergRatio = this.minRatio;
      const emergFraction = Math.max(0.75, this.activeFraction - 0.15);
      this.lastEmergency = now;
      this._apply(emergRatio, emergFraction);
      return;
    }
    if (now - this.lastEmergency < this.cooldownMs) {
      return;
    }

    if (avg < 55) {
      const nextRatio = Math.max(this.minRatio, this.pixelRatio - 0.08);
      const nextFraction = Math.max(0.8, this.activeFraction - 0.1);
      this._apply(nextRatio, nextFraction);
      return;
    }
    if (avg > 65) {
      const nextRatio = Math.min(this.maxRatio, this.pixelRatio + 0.04);
      const nextFraction = Math.min(1, this.activeFraction + 0.04);
      this._apply(nextRatio, nextFraction);
    }
  }

  _apply(ratio, fraction) {
    if (ratio !== this.pixelRatio) {
      this.pixelRatio = ratio;
      this.renderer.setPixelRatio(this.pixelRatio);
    }
    if (fraction !== this.activeFraction && this.particleSystem) {
      this.activeFraction = fraction;
      this.particleSystem.setActiveFraction(this.activeFraction);
    }
  }
}
