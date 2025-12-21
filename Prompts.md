# **角色：世界级创意技术专家 (Three.js & CV 领域)**

## **项目目标**

创建一个名为 "Christmas Tree Vision" 的单文件 HTML 项目。该项目需无缝集成 3D 粒子系统与 Google MediaPipe 手势识别，展现出节日氛围与顶尖的 WebGL 交互技术。

## **核心约束 (至关重要)**

1. **单文件架构 (Single File Only)**：所有 HTML、CSS 和 JavaScript 必须包含在同一个 .html 文件中。  
2. **零本地资源 (No Local Assets)**：禁止引用任何本地图片或模型文件。所有纹理必须通过 Canvas 2D API 程序化生成，或使用 Base64 编码。  
3. **模块化系统**：必须使用 \<script type="importmap"\> 来管理第三方依赖。  
4. **版本锁定**：  
   * Three.js: v0.160.0  
   * MediaPipe Tasks Vision: v0.10.3

## **技术栈与依赖配置**

请严格使用以下 Import Map 配置：

``` html
<script type="importmap">  
  {  
    "imports": {  
      "three": "[https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js](https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js)",  
      "three/addons/": "[https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/](https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/)",  
      "@mediapipe/tasks-vision": "[https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/+esm](https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/+esm)"  
    }  
  }  
</script>
```

## **架构与逻辑流**

在编写代码前，请构建以下类结构：

1. `App`：主入口类，负责初始化 Three.js 场景、渲染循环 (Render Loop) 和窗口尺寸调整 (Resize)。  
2. `VisionManager`：单例类，封装 MediaPipe 逻辑。**关键点**：在初始化 FilesetResolver 时，必须显式指定 wasm 文件的完整 CDN 路径，以防止 404 错误。  
3. `ParticleSystem`：管理 4000+ 个粒子，包含几何体生成、纹理映射和状态机逻辑。  
4. `UIManager`：处理 DOM 元素交互、加载器 (Loader) 状态和文件上传逻辑。

## **详细开发规格**

### **1\. 视觉识别设计 (UI/CSS)**

* **字体**：标题使用 'Cinzel'，正文使用 'Times New Roman'。  
* **配色**：背景色 \#000000，主金色 \#d4af37，奶油白 \#fceea7。  
* **组件细节**：  
  * **加载器 (Loader)**：黑色全屏遮罩，中间放置 40px 金色旋转器（仅顶部边框 border-top 有色），下方文字显示 "LOADING HOLIDAY MAGIC"。初始化完成后淡出。  
  * **标题**：\<h1\>Merry Christmas\</h1\>，字号 56px，使用线性渐变（白到金）填充文字，并添加辉光文字阴影。  
  * **控制区**：.upload-wrapper 容器，按钮需应用背景模糊 (backdrop-filter: blur) 和金色边框。按钮文字："ADD MEMORIES"。  
  * **提示文本**："Press 'H' to Hide Controls"（请添加触摸事件监听，支持移动端双击隐藏 UI）。  
  * **摄像头预览**：在右下角放置不可见 (opacity: 0\) 的 \<video\> 和 \<canvas\> 元素 (160x120)。

### **2\. Three.js 场景设置**

* **渲染器**：开启抗锯齿 (antialias: true)，使用 ReinhardToneMapping (曝光度 2.2)。  
* **相机**：透视相机，位置设为 (0, 2, 50)。  
* **环境**：使用 RoomEnvironment 配合 PMREMGenerator 生成高光泽金属反射环境贴图。  
* **后期处理**：使用 EffectComposer 添加 UnrealBloomPass (辉光)。参数：resolution (窗口大小), strength: 0.45, radius: 0.4, threshold: 0.7。  
* **灯光系统**：  
  * 环境光 (Ambient): 强度 0.6。  
  * 点光源 (Point): 橙色，强度 2，置于内部。  
  * 聚光灯 (Spot): 金色，强度 1200，位置 (30, 40, 40)。  
  * 聚光灯 (Spot): 蓝色，强度 600，位置 (-30, 20, \-30)，用于冷暖对比。

### **3\. 内容与粒子系统**

* **粒子总数**：约 1500 个主体粒子 \+ 约 2500 个尘埃粒子。  
* **几何体 (Geometries)**：  
  * BoxGeometry：材质为金色和深绿色 MeshStandardMaterial。  
  * SphereGeometry：材质为金色和红色 MeshPhysicalMaterial (红色带清漆层 clearcoat)。  
  * **糖果手杖 (Candy Cane)**：使用 TubeGeometry 沿 CatmullRomCurve3 (弯钩形状) 生成。**纹理要求**：必须使用 Canvas 2D API 程序化绘制白底红斜纹，并设置纹理重复包裹 (Repeat Wrapping)。  
* **照片墙功能**：  
  * 默认纹理：带有 "JOYEUX NOEL" 文字的 Canvas 贴图。  
  * 相框：包裹照片的金色 BoxGeometry。  
  * **上传逻辑 (必须精确实现)**：
  
  ``` JavaScript  
    reader.onload = (ev) => {  
        new THREE.TextureLoader().load(ev.target.result, (t) => {  
            t.colorSpace = THREE.SRGBColorSpace; // 关键：修正色彩空间  
            addPhotoToScene(t);  
        });  
    }
  ```

### **4\. 动画状态机 (Animation State Machine)**

定义全局 STATE 对象控制 lerp 插值过渡。

* **模式 1: TREE (圣诞树)**  
  * 螺旋圆锥公式：radius \= maxRadius \* (1 \- t), angle \= t \* 50 \* PI。  
* **模式 2: SCATTER (散落)**  
  * 分布：半径 8\~20 的球体范围。  
  * **动态**：粒子必须根据其随机速度向量进行自转 (Self-rotation)。  
* **模式 3: FOCUS (聚焦)**  
  * 目标：随机选中一个 type \=== 'PHOTO' 的粒子。  
  * 动作：将目标移动至相机前方 (0, 2, 35\) 并放大至 4.5 倍。其他粒子散开作为背景。

### **5\. 计算机视觉集成 (MediaPipe)**

* **配置**：使用 HandLandmarker，设置 delegate: "GPU" 以提升性能。  
* **手势识别算法**：  
  * **捏合 (Pinch)**：拇指与食指距离 \< 0.05 \-\> 触发 **FOCUS** 模式。  
  * **握拳 (Fist)**：四指尖到手腕平均距离 \< 0.25 \-\> 触发 **TREE** 模式。  
  * **张开手掌 (Open Hand)**：四指尖到手腕平均距离 \> 0.4 \-\> 触发 **SCATTER** 模式。  
* **交互映射**：  
  * 将手掌中心 (Landmark 9\) 的标准化 X/Y 坐标，映射为 3D 场景根容器的 rotation.y 和 rotation.x。

## **输出要求**

请输出**一段完整的、可直接运行的 HTML 代码**。不要使用 Markdown 代码块分割 HTML、CSS 和 JS，将它们全部内联在 index.html 结构中。确保代码包含详细的注释，特别是对复杂的 3D 向量计算和 CV 逻辑进行解释。
