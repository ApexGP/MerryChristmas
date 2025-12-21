export class PerformanceGovernor {
  constructor(renderer, particleSystem) {
    this.renderer = renderer;
    this.particleSystem = particleSystem;
    this.target = 60;
    this.samples = [];
    this.lastTime = performance.now();
    this.lastAdjust = this.lastTime;
    this.minRatio = 0.75;
    this.maxRatio = Math.min(window.devicePixelRatio || 1, 1.3);
    this.pixelRatio = Math.min(
      this.maxRatio,
      Math.max(1, (window.devicePixelRatio || 1) * 0.9)
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
    if (avg < 58) {
      const nextRatio = Math.max(this.minRatio, this.pixelRatio - 0.1);
      const nextFraction = Math.max(0.55, this.activeFraction - 0.1);
      this._apply(nextRatio, nextFraction);
      return;
    }
    if (avg > 70) {
      const nextRatio = Math.min(this.maxRatio, this.pixelRatio + 0.05);
      const nextFraction = Math.min(1, this.activeFraction + 0.05);
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
