export class UIManager {
  constructor(onFileLoaded, options = {}) {
    this.loader = document.getElementById("loader");
    this.uiLayer = document.getElementById("ui-layer");
    this.controlsVisible = true;
    this.onFileLoaded = onFileLoaded;
    this.isMobile = !!options.isMobile;
    this.hideTimer = null;
    this.longPressTimer = null;
    this.treeShareManager = options.treeShareManager;
    this.uploadWrapper = document.querySelector(".upload-wrapper");
    this.shareButton = document.getElementById("share-button");

    this.helpButton = document.getElementById("help-button");
    this.helpModal = document.getElementById("help-modal");
    this.helpClose = this.helpModal.querySelector(".help-close");

    this._applyResponsiveUI = this._applyResponsiveUI.bind(this);

    this._initEvents();
    this._applyResponsiveUI();
    window.addEventListener("resize", this._applyResponsiveUI, { passive: true });
    window.addEventListener(
      "orientationchange",
      this._applyResponsiveUI,
      { passive: true }
    );
    if (this.isMobile) this._initMobileAutoHide();
  }

  hideLoader() {
    this.loader.style.opacity = "0";
    setTimeout(() => (this.loader.style.display = "none"), 1000);
  }

  _initEvents() {
    if (!this.isMobile) {
      window.addEventListener("keydown", (e) => {
        if (e.key.toLowerCase() === "h") this._toggleUI();
      });
    }

    const fileInput = document.getElementById("file-input");
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        if (this.treeShareManager) {
          this.treeShareManager.handleFile(file);
        } else {
          const reader = new FileReader();
          reader.onload = (ev) => {
            import("three").then((THREE) => {
              new THREE.TextureLoader().load(ev.target.result, (t) => {
                t.colorSpace = THREE.SRGBColorSpace;
                this.onFileLoaded?.(t);
              });
            });
          };
          reader.readAsDataURL(file);
        }
        e.target.value = "";
      }
    });

    if (this.shareButton) {
      const updateShareBtnVisibility = (isViewer) => {
        this.shareButton.style.display = isViewer ? "none" : "inline-block";
      };
      updateShareBtnVisibility(this.treeShareManager?.isViewer);
      this.treeShareManager?.setShareStateChangeCallback?.(
        updateShareBtnVisibility
      );
      this.shareButton.addEventListener("click", () => {
        this.treeShareManager?.copyShareLink();
      });
    }

    this.helpButton.addEventListener("click", () => this._toggleHelp(true));
    this.helpClose.addEventListener("click", () => this._toggleHelp(false));
    this.helpModal.addEventListener("click", (e) => {
      if (e.target === this.helpModal) this._toggleHelp(false);
    });
  }

  _applyResponsiveUI() {
    if (!this.isMobile) return;
    const vw = window.innerWidth || document.documentElement.clientWidth || 360;
    const vh = window.innerHeight || document.documentElement.clientHeight || 640;
    const scale = Math.max(0.7, Math.min(1, Math.min(vw / 520, vh / 900)));

    const heading = this.uiLayer?.querySelector("h1");
    if (heading) {
      const size = Math.round(56 * scale);
      heading.style.fontSize = `${size}px`;
      heading.style.marginTop = `${Math.max(10, 20 * scale)}px`;
    }

    if (this.uploadWrapper) {
      const pad = Math.max(12, 20 * scale);
      const bottom = Math.max(14, 40 * scale);
      this.uploadWrapper.style.padding = `${pad}px`;
      this.uploadWrapper.style.bottom = `${bottom}px`;
      this.uploadWrapper.style.transform = `translateX(-50%) scale(${scale})`;
      this.uploadWrapper.style.transformOrigin = "50% 100%";
    }

    const buttons = this.uploadWrapper?.querySelectorAll(".btn-gold");
    if (buttons?.length) {
      const fontSize = Math.max(12, 16 * scale);
      const padY = Math.max(8, 10 * scale);
      const padX = Math.max(12, 20 * scale);
      const minW = Math.max(120, 160 * scale);
      buttons.forEach((btn) => {
        btn.style.fontSize = `${fontSize}px`;
        btn.style.padding = `${padY}px ${padX}px`;
        btn.style.minWidth = `${minW}px`;
      });
    }

    const hint = this.uploadWrapper?.querySelector(".hint-text");
    if (hint) {
      hint.style.fontSize = `${Math.max(10, 12 * scale)}px`;
      hint.style.marginTop = `${Math.max(6, 10 * scale)}px`;
    }

    if (this.helpButton) {
      const fontSize = Math.max(12, 14 * scale);
      const padY = Math.max(6, 8 * scale);
      const padX = Math.max(10, 16 * scale);
      this.helpButton.style.fontSize = `${fontSize}px`;
      this.helpButton.style.padding = `${padY}px ${padX}px`;
      this.helpButton.style.right = `${Math.max(12, 20 * scale)}px`;
      this.helpButton.style.top = `${Math.max(12, 20 * scale)}px`;
    }
  }

  _toggleUI() {
    this._setUIVisible(!this.controlsVisible);
    if (this.isMobile && this.controlsVisible) this._resetHideTimer();
  }

  _toggleHelp(forceState) {
    const shouldOpen =
      typeof forceState === "boolean"
        ? forceState
        : !this.helpModal.classList.contains("open");
    this.helpModal.classList.toggle("open", shouldOpen);
  }

  _setUIVisible(visible) {
    this.controlsVisible = visible;
    this.uiLayer.style.opacity = visible ? "1" : "0";
    const pointerState = visible ? "auto" : "none";
    if (this.uploadWrapper)
      this.uploadWrapper.style.pointerEvents = pointerState;
    if (this.helpButton) this.helpButton.style.pointerEvents = pointerState;
    if (this.shareButton) this.shareButton.style.pointerEvents = pointerState;
  }

  _initMobileAutoHide() {
    const activity = () => this._handleMobileActivity();
    window.addEventListener("touchstart", (e) => {
      activity();
      this._scheduleLongPress();
    });
    window.addEventListener("touchmove", activity, { passive: true });
    window.addEventListener("touchend", () => {
      activity();
      this._cancelLongPress();
    });
    this._resetHideTimer(10000);
  }

  _handleMobileActivity() {
    if (!this.controlsVisible) return;
    this._resetHideTimer();
  }

  _resetHideTimer(duration = 5000) {
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(
      () => this._setUIVisible(false),
      Math.max(1000, duration)
    );
  }

  _scheduleLongPress() {
    this._cancelLongPress();
    this.longPressTimer = setTimeout(() => {
      this._setUIVisible(true);
      this._resetHideTimer();
    }, 700);
  }

  _cancelLongPress() {
    clearTimeout(this.longPressTimer);
  }
}
