'use strict';
// HD-2D風 3Dレンダラー(素のWebGL・依存ゼロ)
// 地形をボクセル押し出しで立体化し、キャラ・エフェクトは既存の2D描画コードを
// 透視投影した位置に奥行きソートで重ね描きする。設定で2D/3D切替可。
G.R3D = (() => {
  const T = G.TILE;
  let gl = null, glCanvas = null, prog = null, ok = false;
  let skyProg = null, skyVbo = null, atlasTex = null;
  let zoneKey = null, vbo = null, vertCount = 0;
  let waterVbo = null, waterCount = 0;
  let cam = null;
  // ポストプロセス(ブルーム)
  let bloomOk = false, ppW = 0, ppH = 0;
  let brightProg = null, blurProg = null, compProg = null;
  let sceneFbo = null, sceneTex = null, sceneDepth = null;
  let bloomA = null, bloomB = null;
  // シャドウマッピング
  let shadowOk = false, depthProg = null, shadowFbo = null, shadowTex = null, shadowRb = null;
  const SHADOW_SIZE = 512; // 1024→512(4倍軽)
  let lightVP = null;

  // ---- 最小限の行列演算 ----
  const M4 = {
    mul(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
      return o;
    },
    persp(fovY, aspect, near, far) {
      const f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
      return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
    },
    ortho(l, r, b, t, near, far) {
      const lr = 1 / (l - r), bt = 1 / (b - t), nf = 1 / (near - far);
      return new Float32Array([
        -2 * lr, 0, 0, 0, 0, -2 * bt, 0, 0, 0, 0, 2 * nf, 0,
        (l + r) * lr, (t + b) * bt, (far + near) * nf, 1,
      ]);
    },
    lookAt(eye, ctr, up) {
      const zx = eye[0] - ctr[0], zy = eye[1] - ctr[1], zz = eye[2] - ctr[2];
      const zl = Math.hypot(zx, zy, zz); const z = [zx / zl, zy / zl, zz / zl];
      const xx = up[1] * z[2] - up[2] * z[1], xy = up[2] * z[0] - up[0] * z[2], xz = up[0] * z[1] - up[1] * z[0];
      const xl = Math.hypot(xx, xy, xz); const x = [xx / xl, xy / xl, xz / xl];
      const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
      return new Float32Array([
        x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
        -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
        -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
        -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]), 1,
      ]);
    },
  };

  const VSH = `
attribute vec3 aPos; attribute vec4 aCol; attribute vec2 aUV; attribute vec3 aNrm;
uniform mat4 uVP; uniform vec3 uTint; uniform float uTime;
varying vec4 vCol; varying float vDepth; varying vec3 vW; varying vec2 vUV; varying vec3 vN;
void main(){
  vec3 p = aPos;
  vW = aPos; vUV = aUV; vN = aNrm;
  float glint = 0.0;
  if (aCol.a < 0.9) { // 水面: 波でうねり、頂点ごとに煌めく
    float w = sin(uTime*2.1 + p.x*0.085 + p.z*0.06) + sin(uTime*3.3 + p.z*0.11);
    p.y += w * 1.4;
    glint = max(0.0, w) * 0.07;
  }
  gl_Position = uVP * vec4(p, 1.0);
  vCol = vec4(aCol.rgb * uTint + glint, aCol.a);
  vDepth = gl_Position.w;
}`;
  // 空: グラデーション+太陽/月+星(全て手続き生成)
  const VSKY = `
attribute vec2 aP; varying vec2 vP;
void main(){ vP = aP; gl_Position = vec4(aP, 0.9995, 1.0); }`;
  const FSKY = `
precision mediump float; varying vec2 vP;
uniform vec3 uZen, uHor, uCelCol, uCloudCol;
uniform vec2 uCel; uniform float uCelR, uStar, uAspect, uSkyT, uCloudAmt;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main(){
  float ty = clamp(vP.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(uHor, uZen, pow(ty, 1.35));
  vec2 sp = vec2(vP.x * uAspect, vP.y);
  vec2 cp = vec2(uCel.x * uAspect, uCel.y);
  float d = distance(sp, cp);
  col += uCelCol * (smoothstep(uCelR, uCelR * 0.55, d) + 0.32 * smoothstep(uCelR * 3.4, uCelR, d));
  if (uStar > 0.01) {
    vec2 g = floor(sp * 85.0);
    float h = hash(g);
    if (h > 0.994) {
      vec2 c2 = (g + 0.5) / 85.0;
      float dd = distance(sp, c2);
      col += vec3(1.0) * uStar * smoothstep(0.0045, 0.0, dd) * (0.4 + 0.6 * hash(g + 7.0));
    }
  }
  if (uCloudAmt > 0.01) { // ゆっくり流れる雲(二層ノイズ)
    float cl = vnoise(sp * 2.6 + vec2(uSkyT * 0.012, 0.0)) * 0.62
             + vnoise(sp * 6.5 + vec2(uSkyT * 0.03, 3.7)) * 0.38;
    cl = smoothstep(0.52, 0.78, cl) * smoothstep(0.34, 0.62, ty) * uCloudAmt;
    col = mix(col, uCloudCol, cl * 0.9);
  }
  gl_FragColor = vec4(col, 1.0);
}`;
  const FSH = `
precision highp float;
varying vec4 vCol; varying float vDepth; varying vec3 vW; varying vec2 vUV; varying vec3 vN;
uniform vec3 uFog; uniform float uFogDen; uniform highp float uTime; uniform float uCldSh;
uniform sampler2D uTex; uniform float uTexOn; uniform float uBumpOn;
uniform vec3 uSunDir, uSunCol, uSkyC, uGndC, uEye, uZenC, uHorC;
uniform mat4 uLVP; uniform sampler2D uShadow; uniform float uShadowOn;
float unpackD(vec4 c){ return dot(c, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0)); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float vn(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i+vec2(1.,0.)), f.x), mix(h2(i+vec2(0.,1.)), h2(i+vec2(1.,1.)), f.x), f.y);
}
void main(){
  // ---- アルベド(素の色 × 質感) + バンプ法線 ----
  vec3 c = vCol.rgb;
  vec3 N = normalize(vN);
  if (uTexOn > 0.5 && vUV.x >= 0.0) {
    float det = texture2D(uTex, vUV).r;
    c *= (0.46 + det * 0.62);
    if (uBumpOn > 0.5) {
      float o = 1.5 / 256.0;
      float dU = texture2D(uTex, vUV + vec2(o, 0.0)).r - texture2D(uTex, vUV - vec2(o, 0.0)).r;
      float dV = texture2D(uTex, vUV + vec2(0.0, o)).r - texture2D(uTex, vUV - vec2(0.0, o)).r;
      vec3 up2 = abs(N.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
      vec3 T = normalize(cross(up2, N));
      vec3 Bt = cross(N, T);
      N = normalize(N - (T * dU + Bt * dV) * 2.4);
    }
  } else {
    vec2 q = vW.xz + vW.y * 0.6;
    float g = vn(q * 0.16) * 0.45 + vn(q * 0.75) * 0.35 + vn(q * 3.1) * 0.20;
    c *= (0.92 + g * 0.16);
  }
  // ---- 物理ベース風ライティング(平行光+半球環境光+リム) ----
  float ndl = max(0.0, dot(N, uSunDir));
  // やわらかい影の縁 + 太陽光
  float sh = smoothstep(0.0, 0.35, ndl);
  vec3 sun = uSunCol * (ndl * 0.75 + sh * 0.25);
  // シャドウマップ(建物・樹が地面へ落とす影)
  if (uShadowOn > 0.5 && ndl > 0.0) {
    vec4 lp = uLVP * vec4(vW, 1.0);
    vec3 pc = lp.xyz / lp.w * 0.5 + 0.5;
    if (pc.x > 0.005 && pc.x < 0.995 && pc.y > 0.005 && pc.y < 0.995 && pc.z < 1.0) {
      float bias = max(0.0016, 0.006 * (1.0 - ndl));
      float cur = pc.z - bias;
      float tx = 1.0 / 512.0;
      // 5タップ十字PCF(3x3=9タップ→5タップに削減、体感変わらず高速)
      float lit = 0.0;
      lit += cur <= unpackD(texture2D(uShadow, pc.xy)) ? 1.0 : 0.0;
      lit += cur <= unpackD(texture2D(uShadow, pc.xy + vec2(tx, 0.0))) ? 1.0 : 0.0;
      lit += cur <= unpackD(texture2D(uShadow, pc.xy - vec2(tx, 0.0))) ? 1.0 : 0.0;
      lit += cur <= unpackD(texture2D(uShadow, pc.xy + vec2(0.0, tx))) ? 1.0 : 0.0;
      lit += cur <= unpackD(texture2D(uShadow, pc.xy - vec2(0.0, tx))) ? 1.0 : 0.0;
      float shd = lit / 5.0;
      sun *= 0.12 + 0.88 * shd;
    }
  }
  float hemi = 0.5 + 0.5 * N.y;
  vec3 amb = mix(uGndC, uSkyC, hemi);
  vec3 light = amb + sun;
  // フレネル・リム(輪郭がふわっと光る=立体感)
  vec3 V = normalize(uEye - vW);
  float rim = pow(1.0 - max(0.0, dot(N, V)), 3.5);
  light += uSkyC * rim * 0.6;
  c *= light;
  // 水面: 空の反射 + 太陽のスペキュラ + きらめき
  if (vCol.a < 0.9) {
    // さざ波で法線を微揺らし
    vec3 wN = normalize(vec3(sin(vW.x * 0.10 + uTime * 1.6) * 0.10, 1.0, cos(vW.z * 0.12 + uTime * 1.3) * 0.10));
    // 空の映り込み(フレネル): 浅い角度ほど強く反射
    float fres = pow(1.0 - max(0.05, V.y), 3.2);
    vec3 R = reflect(-V, wN);
    vec3 refl = mix(uHorC, uZenC, clamp(R.y, 0.0, 1.0));
    c = mix(c, refl, fres * 0.72);
    // 光のコースティクス
    float sp = vn(vW.xz * 0.9 + vec2(uTime * 0.35, uTime * 0.22));
    c += vec3(0.08, 0.10, 0.11) * smoothstep(0.74, 0.95, sp);
    // 太陽のギラつき(鏡面反射)
    vec3 H = normalize(uSunDir + V);
    float spec = pow(max(0.0, dot(wN, H)), 90.0);
    c += uSunCol * spec * 1.6;
  }
  if (uCldSh > 0.01) { // ゆっくり流れる雲の影
    float cs2 = smoothstep(0.55, 0.80, vn(vW.xz * 0.012 + vec2(uTime * 0.009, uTime * 0.004)));
    c *= 1.0 - cs2 * 0.12 * uCldSh;
  }
  // トーンマッピング(ハイライトを白飛びさせず締める)
  c = c / (c + vec3(0.85)) * 1.85;
  float f = clamp(1.0 - exp(-uFogDen * vDepth * 0.0016), 0.0, 1.0);
  gl_FragColor = vec4(mix(c, uFog, f), vCol.a);
}`;

  const init = () => {
    try {
      glCanvas = document.createElement('canvas');
      glCanvas.id = 'gl';
      glCanvas.style.cssText = 'position:fixed;left:0;top:0;z-index:0;display:none;';
      const ui = document.getElementById('game');
      ui.style.position = 'relative'; ui.style.zIndex = '1';
      document.body.insertBefore(glCanvas, ui);
      glCanvas.style.filter = 'saturate(1.28) contrast(1.10) brightness(1.02)'; // 色グレーディング(濃厚化)
      gl = glCanvas.getContext('webgl', { antialias: true });
      if (!gl) return false;
      const sh = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VSH));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FSH));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link failed');
      // 空プログラム
      skyProg = gl.createProgram();
      gl.attachShader(skyProg, sh(gl.VERTEX_SHADER, VSKY));
      gl.attachShader(skyProg, sh(gl.FRAGMENT_SHADER, FSKY));
      gl.linkProgram(skyProg);
      if (!gl.getProgramParameter(skyProg, gl.LINK_STATUS)) throw new Error('sky link failed');
      skyVbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, skyVbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      // ---- ポストプロセス(ブルーム)プログラム ----
      try {
        const VPP = `attribute vec2 aP; varying vec2 vUv; void main(){ vUv = aP*0.5+0.5; gl_Position = vec4(aP,0.0,1.0); }`;
        const FBRIGHT = `precision mediump float; varying vec2 vUv; uniform sampler2D uT; uniform float uThr;
          void main(){ vec3 c = texture2D(uT, vUv).rgb; float l = dot(c, vec3(0.299,0.587,0.114));
            float k = max(0.0, l - uThr) / max(l, 0.001); gl_FragColor = vec4(c * k, 1.0); }`;
        const FBLUR = `precision mediump float; varying vec2 vUv; uniform sampler2D uT; uniform vec2 uDir;
          void main(){ vec3 s = texture2D(uT, vUv).rgb * 0.227;
            s += texture2D(uT, vUv + uDir*1.384).rgb * 0.316;
            s += texture2D(uT, vUv - uDir*1.384).rgb * 0.316;
            s += texture2D(uT, vUv + uDir*3.230).rgb * 0.070;
            s += texture2D(uT, vUv - uDir*3.230).rgb * 0.070;
            gl_FragColor = vec4(s, 1.0); }`;
        const FCOMP = `precision mediump float; varying vec2 vUv; uniform sampler2D uScene, uBloom; uniform float uAmt;
          void main(){ vec3 sc = texture2D(uScene, vUv).rgb; vec3 bl = texture2D(uBloom, vUv).rgb;
            vec3 c = sc + bl * uAmt;
            // 周辺減光(ビネット)
            float d = distance(vUv, vec2(0.5)); c *= smoothstep(0.95, 0.45, d) * 0.25 + 0.75;
            gl_FragColor = vec4(c, 1.0); }`;
        const mkProg = (fs) => {
          const p = gl.createProgram();
          gl.attachShader(p, sh(gl.VERTEX_SHADER, VPP));
          gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
          gl.linkProgram(p);
          if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('pp link');
          return p;
        };
        brightProg = mkProg(FBRIGHT); blurProg = mkProg(FBLUR); compProg = mkProg(FCOMP);
        bloomOk = true;
      } catch (e) { bloomOk = false; console.warn('bloom disabled', e); }

      // ---- シャドウマップ: 光源視点の深度を RGBA パックで描く ----
      try {
        const VDEP = `attribute vec3 aPos; uniform mat4 uLVP; varying float vD;
          void main(){ vec4 p = uLVP * vec4(aPos,1.0); gl_Position = p; vD = p.z/p.w*0.5+0.5; }`;
        const FDEP = `precision highp float; varying float vD;
          vec4 packD(float d){ vec4 e = fract(vec4(1.0,255.0,65025.0,16581375.0)*d);
            e -= e.yzww * vec4(1.0/255.0,1.0/255.0,1.0/255.0,0.0); return e; }
          void main(){ gl_FragColor = packD(vD); }`;
        depthProg = gl.createProgram();
        gl.attachShader(depthProg, sh(gl.VERTEX_SHADER, VDEP));
        gl.attachShader(depthProg, sh(gl.FRAGMENT_SHADER, FDEP));
        gl.linkProgram(depthProg);
        if (!gl.getProgramParameter(depthProg, gl.LINK_STATUS)) throw new Error('depth link');
        shadowTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, shadowTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SHADOW_SIZE, SHADOW_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        shadowFbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shadowTex, 0);
        shadowRb = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, shadowRb);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, SHADOW_SIZE, SHADOW_SIZE);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, shadowRb);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        shadowOk = true;
      } catch (e) { shadowOk = false; console.warn('shadow disabled', e); }

      // テクスチャアトラス(プロシージャル生成)をGPUへ
      if (G.Tex && G.Tex.build && G.Tex.build() && G.Tex.canvas) {
        atlasTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, atlasTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, G.Tex.canvas);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      ok = true;
      return true;
    } catch (e) { console.warn('R3D init failed → 2D継続', e); ok = false; return false; }
  };

  const active = () => ok && G.settings && G.settings.render3d && G.player && G.world.zone && G.game.modeStack[0] !== 'title';

  // ---- タイル→3Dパラメータ ----
  const HEIGHT = { '#': 30, 'w': 34, 'T': 34, 'c': 26, '*': 22, '^': 24, 'D': 40, 'M': 40, ' ': 46 };
  const hexRGB = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  const BASECOL = {
    s: '#cdb787', f: '#a08b64', b: '#8a6a45', g: '#252d3a',
    '#': '#6d6d78', w: '#6d5844', T: '#2e6b28', c: '#8cdcff', '*': '#59677a', '^': '#7a6a55',
    D: '#4a5563', M: '#3a4258', ' ': '#07080e', _: '#0a0a12',
  };
  const PALBASE = {
    grass: ['#3c7e2c', '#357024', '#bfa05e', '#2472a8'], forest: ['#2a5e22', '#22521c', '#8d7a55', '#1f5d8a'],
    swamp: ['#4a5c33', '#3f4f2c', '#7a7050', '#4a6a52'], volcano: ['#4a3833', '#41302c', '#6b5148', '#2b6b9e'],
    ruins: ['#37414e', '#2f3844', '#556273', '#274a66'], town: ['#4f8a41', '#467a39', '#c2a878', '#2b6b9e'],
    indoor: ['#6b5138', '#61492f', '#7a5e42', '#2b6b9e'], cave: ['#3a3440', '#332d38', '#584e60', '#1e3d5c'],
    moon: ['#5e6b8f', '#525e80', '#9aa3c2', '#3b4a80'], beach: ['#c9b380', '#bfa877', '#d8c390', '#2e86ab'],
    abyss: ['#1a2c40', '#16263a', '#2c4560', '#0e1a2c'],
  };

  const colorOf = (c, pal, tx, ty) => {
    const h = G.U.hash2(tx, ty);
    switch (c) {
      case '.': return hexRGB(h > 0.5 ? pal[0] : pal[1]);
      case ',': case 'h': return hexRGB(pal[1]);
      case '=': return hexRGB(pal[2]);
      case 'F': { const f = hexRGB(pal[0]); return [f[0] + 0.06, f[1] + 0.05, f[2] + 0.02]; }
      case 'r': case 'g': return hexRGB(pal[0]);
      case '~': case 'o': return hexRGB(pal[3]);
      case 'l': return [0.9, 0.35, 0.1];
      default: return hexRGB(BASECOL[c] || '#444444');
    }
  };

  // ---- なだらかな地形起伏(見た目のみ。当たり判定は2Dのまま) ----
  let AMP = 0;
  const noiseH = (gx, gz) => { // ワールドpx座標 → 高さ(連続値ノイズ)
    if (!AMP) return 0;
    const s = 0.040;
    const x = gx * s, z = gz * s;
    const xi = Math.floor(x), zi = Math.floor(z);
    const fx = x - xi, fz = z - zi;
    const sm = t2 => t2 * t2 * (3 - 2 * t2);
    const h00 = G.U.hash2(xi, zi), h10 = G.U.hash2(xi + 1, zi);
    const h01 = G.U.hash2(xi, zi + 1), h11 = G.U.hash2(xi + 1, zi + 1);
    return (G.U.lerp(G.U.lerp(h00, h10, sm(fx)), G.U.lerp(h01, h11, sm(fx)), sm(fz)) - 0.5) * 2 * AMP;
  };
  const FLATISH = new Set(['=', 'b', 'f', 'g', 'r', '~', 'o', 'l', '_', ' ']);
  const cornerScale = (ctx2, cty) => { // コーナーを共有する4タイルに道があれば平らに(段差割れ防止)
    const S = G.world.S;
    for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) {
      const tx = ctx2 + dx, ty = cty + dz;
      if (ty < 0 || tx < 0 || ty >= S.th || tx >= S.tw) continue;
      if (FLATISH.has(S.grid[ty][tx])) return 0.22;
    }
    return 1;
  };
  const cornerH = (ctx2, cty) => noiseH(ctx2 * T, cty * T) * cornerScale(ctx2, cty);
  const groundAt = (gx, gz) => { // エンティティ足元の高さ(コーナー高さの双線形)
    if (!AMP) return 0;
    const tx = gx / T, tz = gz / T;
    const xi = Math.floor(tx), zi = Math.floor(tz);
    const fx = tx - xi, fz = tz - zi;
    const h00 = cornerH(xi, zi), h10 = cornerH(xi + 1, zi);
    const h01 = cornerH(xi, zi + 1), h11 = cornerH(xi + 1, zi + 1);
    return G.U.lerp(G.U.lerp(h00, h10, fx), G.U.lerp(h01, h11, fx), fz);
  };
  let lampList = [];

  // ---- ゾーンメッシュ構築 ----
  let FACE = { s: 0.8, n: 0.55, e: 0.68, w: 0.68 }; // 太陽方位で更新される面別ライティング
  const buildZone = () => {
    const S = G.world.S;
    const zn = G.world.zone;
    AMP = zn.indoor ? 0 : (zn.town ? 2.5 : (zn.underwater ? 4 : (zn.biome === 'ruins' || zn.biome === 'moon' ? 4 : 9)));
    lampList = [];
    // 太陽の方位で壁の明るさが回る(朝は東壁、夕は西壁が光る)
    {
      const fr = G.time.frac();
      const sunT = G.U.clamp((fr - 0.20) / 0.60, 0, 1);
      const day = fr > 0.20 && fr < 0.80;
      const we = day ? Math.max(0, Math.cos(Math.PI * sunT)) : 0;   // 東(朝)
      const ww = day ? Math.max(0, -Math.cos(Math.PI * sunT)) : 0;  // 西(夕)
      const ss = day ? Math.sin(Math.PI * sunT) : 0;                // 南中
      FACE = {
        s: 0.60 + 0.28 * ss,
        n: 0.50 + 0.06 * ss,
        e: 0.55 + 0.34 * we + 0.08 * ss,
        w: 0.55 + 0.34 * ww + 0.08 * ss,
      };
    }
    const pal = PALBASE[G.world.zone.biome] || PALBASE.grass;
    const pos = [], col = [], uvM = [], nrmM = [], wpos = [], wcol = [], uvW = [], nrmW = [];
    // 現在マテリアルのUV矩形。setMat()で切替。[-1,...]はテクスチャ無し(影・泡)
    let curUV = [-1, -1, -1, -1];
    let curNrm = [0, 1, 0]; // 現在の面法線(setNrmで切替)
    const NOUV = [-1, -1, -1, -1];
    const setMat = name => { curUV = (G.Tex && G.Tex.ok && name) ? G.Tex.uv(name) : NOUV; };
    const setNrm = (nx, ny, nz) => { const l = Math.hypot(nx, ny, nz) || 1; curNrm = [nx / l, ny / l, nz / l]; };
    const idxOrder = [0, 1, 2, 0, 2, 3];
    const push = (arrP, arrC, verts, c, shade, alpha, nrmOverride) => {
      const sh = Array.isArray(shade) ? shade : [shade, shade, shade, shade];
      const arrU = arrP === pos ? uvM : uvW;
      const arrN = arrP === pos ? nrmM : nrmW;
      const u = curUV, nrm = nrmOverride || curNrm;
      const cU = u[0] < 0 ? null : [[u[0], u[1]], [u[2], u[1]], [u[2], u[3]], [u[0], u[3]]];
      for (const i of idxOrder) {
        arrP.push(verts[i][0], verts[i][1], verts[i][2]);
        arrC.push(c[0] * sh[i], c[1] * sh[i], c[2] * sh[i], alpha !== undefined ? alpha : 1);
        if (cU) arrU.push(cU[i][0], cU[i][1]); else arrU.push(-1, -1);
        arrN.push(nrm[0], nrm[1], nrm[2]);
      }
    };
    // AO: 高い隣接タイルが落とす淡い影(コーナー単位)
    const tallAt = (tx, ty) => {
      if (ty < 0 || tx < 0 || ty >= S.th || tx >= S.tw) return true;
      const cc = S.grid[ty][tx];
      return (HEIGHT[cc] || 0) > 0 || cc === ' ';
    };
    const floorAO = (tx, ty) => {
      const corner = (dx, dy) => {
        let n = 0;
        if (tallAt(tx + dx, ty)) n++;
        if (tallAt(tx, ty + dy)) n++;
        if (tallAt(tx + dx, ty + dy)) n++;
        return 1 - 0.13 * Math.min(n, 2);
      };
      // 頂点順 [x0z0, x1z0, x1z1, x0z1]
      return [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
    };
    // 面ごとに幾何法線を渡す(方向ライティングはシェーダが担当。ここは接触AOのみ)
    const boxAtY = (p, cl, x, z, size, y0, y1, c, a) => {
      const x1 = x + size, z1 = z + size;
      push(p, cl, [[x, y1, z], [x1, y1, z], [x1, y1, z1], [x, y1, z1]], c, 1.0, a, [0, 1, 0]);
      push(p, cl, [[x, y0, z1], [x1, y0, z1], [x1, y1, z1], [x, y1, z1]], c, 0.97, a, [0, 0, 1]);
      push(p, cl, [[x1, y0, z], [x, y0, z], [x, y1, z], [x1, y1, z]], c, 0.90, a, [0, 0, -1]);
      push(p, cl, [[x1, y0, z1], [x1, y0, z], [x1, y1, z], [x1, y1, z1]], c, 0.94, a, [1, 0, 0]);
      push(p, cl, [[x, y0, z], [x, y0, z1], [x, y1, z1], [x, y1, z]], c, 0.94, a, [-1, 0, 0]);
      // 面取りリム(天面の縁に細い明るみ→ミニチュア模型の質感)
      if (size >= 10 && (y1 - y0) >= 12) {
        const rim = 1.18, t2 = 2, ry = y1 + 0.15;
        push(p, cl, [[x, ry, z], [x1, ry, z], [x1, ry, z + t2], [x, ry, z + t2]], c, rim, a, [0, 1, 0]);
        push(p, cl, [[x, ry, z1 - t2], [x1, ry, z1 - t2], [x1, ry, z1], [x, ry, z1]], c, rim, a, [0, 1, 0]);
        push(p, cl, [[x, ry, z], [x + t2, ry, z], [x + t2, ry, z1], [x, ry, z1]], c, rim, a, [0, 1, 0]);
        push(p, cl, [[x1 - t2, ry, z], [x1, ry, z], [x1, ry, z1], [x1 - t2, ry, z1]], c, rim, a, [0, 1, 0]);
      }
    };
    const gateOpen = c =>
      (c === 'D' && G.world.zone.gateFlag && G.quests.flags[G.world.zone.gateFlag]) ||
      (c === 'M' && G.time.isFullMoon() && G.time.isNight());
    const FLOORMAT = {
      '.': 'grassA', ',': 'grassB', '=': 'dirt', 's': 'sand', 'h': 'bush',
      'F': 'moonfield', 'r': 'ruinfloor', 'g': 'techfloor', 'b': 'plank', 'f': 'plank',
    };

    for (let ty = 0; ty < S.th; ty++) {
      for (let tx = 0; tx < S.tw; tx++) {
        const c = S.grid[ty][tx];
        const x0 = tx * T, x1 = x0 + T, z0 = ty * T, z1 = z0 + T;
        const base = colorOf(c, pal, tx, ty);
        if (c === '~') {
          setMat('water');
          push(wpos, wcol, [[x0, -5, z0], [x1, -5, z0], [x1, -5, z1], [x0, -5, z1]], base, 1, 0.82);
          push(pos, col, [[x0, -14, z0], [x1, -14, z0], [x1, -14, z1], [x0, -14, z1]], base, 0.45);
          setMat(null);
          // 水際の泡(岸に接する辺に白い縁)
          {
            const foam = [0.88, 0.94, 0.99];
            const solidN = (dx2, dz2) => {
              const tX = tx + dx2, tY = ty + dz2;
              if (tY < 0 || tX < 0 || tY >= S.th || tX >= S.tw) return false;
              const nc = S.grid[tY][tX];
              return nc !== '~' && nc !== 'o' && nc !== '_' && nc !== ' ';
            };
            if (solidN(0, -1)) push(wpos, wcol, [[x0, -4.4, z0], [x1, -4.4, z0], [x1, -4.4, z0 + 4], [x0, -4.4, z0 + 4]], foam, 1, 0.5);
            if (solidN(0, 1)) push(wpos, wcol, [[x0, -4.4, z1 - 4], [x1, -4.4, z1 - 4], [x1, -4.4, z1], [x0, -4.4, z1]], foam, 1, 0.5);
            if (solidN(-1, 0)) push(wpos, wcol, [[x0, -4.4, z0], [x0 + 4, -4.4, z0], [x0 + 4, -4.4, z1], [x0, -4.4, z1]], foam, 1, 0.5);
            if (solidN(1, 0)) push(wpos, wcol, [[x1 - 4, -4.4, z0], [x1, -4.4, z0], [x1, -4.4, z1], [x1 - 4, -4.4, z1]], foam, 1, 0.5);
          }
          continue;
        }
        if (c === 'o') { // 気泡孔: 床+発光ベント
          setMat('ruinfloor');
          push(pos, col, [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], base, 0.9);
          setMat(null);
          boxAtY(pos, col, x0 + T / 2 - 4, z0 + T / 2 - 4, 8, 0, 5, [0.7, 0.88, 1], 1);
          continue;
        }
        if (c === 'l') {
          setMat('lava');
          push(pos, col, [[x0, -3, z0], [x1, -3, z0], [x1, -3, z1], [x0, -3, z1]], base, 1.15);
          setMat(null);
          continue;
        }
        if (c === '_') {
          push(pos, col, [[x0, -46, z0], [x1, -46, z0], [x1, -46, z1], [x0, -46, z1]], base, 0.7);
          continue;
        }
        let hgt = HEIGHT[c] || 0;
        if (hgt && gateOpen(c)) hgt = 0;
        // 起伏: コーナー高さ(道の近くは平らに寄せる)
        const c00 = cornerH(tx, ty), c10 = cornerH(tx + 1, ty), c11 = cornerH(tx + 1, ty + 1), c01 = cornerH(tx, ty + 1);
        const hAvg = (c00 + c10 + c11 + c01) / 4;
        const hMin = Math.min(c00, c10, c11, c01);
        // 高い物が南東へ落とす影(半透明パスで描く)
        const castShadow = (alpha, inset = 0) => push(wpos, wcol, [
          [x0 + inset + 9, hAvg + 0.5, z0 + inset + 9],
          [x1 + 12, hAvg + 0.5, z0 + inset + 9],
          [x1 + 12, hAvg + 0.5, z1 + 12],
          [x0 + inset + 9, hAvg + 0.5, z1 + 12],
        ], [0, 0, 0], 1, alpha);
        if (hgt === 0) {
          const ao = floorAO(tx, ty);
          // 斜面ライティング(北西上空からの太陽)+丘の上は明るく
          const dhdx = ((c10 + c11) - (c00 + c01)) / (2 * T);
          const dhdz = ((c01 + c11) - (c00 + c10)) / (2 * T);
          const slope = G.U.clamp(1 - (dhdx + dhdz) * 0.95, 0.80, 1.18); // 柔らかめの陰影(市松感を抑える)
          const hs = [c00, c10, c11, c01].map((hh, i2) => ao[i2] * (1 + hh * 0.010));
          const fN = [-dhdx, 1, -dhdz];
          setMat(FLOORMAT[c] || 'grassA');
          push(pos, col, [[x0, c00, z0], [x1, c10, z0], [x1, c11, z1], [x0, c01, z1]], base, hs, undefined, fN);
          setMat(null);
          const h2 = G.U.hash2(tx, ty);
          // 草の穂(地面に立体のディテールを散らす)
          if ((c === '.' || c === ',') && h2 > 0.52) {
            const gx2 = x0 + ((h2 * 91) % 24) + 4, gz2 = z0 + ((h2 * 57) % 24) + 4;
            boxAtY(pos, col, gx2, gz2, 1.8, hAvg, hAvg + 4.5 + (h2 * 9) % 4, [base[0] * 0.72, base[1] * 0.92, base[2] * 0.72], 1);
            if (h2 > 0.9) boxAtY(pos, col, gx2 + 6, gz2 - 5, 1.6, hAvg, hAvg + 4, [base[0] * 0.8, base[1] * 1.0, base[2] * 0.8], 1);
          }
          // 道の縁を隣の草色で馴染ませる(タイルの境界線を消す)
          if (c === '=' ) {
            const GRASSY = new Set(['.', ',', 'h', 'F']);
            const gcol = hexRGB(pal[0]).map(v => v * 0.97);
            const nb = (dx2, dz2) => {
              const tX = tx + dx2, tY = ty + dz2;
              return tY >= 0 && tX >= 0 && tY < S.th && tX < S.tw && GRASSY.has(S.grid[tY][tX]);
            };
            if (nb(0, -1)) push(pos, col, [[x0, c00 + 0.3, z0], [x1, c10 + 0.3, z0], [x1, c10 + 0.3, z0 + 5], [x0, c00 + 0.3, z0 + 5]], gcol, 1);
            if (nb(0, 1)) push(pos, col, [[x0, c01 + 0.3, z1 - 5], [x1, c11 + 0.3, z1 - 5], [x1, c11 + 0.3, z1], [x0, c01 + 0.3, z1]], gcol, 1);
            if (nb(-1, 0)) push(pos, col, [[x0, c00 + 0.3, z0], [x0 + 5, c00 + 0.3, z0], [x0 + 5, c01 + 0.3, z1], [x0, c01 + 0.3, z1]], gcol, 1);
            if (nb(1, 0)) push(pos, col, [[x1 - 5, c10 + 0.3, z0], [x1, c10 + 0.3, z0], [x1, c11 + 0.3, z1], [x1 - 5, c11 + 0.3, z1]], gcol, 1);
          }
          if (c === 'h' && h2 > 0.3) boxAtY(pos, col, x0 + 8 + h2 * 10, z0 + 8 + (1 - h2) * 10, 6, hAvg, hAvg + 7, [0.12, 0.3, 0.12], 1);
          if (c === 'F') boxAtY(pos, col, x0 + 8 + h2 * 14, z0 + 8 + (1 - h2) * 12, 4, hAvg, hAvg + 6, hexRGB(['#ff8fa3', '#ffd75e', '#c9a0ff', '#ffffff'][Math.floor(h2 * 4)]), 1);
          if (c === 'g') boxAtY(pos, col, x0 + T / 2 - 3, z0 + T / 2 - 3, 6, hAvg, hAvg + 2.5, [0.36, 0.93, 0.83], 1);
          // 街灯(街の道沿い。夜に灯る)
          if (zn.town && c === '=' && h2 > 0.94) {
            boxAtY(pos, col, x0 + 14, z0 + 14, 3.4, hAvg, hAvg + 25, [0.22, 0.2, 0.24], 1);
            boxAtY(pos, col, x0 + 11.5, z0 + 11.5, 8.4, hAvg + 25, hAvg + 31, [0.95, 0.85, 0.55], 1);
            lampList.push({ x: tx * T + 16, y: ty * T + 16, h: hAvg + 28 });
          }
        } else if (c === 'T') {
          // 樹: 個体差(サイズ・色・高さのゆらぎ)で森に生命感を
          const j = G.U.hash2(tx * 3 + 1, ty * 7 + 2);
          const cs = 1 + (j - 0.5) * 0.36;
          const canopy = base.map(v => Math.min(1, v * (0.85 + j * 0.4)));
          const hTop = 34 + j * 10;
          setMat('grassB');
          push(pos, col, [[x0, c00, z0], [x1, c10, z0], [x1, c11, z1], [x0, c01, z1]], hexRGB(pal[1]), floorAO(tx, ty));
          setMat('plank');
          boxAtY(pos, col, x0 + T / 2 - 4, z0 + T / 2 - 4, 8, hAvg, hAvg + 16, [0.35, 0.27, 0.19], 1);
          // ふっくらした多葉の樹冠(中心+四方のローブ)
          setMat('grassB');
          {
            const lobe = (ox, oz, s2, y0, y1, f2) =>
              boxAtY(pos, col, x0 + T / 2 - s2 / 2 + ox, z0 + T / 2 - s2 / 2 + oz, s2,
                hAvg + y0, hAvg + y1, canopy.map(v => Math.min(1, v * f2)), 1);
            lobe(0, 0, (T - 12) * cs, 13, hTop, 1.0);
            lobe(-9 * cs, 0, 15 * cs, 16, hTop - 8, 0.88);
            lobe(9 * cs, 1, 15 * cs, 15, hTop - 6, 1.10);
            lobe(0, -9 * cs, 14 * cs, 17, hTop - 9, 0.84);
            lobe(1, 9 * cs, 15 * cs, 14, hTop - 5, 1.16);
            lobe(3 * cs, -2, (T - 20) * cs, hTop - 4, hTop + 5, 1.24); // てっぺんの新芽
          }
          setMat(null);
          castShadow(0.14, 3);
        } else if (c === 'w') {
          // 建物: 壁+張り出した軒+切妻風の屋根(ドラクエ的な家並みへ)
          const roofC = zn.biome === 'ruins' ? [0.30, 0.34, 0.42] : [0.66, 0.30, 0.22];
          const wallC = [base[0] * 1.02, base[1] * 1.02, base[2] * 1.02];
          setMat(zn.biome === 'ruins' ? 'rock' : 'plaster');
          boxAtY(pos, col, x0, z0, T, hMin - 1, hMin + 22, wallC, 1);
          setMat(null);
          // 扉(南側が歩ける場合)
          const southC = ty + 1 < S.th ? S.grid[ty + 1][tx] : ' ';
          if (!(HEIGHT[southC] > 0) && southC !== ' ') {
            setMat('plank');
            push(pos, col, [[x0 + 11, hMin - 1, z1 + 0.15], [x0 + 21, hMin - 1, z1 + 0.15], [x0 + 21, hMin + 13, z1 + 0.15], [x0 + 11, hMin + 13, z1 + 0.15]], [0.32, 0.20, 0.13], 1);
            setMat(null);
            push(pos, col, [[x0 + 18.5, hMin + 5, z1 + 0.3], [x0 + 20, hMin + 5, z1 + 0.3], [x0 + 20, hMin + 7, z1 + 0.3], [x0 + 18.5, hMin + 7, z1 + 0.3]], [0.9, 0.78, 0.42], 1);
          }
          // 軒+屋根(瓦テクスチャ)
          setMat('shingle');
          boxAtY(pos, col, x0 - 3, z0 - 3, T + 6, hMin + 21, hMin + 24, roofC.map(v => v * 0.85), 1);
          const ap = 14;
          push(pos, col, [[x0 - 3, hMin + 24, z1 + 3], [x1 + 3, hMin + 24, z1 + 3], [x1 - 4, hMin + 24 + ap, z0 + T / 2], [x0 + 4, hMin + 24 + ap, z0 + T / 2]], roofC, 1);
          push(pos, col, [[x1 + 3, hMin + 24, z0 - 3], [x0 - 3, hMin + 24, z0 - 3], [x0 + 4, hMin + 24 + ap, z0 + T / 2], [x1 - 4, hMin + 24 + ap, z0 + T / 2]], roofC, 0.72);
          setMat(null);
          push(pos, col, [[x0 - 3, hMin + 24, z0 - 3], [x0 - 3, hMin + 24, z1 + 3], [x0 + 4, hMin + 24 + ap, z0 + T / 2], [x0 + 4, hMin + 24 + ap, z0 + T / 2]], roofC, 0.6);
          push(pos, col, [[x1 + 3, hMin + 24, z1 + 3], [x1 + 3, hMin + 24, z0 - 3], [x1 - 4, hMin + 24 + ap, z0 + T / 2], [x1 - 4, hMin + 24 + ap, z0 + T / 2]], roofC, 0.6);
          castShadow(0.22);
        } else if (c === 'D' || c === 'M') {
          push(pos, col, [[x0, c00, z0], [x1, c10, z0], [x1, c11, z1], [x0, c01, z1]], hexRGB(pal[1]), 1);
          setMat('rock');
          boxAtY(pos, col, x0, z0 + 10, 7, hMin - 1, hMin + hgt, base, 1);
          boxAtY(pos, col, x1 - 7, z0 + 10, 7, hMin - 1, hMin + hgt, base, 1);
          boxAtY(pos, col, x0, z0 + 10, T, hMin + hgt - 8, hMin + hgt, c === 'M' ? [0.82, 0.85, 1] : base, 1);
          setMat(null);
        } else {
          setMat(c === 'c' ? 'crystal' : (c === '*' || c === '^' ? 'rock' : 'rock'));
          boxAtY(pos, col, x0, z0, T, hMin - 1, hMin + hgt, base, 1);
          setMat(null);
          castShadow(0.17);
        }
      }
    }

    // ---- ボス専用アリーナの装飾(篝火・柱・発光魔法陣) ----
    if (zn.mood === 'boss') {
      const gh = (gx, gz) => (cornerH(Math.floor(gx / T), Math.floor(gz / T)) + cornerH(Math.floor(gx / T) + 1, Math.floor(gz / T) + 1)) / 2;
      // テーマ色(篝火・紋)
      const theme = zn.biome === 'ruins' ? [0.4, 0.95, 0.85]
        : zn.biome === 'abyss' ? [0.35, 0.7, 1.0]
          : zn.biome === 'moon' ? [0.78, 0.7, 1.0]
            : zn.biome === 'volcano' ? [1.0, 0.5, 0.15]
              : [1.0, 0.62, 0.25];
      const pillarCol = hexRGB(pal[1]).map(v => v * 1.1);
      // 篝火(4隅内側): 台座+柱+発光炎
      const braz = [[4, 4], [S.tw - 5, 4], [4, S.th - 5], [S.tw - 5, S.th - 5]];
      for (const [bx, bz] of braz) {
        if (bx < 2 || bz < 2 || bx > S.tw - 2 || bz > S.th - 2) continue;
        const cc = S.grid[bz] && S.grid[bz][bx];
        if (cc === undefined || (HEIGHT[cc] || 0) > 0 || cc === '~' || cc === '_') continue;
        const wx = bx * T + 16, wz = bz * T + 16, wy = gh(wx, wz);
        setMat('rock');
        boxAtY(pos, col, wx - 6, wz - 6, 12, wy, wy + 4, pillarCol.map(v => v * 0.8), 1); // 台座
        boxAtY(pos, col, wx - 3.5, wz - 3.5, 7, wy + 4, wy + 26, pillarCol, 1);          // 柱
        setMat(null);
        boxAtY(pos, col, wx - 5, wz - 5, 10, wy + 25, wy + 30, [theme[0] * 1.4, theme[1] * 1.4, theme[2] * 1.4], 1); // 発光炎(ブルーム源)
        lampList.push({ x: wx, y: wz, h: wy + 30 });
      }
      // 中央の発光魔法陣(ボス出現地点)
      const cxw = (S.tw / 2) * T, czw = (S.th / 2) * T, cyw = gh(cxw, czw);
      setMat('techfloor');
      const ringN = 24, R1 = 90, R2 = 100;
      for (let i = 0; i < ringN; i++) {
        const a0 = i / ringN * Math.PI * 2, a1 = (i + 1) / ringN * Math.PI * 2;
        push(pos, col, [
          [cxw + Math.cos(a0) * R1, cyw + 0.4, czw + Math.sin(a0) * R1],
          [cxw + Math.cos(a1) * R1, cyw + 0.4, czw + Math.sin(a1) * R1],
          [cxw + Math.cos(a1) * R2, cyw + 0.4, czw + Math.sin(a1) * R2],
          [cxw + Math.cos(a0) * R2, cyw + 0.4, czw + Math.sin(a0) * R2],
        ], [theme[0] * 1.2, theme[1] * 1.2, theme[2] * 1.2], 1, undefined, [0, 1, 0]);
      }
      setMat(null);
    }

    const up = (buf, p, cl, uvA, nA) => {
      const n = p.length / 3;
      const data = new Float32Array(n * 12);
      for (let i = 0, v = 0; i < n; i++, v += 12) {
        data[v] = p[i * 3]; data[v + 1] = p[i * 3 + 1]; data[v + 2] = p[i * 3 + 2];
        data[v + 3] = cl[i * 4]; data[v + 4] = cl[i * 4 + 1]; data[v + 5] = cl[i * 4 + 2]; data[v + 6] = cl[i * 4 + 3];
        data[v + 7] = uvA[i * 2]; data[v + 8] = uvA[i * 2 + 1];
        data[v + 9] = nA[i * 3]; data[v + 10] = nA[i * 3 + 1]; data[v + 11] = nA[i * 3 + 2];
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return n;
    };
    if (!vbo) vbo = gl.createBuffer();
    if (!waterVbo) waterVbo = gl.createBuffer();
    vertCount = up(vbo, pos, col, uvM, nrmM);
    waterCount = up(waterVbo, wpos, wcol, uvW, nrmW);
  };

  const zoneKeyNow = () => {
    const z = G.world;
    // 時間帯バケットが変わるとメッシュを組み直し(太陽方位ライティングを回す)
    return `${z.zoneId}|${z.zone.gateFlag ? !!G.quests.flags[z.zone.gateFlag] : 0}|${G.time.isFullMoon() && G.time.isNight() ? 1 : 0}|b${Math.floor(G.time.frac() * 8)}`;
  };

  // ---- ポストプロセス用FBO ----
  const mkTex = (w, h) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const mkFbo = tex => {
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return f;
  };
  const ensurePost = (w, h) => {
    if (!bloomOk || (ppW === w && ppH === h)) return;
    ppW = w; ppH = h;
    if (sceneTex) { gl.deleteTexture(sceneTex); gl.deleteFramebuffer(sceneFbo); gl.deleteRenderbuffer(sceneDepth); }
    if (bloomA) { gl.deleteTexture(bloomA.t); gl.deleteFramebuffer(bloomA.f); }
    if (bloomB) { gl.deleteTexture(bloomB.t); gl.deleteFramebuffer(bloomB.f); }
    sceneTex = mkTex(w, h); sceneFbo = mkFbo(sceneTex);
    sceneDepth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, sceneDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, sceneDepth);
    const bw = Math.max(1, w >> 2), bh = Math.max(1, h >> 2);
    bloomA = { t: mkTex(bw, bh), w: bw, h: bh }; bloomA.f = mkFbo(bloomA.t);
    bloomB = { t: mkTex(bw, bh), w: bw, h: bh }; bloomB.f = mkFbo(bloomB.t);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };
  const fsQuad = pr => {
    gl.bindBuffer(gl.ARRAY_BUFFER, skyVbo);
    const aP = gl.getAttribLocation(pr, 'aP');
    gl.enableVertexAttribArray(aP);
    gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 8, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const runBloom = (w, h) => {
    gl.disable(gl.DEPTH_TEST);
    const bw = bloomA.w, bh = bloomA.h;
    // ブライトパス(scene→bloomA)
    gl.useProgram(brightProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.f); gl.viewport(0, 0, bw, bh);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.uniform1i(gl.getUniformLocation(brightProg, 'uT'), 0);
    gl.uniform1f(gl.getUniformLocation(brightProg, 'uThr'), 0.72);
    fsQuad(brightProg);
    // ブラー水平(bloomA→bloomB)→垂直(bloomB→bloomA)を2往復
    gl.useProgram(blurProg);
    const uT = gl.getUniformLocation(blurProg, 'uT'), uDir = gl.getUniformLocation(blurProg, 'uDir');
    gl.uniform1i(uT, 0);
    for (let k = 0; k < 2; k++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomB.f); gl.viewport(0, 0, bw, bh);
      gl.bindTexture(gl.TEXTURE_2D, bloomA.t); gl.uniform2f(uDir, 1.0 / bw, 0); fsQuad(blurProg);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.f); gl.viewport(0, 0, bw, bh);
      gl.bindTexture(gl.TEXTURE_2D, bloomB.t); gl.uniform2f(uDir, 0, 1.0 / bh); fsQuad(blurProg);
    }
    // 合成(scene+bloom→画面)
    gl.useProgram(compProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.uniform1i(gl.getUniformLocation(compProg, 'uScene'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bloomA.t);
    gl.uniform1i(gl.getUniformLocation(compProg, 'uBloom'), 1);
    gl.uniform1f(gl.getUniformLocation(compProg, 'uAmt'), 1.15);
    fsQuad(compProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.DEPTH_TEST);
  };

  // ---- カメラ・投影 ----
  const PITCH = 0.86, DIST = 330, FOVY = 1.0; // 近め・低めで迫力と操作の見通しを両立
  const updateCamera = (w, h) => {
    const p = G.player;
    const sh = G.fx.shakeOffset;
    const cy = Math.sin(PITCH) * DIST, cz = Math.cos(PITCH) * DIST;
    const ctr = [p.x + sh.x, 10 + groundAt(p.x, p.y), p.y + sh.y];
    const eye = [ctr[0], ctr[1] + cy, ctr[2] + cz];
    const aspect = w / h, f = 1 / Math.tan(FOVY / 2);
    const vp = M4.mul(M4.persp(FOVY, aspect, 20, 2600), M4.lookAt(eye, ctr, [0, 1, 0]));
    const fwd = [0, -Math.sin(PITCH), -Math.cos(PITCH)];
    const right = [1, 0, 0];
    const upv = [0, Math.cos(PITCH), -Math.sin(PITCH)];
    cam = { eye, ctr, vp, f, aspect, w, h, fwd, right, upv };
  };

  // ワールド(x2d, 高さ, y2d) → 画面
  const projectXZ = (x, hgt, z) => {
    const m = cam.vp;
    const cx = m[0] * x + m[4] * hgt + m[8] * z + m[12];
    const cy2 = m[1] * x + m[5] * hgt + m[9] * z + m[13];
    const cw = m[3] * x + m[7] * hgt + m[11] * z + m[15];
    if (cw <= 1) return null;
    return {
      x: (cx / cw * 0.5 + 0.5) * cam.w,
      y: (1 - (cy2 / cw * 0.5 + 0.5)) * cam.h,
      w: cw,
      scale: (cam.h / 2) * cam.f / cw,
    };
  };

  const mouseWorld = () => {
    if (!cam) return null;
    const mx = G.input.mouse.x, my = G.input.mouse.y;
    const ndcX = (mx / cam.w) * 2 - 1, ndcY = 1 - (my / cam.h) * 2;
    const dx = ndcX * cam.aspect / cam.f, dy = ndcY / cam.f;
    const dir = [
      cam.right[0] * dx + cam.upv[0] * dy + cam.fwd[0],
      cam.right[1] * dx + cam.upv[1] * dy + cam.fwd[1],
      cam.right[2] * dx + cam.upv[2] * dy + cam.fwd[2],
    ];
    if (dir[1] >= -0.001) return null;
    const t = -cam.eye[1] / dir[1];
    return { x: cam.eye[0] + dir[0] * t, y: cam.eye[2] + dir[2] * t };
  };

  // ---- メイン描画 ----
  const draw = (ctx, w, h, dpr) => {
    if (glCanvas.width !== Math.floor(w * dpr) || glCanvas.height !== Math.floor(h * dpr)) {
      glCanvas.width = Math.floor(w * dpr); glCanvas.height = Math.floor(h * dpr);
      glCanvas.style.width = w + 'px'; glCanvas.style.height = h + 'px';
    }
    glCanvas.style.display = 'block';
    const key = zoneKeyNow();
    if (key !== zoneKey) { zoneKey = key; buildZone(); }
    updateCamera(w, h);
    const GW = glCanvas.width, GH = glCanvas.height;
    const useBloom = bloomOk && !(G.settings && G.settings.bloom === false);

    // ---- 時刻から空・光を決定(朝焼け/白昼/黄昏/星月夜) ----
    const zone = G.world.zone;
    const frac = G.time.frac();
    const wDark = G.weather ? G.weather.skyDarken() : 0;
    const dark = zone.dark ? 0.8 : Math.min(0.85, G.time.darkness() + wDark);
    const und = zone.underwater;
    const dusk = Math.max(0, 1 - Math.abs(frac - 0.81) / 0.06) + Math.max(0, 1 - Math.abs(frac - 0.18) / 0.05);

    // ---- 太陽の向き(シャドウ&ライティング共用) ----
    const dayT2 = G.U.clamp((frac - 0.20) / 0.60, 0, 1);
    const isDay = frac > 0.20 && frac < 0.80 && !und && !zone.dark;
    const _sunX = Math.cos((1 - dayT2) * Math.PI);
    const _sunH = isDay ? 0.24 + Math.sin(dayT2 * Math.PI) * 0.92 : 0.7; // 朝夕は低く=長い影
    let sunDir = [_sunX * 1.15, _sunH, -0.5];
    { const l = Math.hypot(sunDir[0], sunDir[1], sunDir[2]); sunDir = [sunDir[0] / l, sunDir[1] / l, sunDir[2] / l]; }
    if (und) sunDir = [0.2, 0.9, -0.3];

    // ---- シャドウパス: 光源視点で地形の深度を描く ----
    const useShadow = shadowOk && isDay && !(G.settings && G.settings.shadows === false);
    if (useShadow && vertCount) {
      const px = G.player.x, pz = G.player.y, py = groundAt(px, pz);
      const D = 500;
      const eye = [px + sunDir[0] * D, py + sunDir[1] * D, pz + sunDir[2] * D];
      const up = Math.abs(sunDir[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0];
      const H = 470;
      lightVP = M4.mul(M4.ortho(-H, H, -H, H, 1, 1100), M4.lookAt(eye, [px, py, pz], up));
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
      gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
      gl.clearColor(1, 1, 1, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(depthProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(depthProg, 'uLVP'), false, lightVP);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      const aP2 = gl.getAttribLocation(depthProg, 'aPos');
      gl.enableVertexAttribArray(aP2);
      gl.vertexAttribPointer(aP2, 3, gl.FLOAT, false, 48, 0);
      gl.enable(gl.DEPTH_TEST);
      gl.drawArrays(gl.TRIANGLES, 0, vertCount);
    }

    if (useBloom) { ensurePost(GW, GH); gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo); }
    else gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const L3 = (a, b, t2) => [G.U.lerp(a[0], b[0], t2), G.U.lerp(a[1], b[1], t2), G.U.lerp(a[2], b[2], t2)];
    let zen = L3([0.30, 0.52, 0.86], [0.015, 0.03, 0.09], G.U.clamp(dark / 0.62, 0, 1));
    let hor = L3([0.72, 0.84, 0.96], [0.09, 0.11, 0.20], G.U.clamp(dark / 0.62, 0, 1));
    hor = [Math.min(1, hor[0] + 0.42 * dusk), Math.min(1, hor[1] + 0.13 * dusk), Math.max(0, hor[2] - 0.06 * dusk)];
    zen = [Math.min(1, zen[0] + 0.09 * dusk), zen[1] + 0.02 * dusk, zen[2]];
    if (und) { zen = [0.01, 0.05, 0.11]; hor = [0.04, 0.13, 0.22]; }
    if (zone.dark) { zen = [0.02, 0.02, 0.045]; hor = [0.05, 0.05, 0.095]; }
    // 太陽と月(月は月齢で明るさが変わる)
    let celPos = [0, -2], celCol = [0, 0, 0], celR = 0.0;
    if (!und && !zone.dark) {
      const dayT = (frac - 0.20) / 0.60; // 太陽は04:48-19:12の弧
      if (dayT >= 0 && dayT <= 1) {
        celPos = [G.U.lerp(-0.85, 0.85, dayT), Math.sin(dayT * Math.PI) * 0.75 - 0.18];
        celCol = [1.0, 0.9 - 0.25 * dusk, 0.62 - 0.22 * dusk];
        celR = 0.08;
      } else {
        const nightT = frac >= 0.80 ? (frac - 0.80) / 0.40 : (frac + 0.20) / 0.40;
        const mb = 0.35 + 0.65 * (1 - Math.abs(G.time.moonPhase() - 4) / 4);
        celPos = [G.U.lerp(-0.85, 0.85, nightT), Math.sin(nightT * Math.PI) * 0.7 - 0.12];
        celCol = [0.72 * mb, 0.76 * mb, 0.95 * mb];
        celR = 0.055;
      }
    }
    const starAmt = (!und && !zone.dark && dark > 0.32) ? G.U.clamp((dark - 0.32) / 0.28, 0, 1) : 0;
    const tint = und ? [0.55, 0.75, 0.95]
      : [Math.min(1.05, 1 - dark * 0.55 + 0.10 * dusk), 1 - dark * 0.5 + 0.02 * dusk, 1 - dark * 0.26];

    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
    gl.clearColor(hor[0], hor[1], hor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 空(フルスクリーン・手続きシェーダ)
    gl.useProgram(skyProg);
    gl.depthMask(false);
    gl.bindBuffer(gl.ARRAY_BUFFER, skyVbo);
    const aP = gl.getAttribLocation(skyProg, 'aP');
    gl.enableVertexAttribArray(aP);
    gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 8, 0);
    gl.uniform3fv(gl.getUniformLocation(skyProg, 'uZen'), zen);
    gl.uniform3fv(gl.getUniformLocation(skyProg, 'uHor'), hor);
    gl.uniform3fv(gl.getUniformLocation(skyProg, 'uCelCol'), celCol);
    gl.uniform2fv(gl.getUniformLocation(skyProg, 'uCel'), celPos);
    gl.uniform1f(gl.getUniformLocation(skyProg, 'uCelR'), celR);
    gl.uniform1f(gl.getUniformLocation(skyProg, 'uStar'), starAmt);
    gl.uniform1f(gl.getUniformLocation(skyProg, 'uAspect'), cam.aspect);
    gl.uniform1f(gl.getUniformLocation(skyProg, 'uSkyT'), G.world.animT);
    gl.uniform1f(gl.getUniformLocation(skyProg, 'uCloudAmt'), (und || zone.dark) ? 0 : 0.9);
    const cw2 = Math.max(0.18, 1 - dark * 0.8);
    gl.uniform3fv(gl.getUniformLocation(skyProg, 'uCloudCol'), [cw2, cw2, Math.min(1, cw2 * 1.05)]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);

    gl.useProgram(prog);
    gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'uVP'), false, cam.vp);
    gl.uniform3fv(gl.getUniformLocation(prog, 'uTint'), tint);
    gl.uniform3fv(gl.getUniformLocation(prog, 'uFog'), hor);
    gl.uniform1f(gl.getUniformLocation(prog, 'uFogDen'), zone.dark ? 3.2 : (und ? 2.6 : 1.0));
    gl.uniform1f(gl.getUniformLocation(prog, 'uTime'), G.world.animT);
    gl.uniform1f(gl.getUniformLocation(prog, 'uCldSh'), (und || zone.dark || dark > 0.5) ? 0 : 1);
    // ---- ライティング(太陽の向き=共用sunDir・色・環境光を時刻から) ----
    {
      let sunCol, skyC, gndC;
      if (isDay) {
        const warm = dusk;
        sunCol = [(0.95 + 0.15 * warm) * 1.0, 0.92 - 0.22 * warm, 0.78 - 0.30 * warm];
        skyC = [0.34, 0.42, 0.55];
        gndC = [0.28, 0.26, 0.22];
      } else {
        const mb2 = 0.14 + 0.16 * (1 - Math.abs(G.time.moonPhase() - 4) / 4);
        sunCol = [mb2 * 0.7, mb2 * 0.8, mb2 * 1.1];
        skyC = [0.10, 0.13, 0.22];
        gndC = [0.06, 0.07, 0.10];
      }
      if (und) { sunCol = [0.12, 0.28, 0.42]; skyC = [0.06, 0.16, 0.28]; gndC = [0.02, 0.06, 0.12]; }
      if (zone.dark) { sunCol = [0.30, 0.34, 0.44]; skyC = [0.05, 0.06, 0.10]; gndC = [0.03, 0.03, 0.05]; }
      gl.uniform3fv(gl.getUniformLocation(prog, 'uSunDir'), sunDir);
      gl.uniform3fv(gl.getUniformLocation(prog, 'uSunCol'), sunCol);
      gl.uniform3fv(gl.getUniformLocation(prog, 'uSkyC'), skyC);
      gl.uniform3fv(gl.getUniformLocation(prog, 'uGndC'), gndC);
      gl.uniform3fv(gl.getUniformLocation(prog, 'uEye'), cam.eye);
      gl.uniform3fv(gl.getUniformLocation(prog, 'uZenC'), zen); // 水面反射用の空色
      gl.uniform3fv(gl.getUniformLocation(prog, 'uHorC'), hor);
      // シャドウ
      gl.uniform1f(gl.getUniformLocation(prog, 'uShadowOn'), useShadow ? 1 : 0);
      if (useShadow) {
        gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'uLVP'), false, lightVP);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, shadowTex);
        gl.uniform1i(gl.getUniformLocation(prog, 'uShadow'), 1);
        gl.activeTexture(gl.TEXTURE0);
      }
    }
    // マテリアルアトラス
    gl.uniform1f(gl.getUniformLocation(prog, 'uTexOn'), atlasTex ? 1 : 0);
    // バンプ: DPR>=1.25 かつ shadows OFF でない時のみ(重すぎる時は自動オフ)
    const bumpOn = (G.settings && G.settings.maxDpr >= 1.2 && G.settings.shadows !== false) ? 1 : 0;
    gl.uniform1f(gl.getUniformLocation(prog, 'uBumpOn'), bumpOn);
    if (atlasTex) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);
    }

    const STRIDE = 48;
    const bindDraw = (buf, n, alphaPass) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      const aPos = gl.getAttribLocation(prog, 'aPos'), aCol = gl.getAttribLocation(prog, 'aCol'),
        aUV = gl.getAttribLocation(prog, 'aUV'), aNrm = gl.getAttribLocation(prog, 'aNrm');
      gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aCol);
      gl.enableVertexAttribArray(aUV); gl.enableVertexAttribArray(aNrm);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, STRIDE, 0);
      gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, STRIDE, 12);
      gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, STRIDE, 28);
      gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, STRIDE, 36);
      if (alphaPass) gl.depthMask(false);
      gl.drawArrays(gl.TRIANGLES, 0, n);
      if (alphaPass) gl.depthMask(true);
    };
    if (vertCount) bindDraw(vbo, vertCount, false);
    if (waterCount) bindDraw(waterVbo, waterCount, true);
    // ブルーム: sceneFBO→ブライト→ブラー→画面へ合成
    if (useBloom) runBloom(GW, GH);

    // ---- オーバーレイ: エンティティを奥行きソートして既存2D描画を重ねる ----
    const ents = G.world.entities.filter(e => !e.dead && e.draw);
    if (G.player && !G.player.dead) ents.push(G.player);
    const drawList = [];
    for (const e of ents) {
      const pr = projectXZ(e.x, groundAt(e.x, e.y), e.y);
      if (!pr || pr.w > 2400) continue;
      drawList.push({ e, pr });
    }
    drawList.sort((a, b) => b.pr.w - a.pr.w);
    // 夜はキャラも一緒に暮れる(人物だけ明るく浮くのを防ぐ)
    if (dark > 0.06) {
      ctx.filter = `brightness(${(1 - dark * 0.45).toFixed(2)}) saturate(${(1 - dark * 0.2).toFixed(2)})`;
    }
    for (const { e, pr } of drawList) {
      const bossScale = (e.def && e.def.boss) ? (e.def.unique ? 1.7 : 1.35) : 1; // ボスは威圧的に大きく
      const s = Math.min(pr.scale * 1.3 * bossScale, 4.4);
      ctx.setTransform(s, 0, 0, s, pr.x, pr.y);
      e.draw(ctx, { x: e.x, y: e.y }); // 自座標をcamに渡す→原点(0,0)に描かれる
    }
    ctx.filter = 'none';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    G.fx.drawProjected(ctx, (x, y) => projectXZ(x, groundAt(x, y), y));

    // ---- 発光タイルのグロー(水晶・溶岩・遺構・月門・気泡孔) ----
    const S3 = G.world.S;
    const p0x = Math.floor(G.player.x / T), p0y = Math.floor(G.player.y / T);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    let gcount = 0;
    for (let ty2 = Math.max(0, p0y - 11); ty2 <= Math.min(S3.th - 1, p0y + 11) && gcount < 70; ty2++) {
      for (let tx2 = Math.max(0, p0x - 13); tx2 <= Math.min(S3.tw - 1, p0x + 13) && gcount < 70; tx2++) {
        const cch = S3.grid[ty2][tx2];
        let colG = null, rad = 26, hgtG = 10, alp = 0.30;
        if (cch === 'c') { colG = '140,220,255'; hgtG = 16; }
        else if (cch === 'l') { colG = '255,140,60'; rad = 32; alp = 0.42; hgtG = 2; }
        else if (cch === 'g') { colG = '94,236,212'; hgtG = 3; }
        else if (cch === 'o') { colG = '160,215,255'; hgtG = 6; }
        else if (cch === 'M' && G.time.isFullMoon() && G.time.isNight()) { colG = '210,220,255'; rad = 44; hgtG = 32; alp = 0.5; }
        if (!colG) continue;
        const pr2 = projectXZ(tx2 * T + 16, hgtG + groundAt(tx2 * T + 16, ty2 * T + 16), ty2 * T + 16);
        if (!pr2) continue;
        const fl2 = 0.72 + 0.28 * Math.sin(G.world.animT * 3 + tx2 * 2.3 + ty2 * 1.7);
        const rr2 = Math.max(4, rad * pr2.scale * fl2);
        const gg = ctx.createRadialGradient(pr2.x, pr2.y, 0, pr2.x, pr2.y, rr2);
        gg.addColorStop(0, `rgba(${colG},${alp * fl2})`);
        gg.addColorStop(1, `rgba(${colG},0)`);
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(pr2.x, pr2.y, rr2, 0, 7); ctx.fill();
        gcount++;
      }
    }
    // 街灯の灯り(夕暮れ以降)
    if (dark > 0.12) {
      for (const lp of lampList) {
        const pr3 = projectXZ(lp.x, lp.h, lp.y);
        if (!pr3) continue;
        const rr3 = 42 * pr3.scale;
        const gg2 = ctx.createRadialGradient(pr3.x, pr3.y, 0, pr3.x, pr3.y, rr3);
        gg2.addColorStop(0, `rgba(255,214,140,${0.5 * Math.min(1, dark * 1.6)})`);
        gg2.addColorStop(1, 'rgba(255,214,140,0)');
        ctx.fillStyle = gg2;
        ctx.beginPath(); ctx.arc(pr3.x, pr3.y, rr3, 0, 7); ctx.fill();
      }
    }
    ctx.restore();
  };

  const hide = () => { if (glCanvas) glCanvas.style.display = 'none'; };
  const invalidate = () => { zoneKey = null; };

  return {
    init, active, draw, hide, mouseWorld, invalidate, groundAt,
    project: (x, y) => cam ? projectXZ(x, groundAt(x, y), y) : null,
    get ok() { return ok; },
  };
})();
