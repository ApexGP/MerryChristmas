import * as THREE from "three";
import { TextureFactory } from "./textureFactory.js";

const CLOUD_NAME = "db9sbghsk";
const UPLOAD_PRESET = "ChristmasTree";
const FOLDER = "xmas_tree";
const API = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
const CDN_BASE = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload`;
const MAX_POOL = 24;
const INPUT_MAX_BYTES = 10 * 1024 * 1024; // 10MB input guard
const RETRY_DELAYS = [600, 1200];
const TOAST_DURATION = 2600;
const CACHE_KEY_IDS = "xmas_tree_public_ids";
const CACHE_KEY_AUTHOR = "xmas_tree_author";
const ZH = /^zh/i;

async function loadCompressor() {
  if (loadCompressor.cache) return loadCompressor.cache;
  loadCompressor.cache = import(
    "https://cdn.jsdelivr.net/npm/browser-image-compression@2.0.2/dist/browser-image-compression.mjs"
  ).then((mod) => mod.default || mod);
  return loadCompressor.cache;
}

// TreeShareManager coordinates compression→upload→share URL plus local caching for photo textures.
export class TreeShareManager {
  constructor(options = {}) {
    this.particleSystem = options.particleSystem;
    this.onUploadStart = options.onUploadStart;
    this.onUploadSuccess = options.onUploadSuccess;
    this.onUploadError = options.onUploadError;
    this.publicIds = [];
    this.loadedIds = new Set();
    this.appliedIds = new Set();
    this.shareIdsFromUrl = this._getShareIdsFromUrl();
    this.defaultTextureFactory =
      options.defaultTextureFactory ||
      (() => TextureFactory.createDefaultPhotoTexture());
    this.toast = (msg) => this._showToast(msg);
    this.isViewer = this._isViewerFromUrl();
    this.onShareStateChange = options.onShareStateChange;
    this.isZh = this._detectZh();

    this._ensureToastContainer();
    this._hydrate();
  }

  setShareStateChangeCallback(cb) {
    this.onShareStateChange = cb;
  }

  async handleFile(file) {
    try {
      this.onUploadStart?.(file);
      this._validateInput(file);
      const hash = await this._computeHash(file);
      const compressed = await this._compress(file).catch(() => {
        this.toast(this._msg("compressFallback"));
        return file;
      });
      const { publicId, secureUrl, fromCache } = await this._uploadWithRetry(
        compressed,
        hash
      );
      await this._applyTexture(publicId);
      this._pushPublicId(publicId);
      if (!this.isViewer) {
        this._updateShareUrl(this.publicIds);
        await this._copyLink();
        this.toast(fromCache ? this._msg("reuse") : this._msg("uploaded"));
      } else {
        this._markAuthor();
        this.toast(this._msg("viewerUpload"));
      }
      this._persistPublicIds();
      this.onUploadSuccess?.({ publicId, secureUrl, fromCache });
    } catch (err) {
      console.error("Upload flow failed", err);
      this.onUploadError?.(err);
      this.toast(err?.message || this._msg("uploadFail"));
    }
  }

  async _hydrate() {
    await this._hydrateFromUrl();
    if (!this.publicIds.length) {
      await this._hydrateFromCache();
    }
  }

  async copyShareLink() {
    if (this.isViewer) {
      this.toast(this._msg("noReshare"));
      return;
    }
    if (!this.publicIds.length) {
      this.toast(this._msg("emptyShare"));
      return;
    }
    this._updateShareUrl(this.publicIds);
    await this._copyLink();
  }

  async _hydrateFromUrl() {
    // Prefer URL params (shared links) to hydrate textures on load
    const ids = this.shareIdsFromUrl?.length
      ? this.shareIdsFromUrl
      : this._getShareIdsFromUrl();
    if (!ids.length) return;
    for (const id of ids) {
      try {
        const normalizedId = id.includes("/") ? id : `${FOLDER}/${id}`;
        await this._applyTexture(normalizedId);
        this._pushPublicId(normalizedId);
      } catch (e) {
        console.warn("Failed to hydrate texture", id, e);
      }
    }
    this._updateShareUrl(this.publicIds);
  }

  _validateInput(file) {
    const typeOk = /image\/jpe?g|image\/png/i.test(file.type || "");
    if (!typeOk) {
      throw new Error(this._msg("type"));
    }
    if (file.size > INPUT_MAX_BYTES) {
      throw new Error(this._msg("size"));
    }
  }

  async _computeHash(file) {
    const buf = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buf);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async _compress(file) {
    const imageCompression = await loadCompressor();
    return imageCompression(file, {
      maxSizeMB: 5, // softer compression to preserve detail
      maxWidthOrHeight: 1920,
      useWebWorker: true,
      maxIteration: 8,
      fileType: "image/jpeg",
      alwaysKeepResolution: false,
    });
  }

  async _uploadWithRetry(blob, publicId) {
    let attempt = 0;
    let lastError;
    while (attempt <= RETRY_DELAYS.length) {
      try {
        return await this._uploadOnce(blob, publicId);
      } catch (err) {
        lastError = err;
        const isRetryable =
          err?.status === 429 || (err?.status && err.status >= 500);
        if (!isRetryable || attempt === RETRY_DELAYS.length) break;
        const delay = RETRY_DELAYS[attempt];
        this.toast(this._msg("retry", { n: attempt + 1 }));
        await new Promise((res) => setTimeout(res, delay));
        attempt += 1;
      }
    }
    throw lastError || new Error("上传失败");
  }

  async _uploadOnce(blob, publicId) {
    const form = new FormData();
    form.append("file", blob);
    form.append("upload_preset", UPLOAD_PRESET);
    form.append("public_id", publicId);
    form.append("folder", FOLDER);
    form.append("tags", "xmas-tree,user-upload");

    const resp = await fetch(API, { method: "POST", body: form });
    if (resp.ok) {
      const data = await resp.json();
      return {
        publicId: data.public_id,
        secureUrl: data.secure_url,
        fromCache: false,
      };
    }

    if (resp.status === 409) {
      // Exists already; treat as success. Folder is part of public_id.
      return {
        publicId: `${FOLDER}/${publicId}`,
        secureUrl: `${CDN_BASE}/${FOLDER}/${publicId}.jpg`,
        fromCache: true,
      };
    }

    const errText = await resp.text().catch(() => "");
    const err = new Error(
      errText || `Upload failed with status ${resp.status}`
    );
    err.status = resp.status;
    throw err;
  }

  async _applyTexture(publicId) {
    const normalizedId = publicId.includes("/")
      ? publicId
      : `${FOLDER}/${publicId}`;
    if (this.loadedIds.has(normalizedId)) return null;
    const url = `${CDN_BASE}/${normalizedId}.jpg`;
    try {
      const texture = await this._loadTexture(url);
      this.particleSystem?.addPhoto(texture);
      this.loadedIds.add(normalizedId);
      return texture;
    } catch (e) {
      const fallback = this.defaultTextureFactory();
      this.particleSystem?.addPhoto(fallback);
      this.loadedIds.add(normalizedId);
      this.toast(this._msg("loadFail"));
      return fallback;
    }
  }

  _pushPublicId(id) {
    const normalizedId = id.includes("/") ? id : `${FOLDER}/${id}`;
    const existingIndex = this.publicIds.indexOf(normalizedId);
    if (existingIndex !== -1) {
      this.publicIds.splice(existingIndex, 1);
    }
    this.publicIds.push(normalizedId);
    if (this.publicIds.length > MAX_POOL) {
      this.publicIds.splice(0, this.publicIds.length - MAX_POOL);
    }
  }

  _updateShareUrl(ids) {
    if (this.isViewer) return;
    const params = new URLSearchParams(window.location.search);
    if (!ids || !ids.length) {
      params.delete("texture");
      params.delete("textures");
    } else if (ids.length === 1) {
      params.set("texture", ids[0]);
      params.delete("textures");
    } else {
      params.set("textures", ids.join(","));
      params.delete("texture");
    }
    const newSearch = params.toString();
    const newUrl = newSearch
      ? `${window.location.pathname}?${newSearch}`
      : window.location.pathname;
    window.history.pushState({}, "", newUrl);
  }

  _getShareIdsFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const texturesParam = params.get("textures");
    const single = params.get("texture");
    let ids = [];
    if (texturesParam) {
      ids = texturesParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (single) {
      ids = [single.trim()];
    }
    return Array.from(new Set(ids)).slice(0, MAX_POOL);
  }

  _isViewerFromUrl() {
    const ids =
      this.shareIdsFromUrl && this.shareIdsFromUrl.length
        ? this.shareIdsFromUrl
        : this._getShareIdsFromUrl();
    return ids.length > 0;
  }

  _hasAuthorFlag() {
    try {
      return (
        sessionStorage.getItem(CACHE_KEY_AUTHOR) === "1" ||
        localStorage.getItem(CACHE_KEY_AUTHOR) === "1"
      );
    } catch (e) {
      return false;
    }
  }

  _markAuthor() {
    const prev = this.isViewer;
    this.isViewer = false;
    try {
      sessionStorage.setItem(CACHE_KEY_AUTHOR, "1");
      localStorage.setItem(CACHE_KEY_AUTHOR, "1");
    } catch (e) {}
    if (prev && typeof this.onShareStateChange === "function") {
      this.onShareStateChange(false);
    }
  }

  _persistPublicIds() {
    if (this.isViewer) return;
    try {
      const payload = JSON.stringify({ ids: this.publicIds, ts: Date.now() });
      localStorage.setItem(CACHE_KEY_IDS, payload);
    } catch (e) {}
  }

  _hydrateFromCache() {
    // Load previously uploaded ids for the author to avoid redundant uploads
    try {
      const raw = localStorage.getItem(CACHE_KEY_IDS);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const ids = Array.isArray(parsed?.ids) ? parsed.ids : [];
      if (!ids.length) return;
      const sliced = ids.slice(-MAX_POOL);
      sliced.forEach((id) => {
        const normalizedId = id.includes("/") ? id : `${FOLDER}/${id}`;
        this.publicIds.push(normalizedId);
      });
      this.publicIds = Array.from(new Set(this.publicIds)).slice(-MAX_POOL);
      // preload textures for cached author session
      this.publicIds.forEach((id) => {
        this._applyTexture(id).catch((e) =>
          console.warn("Cache hydrate fail", id, e)
        );
      });
      this.isViewer = false;
      this.onShareStateChange?.(false);
    } catch (e) {
      console.warn("Failed to hydrate cache", e);
    }
  }

  async _copyLink() {
    const link = window.location.href;
    try {
      await navigator.clipboard.writeText(link);
      this.toast(this._msg("copied"));
    } catch (e) {
      window.prompt(this._msg("copyPrompt"), link);
    }
  }

  _loadTexture(url) {
    return new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(
        url,
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          resolve(t);
        },
        undefined,
        (err) => reject(err)
      );
    });
  }

  _ensureToastContainer() {
    if (document.getElementById("toast-container")) return;
    const style = document.createElement("style");
    style.textContent = `
      #toast-container { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 9999; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
      .toast { min-width: 200px; max-width: 320px; background: rgba(0,0,0,0.8); color: #fff; padding: 10px 14px; border-radius: 8px; font-size: 14px; box-shadow: 0 6px 18px rgba(0,0,0,0.25); text-align: center; }
    `;
    document.head.appendChild(style);
    const container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }

  _showToast(message) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = message;
    container.appendChild(node);
    setTimeout(() => {
      node.style.opacity = "0";
      node.style.transition = "opacity 0.3s";
      setTimeout(() => node.remove(), 300);
    }, TOAST_DURATION);
  }

  // Bilingual message helper with simple templating
  _msg(key, vars = {}) {
    const zh = {
      compressFallback: "压缩失败，直接上传原图，可能消耗流量",
      reuse: "图片已存在，直接复用并生成链接",
      uploaded: "已上传并复制分享链接",
      viewerUpload: "上传成功，可继续创作并分享",
      uploadFail: "上传失败，请稍后重试",
      noReshare: "当前链接不可再次分享",
      emptyShare: "暂无可分享的图片",
      type: "仅支持 jpg/jpeg/png 图片",
      size: "图片过大，请控制在 10MB 以内",
      retry: `服务器繁忙，重试中 (${vars.n || 1})...`,
      loadFail: "图片加载失败，已使用默认纹理",
      copied: "分享链接已复制",
      copyPrompt: "无法自动复制，请手动复制链接",
    };
    const en = {
      compressFallback:
        "Compression failed. Uploading original (may use more data)",
      reuse: "Image already exists; reused and link updated",
      uploaded: "Uploaded and link copied",
      viewerUpload: "Upload succeeded. You can keep creating and share",
      uploadFail: "Upload failed. Please try again later",
      noReshare: "This shared link cannot be reshared",
      emptyShare: "No photos to share yet",
      type: "Only jpg/jpeg/png are supported",
      size: "Image too large; keep within 10MB",
      retry: `Server busy, retrying (${vars.n || 1})...`,
      loadFail: "Image load failed; default texture applied",
      copied: "Share link copied",
      copyPrompt: "Copy this link manually",
    };
    return this.isZh ? zh[key] || en[key] || "" : en[key] || zh[key] || "";
  }

  _detectZh() {
    const lang = navigator.language || navigator.userLanguage || "";
    const langs = navigator.languages || [];
    return ZH.test(lang) || langs.some((l) => ZH.test(l || ""));
  }
}
