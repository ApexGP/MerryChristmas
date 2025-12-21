import * as THREE from "three";

// 程序化生成糖果手杖纹理与默认相片纹理
export class TextureFactory {
  static createCandyCaneTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 64, 64);

    ctx.fillStyle = "#ff0000";
    ctx.beginPath();
    for (let i = -64; i < 128; i += 16) {
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 8, 0);
      ctx.lineTo(i + 8 + 64, 64);
      ctx.lineTo(i + 64, 64);
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
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#fceea7";
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = "#d4af37";
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, 246, 246);

    ctx.fillStyle = "#cc0000";
    ctx.font = 'bold 30px "Times New Roman"';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("JOYEUX", 128, 110);
    ctx.fillText("NOEL", 128, 150);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
}
