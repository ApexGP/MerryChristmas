const DEFAULT_URL = "./assets/We_Wish_You_A_Merry_Christmas.mp3";

export class BgmPlayer {
  constructor(options = {}) {
    this.masterVolume = options.masterVolume || 0.05;
    this.url = options.url || DEFAULT_URL;
    this.ctx = null;
    this.bus = null;
    this.source = null;
    this.started = false;
    this.buffer = null;
    this.loadPromise = null;
  }

  async ensureStarted() {
    if (this.ctx && this.ctx.state === "closed") {
      this._resetCtx();
    }
    if (!this.ctx) {
      this._initContext();
    }
    this.started = true;
    if (this.ctx.state === "suspended") {
      await this.ctx.resume().catch(() => {});
    }
    await this._ensureBuffer();
    if (this._isPlaying()) {
      return this.loadPromise;
    }
    this._playBuffer();
    return this.loadPromise;
  }

  stop() {
    if (this.source) {
      try {
        this.source.stop();
      } catch (e) {}
    }
    this.source = null;
    if (this.ctx) {
      this.ctx.close();
    }
    this.ctx = null;
    this.bus = null;
    this.started = false;
  }

  _initContext() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.bus = this.ctx.createGain();
    this.bus.gain.value = this.masterVolume;
    this.bus.connect(this.ctx.destination);
  }

  _resetCtx() {
    this.ctx = null;
    this.bus = null;
    this.source = null;
    this.buffer = null;
    this.loadPromise = null;
  }

  _isPlaying() {
    return (
      !!this.source &&
      !!this.ctx &&
      this.ctx.state === "running" &&
      typeof this.source.stop === "function"
    );
  }

  async _ensureBuffer() {
    if (this.buffer) return this.buffer;
    if (!this.loadPromise) {
      this.loadPromise = fetch(this.url)
        .then((r) => r.arrayBuffer())
        .then((ab) => this.ctx.decodeAudioData(ab))
        .then((buf) => {
          this.buffer = buf;
          return buf;
        })
        .catch((e) => {
          console.error("BGM load failed", e);
          this.buffer = null;
          this.loadPromise = null;
          throw e;
        });
    }
    return this.loadPromise;
  }

  _playBuffer() {
    if (!this.ctx || this.ctx.state === "closed" || !this.buffer) return;
    if (this.source) {
      try {
        this.source.stop();
      } catch (e) {}
    }
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer;
    source.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = this.masterVolume;
    source.connect(gain);
    gain.connect(this.bus);
    try {
      source.start(0);
    } catch (e) {
      console.error("BGM start failed", e);
      return;
    }
    this.source = source;
  }
}
