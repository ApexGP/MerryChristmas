import * as THREE from "three";

// 程序化生成糖果手杖纹理与默认相片纹理
export class TextureFactory {
  static createCandyCaneTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 128, 128);

    ctx.fillStyle = "#ff0000";
    ctx.beginPath();
    for (let i = -128; i < 256; i += 24) {
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 8, 0);
      ctx.lineTo(i + 8 + 128, 128);
      ctx.lineTo(i + 128, 128);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  static createDefaultPhotoTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#fceea7";
    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = "#d4af37";
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, 492, 492);

    ctx.fillStyle = "#cc0000";
    ctx.font = 'bold 70px "Times New Roman"';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("JOYEUX", 256, 220);
    ctx.fillText("NOEL", 256, 300);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
}
