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

    this._initEvents();
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
    this._resetHideTimer();
  }

  _handleMobileActivity() {
    if (!this.controlsVisible) return;
    this._resetHideTimer();
  }

  _resetHideTimer() {
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this._setUIVisible(false), 5000);
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
