import * as THREE from "three";

export class UIManager {
  constructor(onFileLoaded) {
    this.loader = document.getElementById("loader");
    this.uiLayer = document.getElementById("ui-layer");
    this.controlsVisible = true;
    this.onFileLoaded = onFileLoaded;

    this.helpButton = document.getElementById("help-button");
    this.helpModal = document.getElementById("help-modal");
    this.helpClose = this.helpModal.querySelector(".help-close");

    this._initEvents();
  }

  hideLoader() {
    this.loader.style.opacity = "0";
    setTimeout(() => (this.loader.style.display = "none"), 1000);
  }

  _initEvents() {
    window.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "h") this._toggleUI();
    });

    document.addEventListener("dblclick", () => this._toggleUI());

    const fileInput = document.getElementById("file-input");
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          new THREE.TextureLoader().load(ev.target.result, (t) => {
            t.colorSpace = THREE.SRGBColorSpace;
            this.onFileLoaded?.(t);
          });
        };
        reader.readAsDataURL(file);
      }
    });

    this.helpButton.addEventListener("click", () => this._toggleHelp(true));
    this.helpClose.addEventListener("click", () => this._toggleHelp(false));
    this.helpModal.addEventListener("click", (e) => {
      if (e.target === this.helpModal) this._toggleHelp(false);
    });
  }

  _toggleUI() {
    this.controlsVisible = !this.controlsVisible;
    this.uiLayer.style.opacity = this.controlsVisible ? "1" : "0";
  }

  _toggleHelp(forceState) {
    const shouldOpen =
      typeof forceState === "boolean"
        ? forceState
        : !this.helpModal.classList.contains("open");
    this.helpModal.classList.toggle("open", shouldOpen);
  }
}
