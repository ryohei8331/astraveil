'use strict';
// HD-2D風 3Dレンダラー(素のWebGL・依存ゼロ)
// 地形をボクセル押し出しで立体化し、キャラ・エフェクトは既存の2D描画コードを
// 透視投影した位置に奥行きソートで重ね描きする。設定で2D/3D切替可。
G.R3D = (() => {
  const T = G.TILE;
  let gl = null, glCanvas = null, prog = null, ok = false;
  let zoneKey = null, vbo = null, vertCount = 0;
  let waterVbo = null, waterCount = 0;
  let cam = null;

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
attribute vec3 aPos; attribute vec4 aCol;
uniform mat4 uVP; uniform vec3 uTint;
varying vec4 vCol; varying float vDepth;
void main(){
  gl_Position = uVP * vec4(aPos, 1.0);
  vCol = vec4(aCol.rgb * uTint, aCol.a);
  vDepth = gl_Position.w;
}`;
  const FSH = `
precision mediump float;
varying vec4 vCol; varying float vDepth;
uniform vec3 uFog; uniform float uFogDen;
void main(){
  float f = clamp(1.0 - exp(-uFogDen * vDepth * 0.0016), 0.0, 1.0);
  gl_FragColor = vec4(mix(vCol.rgb, uFog, f), vCol.a);
}`;

  const init = () => {
    try {
      glCanvas = document.createElement('canvas');
      glCanvas.id = 'gl';
      glCanvas.style.cssText = 'position:fixed;left:0;top:0;z-index:0;display:none;';
      const ui = document.getElementById('game');
      ui.style.position = 'relative'; ui.style.zIndex = '1';
      document.body.insertBefore(glCanvas, ui);
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
    grass: ['#3f7a34', '#376d2e', '#b39b6d', '#2b6b9e'], forest: ['#2c5c28', '#254f22', '#8d7a55', '#1f5d8a'],
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

  // ---- ゾーンメッシュ構築 ----
  const buildZone = () => {
    const S = G.world.S;
    const pal = PALBASE[G.world.zone.biome] || PALBASE.grass;
    const pos = [], col = [], wpos = [], wcol = [];
    const push = (arrP, arrC, verts, c, shade, alpha) => {
      const idx = [0, 1, 2, 0, 2, 3];
      for (const i of idx) {
        arrP.push(verts[i][0], verts[i][1], verts[i][2]);
        arrC.push(c[0] * shade, c[1] * shade, c[2] * shade, alpha !== undefined ? alpha : 1);
      }
    };
    const boxAtY = (p, cl, x, z, size, y0, y1, c, a) => {
      const x1 = x + size, z1 = z + size;
      push(p, cl, [[x, y1, z], [x1, y1, z], [x1, y1, z1], [x, y1, z1]], c, 1, a);
      push(p, cl, [[x, y0, z1], [x1, y0, z1], [x1, y1, z1], [x, y1, z1]], c, 0.8, a);
      push(p, cl, [[x1, y0, z], [x, y0, z], [x, y1, z], [x1, y1, z]], c, 0.55, a);
      push(p, cl, [[x1, y0, z1], [x1, y0, z], [x1, y1, z], [x1, y1, z1]], c, 0.68, a);
      push(p, cl, [[x, y0, z], [x, y0, z1], [x, y1, z1], [x, y1, z]], c, 0.68, a);
    };
    const gateOpen = c =>
      (c === 'D' && G.world.zone.gateFlag && G.quests.flags[G.world.zone.gateFlag]) ||
      (c === 'M' && G.time.isFullMoon() && G.time.isNight());

    for (let ty = 0; ty < S.th; ty++) {
      for (let tx = 0; tx < S.tw; tx++) {
        const c = S.grid[ty][tx];
        const x0 = tx * T, x1 = x0 + T, z0 = ty * T, z1 = z0 + T;
        const base = colorOf(c, pal, tx, ty);
        if (c === '~') {
          push(wpos, wcol, [[x0, -5, z0], [x1, -5, z0], [x1, -5, z1], [x0, -5, z1]], base, 1, 0.82);
          push(pos, col, [[x0, -14, z0], [x1, -14, z0], [x1, -14, z1], [x0, -14, z1]], base, 0.45);
          continue;
        }
        if (c === 'o') { // 気泡孔: 床+発光ベント
          push(pos, col, [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], base, 0.9);
          boxAtY(pos, col, x0 + T / 2 - 4, z0 + T / 2 - 4, 8, 0, 5, [0.7, 0.88, 1], 1);
          continue;
        }
        if (c === 'l') {
          push(pos, col, [[x0, -3, z0], [x1, -3, z0], [x1, -3, z1], [x0, -3, z1]], base, 1.15);
          continue;
        }
        if (c === '_') {
          push(pos, col, [[x0, -46, z0], [x1, -46, z0], [x1, -46, z1], [x0, -46, z1]], base, 0.7);
          continue;
        }
        let hgt = HEIGHT[c] || 0;
        if (hgt && gateOpen(c)) hgt = 0;
        if (hgt === 0) {
          push(pos, col, [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], base, 1);
          const h2 = G.U.hash2(tx, ty);
          if (c === 'h' && h2 > 0.3) boxAtY(pos, col, x0 + 8 + h2 * 10, z0 + 8 + (1 - h2) * 10, 6, 0, 7, [0.12, 0.3, 0.12], 1);
          if (c === 'F') boxAtY(pos, col, x0 + 8 + h2 * 14, z0 + 8 + (1 - h2) * 12, 4, 0, 6, hexRGB(['#ff8fa3', '#ffd75e', '#c9a0ff', '#ffffff'][Math.floor(h2 * 4)]), 1);
          if (c === 'g') boxAtY(pos, col, x0 + T / 2 - 3, z0 + T / 2 - 3, 6, 0, 2.5, [0.36, 0.93, 0.83], 1);
        } else if (c === 'T') {
          push(pos, col, [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], hexRGB(pal[1]), 1);
          boxAtY(pos, col, x0 + T / 2 - 4, z0 + T / 2 - 4, 8, 0, 16, [0.35, 0.27, 0.19], 1);
          boxAtY(pos, col, x0 + 3, z0 + 3, T - 6, 14, 26, base, 1);
          boxAtY(pos, col, x0 + 8, z0 + 8, T - 16, 26, 38, [Math.min(1, base[0] * 1.15), Math.min(1, base[1] * 1.15), Math.min(1, base[2] * 1.15)], 1);
        } else if (c === 'D' || c === 'M') {
          push(pos, col, [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], hexRGB(pal[1]), 1);
          boxAtY(pos, col, x0, z0 + 10, 7, 0, hgt, base, 1);
          boxAtY(pos, col, x1 - 7, z0 + 10, 7, 0, hgt, base, 1);
          boxAtY(pos, col, x0, z0 + 10, T, hgt - 8, hgt, c === 'M' ? [0.82, 0.85, 1] : base, 1);
        } else {
          boxAtY(pos, col, x0, z0, T, 0, hgt, base, 1);
        }
      }
    }

    const up = (buf, p, cl) => {
      const data = new Float32Array(p.length / 3 * 7);
      for (let i = 0, v = 0; i < p.length / 3; i++, v += 7) {
        data[v] = p[i * 3]; data[v + 1] = p[i * 3 + 1]; data[v + 2] = p[i * 3 + 2];
        data[v + 3] = cl[i * 4]; data[v + 4] = cl[i * 4 + 1]; data[v + 5] = cl[i * 4 + 2]; data[v + 6] = cl[i * 4 + 3];
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return p.length / 3;
    };
    if (!vbo) vbo = gl.createBuffer();
    if (!waterVbo) waterVbo = gl.createBuffer();
    vertCount = up(vbo, pos, col);
    waterCount = up(waterVbo, wpos, wcol);
  };

  const zoneKeyNow = () => {
    const z = G.world;
    return `${z.zoneId}|${z.zone.gateFlag ? !!G.quests.flags[z.zone.gateFlag] : 0}|${G.time.isFullMoon() && G.time.isNight() ? 1 : 0}`;
  };

  // ---- カメラ・投影 ----
  const PITCH = 0.86, DIST = 330, FOVY = 1.0; // 近め・低めで迫力と操作の見通しを両立
  const updateCamera = (w, h) => {
    const p = G.player;
    const sh = G.fx.shakeOffset;
    const cy = Math.sin(PITCH) * DIST, cz = Math.cos(PITCH) * DIST;
    const ctr = [p.x + sh.x, 10, p.y + sh.y];
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

    const dark = G.world.zone.dark ? 0.8 : G.time.darkness();
    const und = G.world.zone.underwater;
    const sky = und ? [0.03, 0.09, 0.16] : [
      G.U.lerp(0.45, 0.03, dark), G.U.lerp(0.62, 0.04, dark), G.U.lerp(0.80, 0.10, dark),
    ];
    const tint = und ? [0.55, 0.75, 0.95] : [1 - dark * 0.55, 1 - dark * 0.5, 1 - dark * 0.3];

    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
    gl.clearColor(sky[0], sky[1], sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(prog);
    gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'uVP'), false, cam.vp);
    gl.uniform3fv(gl.getUniformLocation(prog, 'uTint'), tint);
    gl.uniform3fv(gl.getUniformLocation(prog, 'uFog'), sky);
    gl.uniform1f(gl.getUniformLocation(prog, 'uFogDen'), G.world.zone.dark ? 3.2 : (und ? 2.6 : 1.0));

    const bindDraw = (buf, n, alphaPass) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      const aPos = gl.getAttribLocation(prog, 'aPos'), aCol = gl.getAttribLocation(prog, 'aCol');
      gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aCol);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 28, 0);
      gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, 28, 12);
      if (alphaPass) gl.depthMask(false);
      gl.drawArrays(gl.TRIANGLES, 0, n);
      if (alphaPass) gl.depthMask(true);
    };
    if (vertCount) bindDraw(vbo, vertCount, false);
    if (waterCount) bindDraw(waterVbo, waterCount, true);

    // ---- オーバーレイ: エンティティを奥行きソートして既存2D描画を重ねる ----
    const ents = G.world.entities.filter(e => !e.dead && e.draw);
    if (G.player && !G.player.dead) ents.push(G.player);
    const drawList = [];
    for (const e of ents) {
      const pr = projectXZ(e.x, 0, e.y);
      if (!pr || pr.w > 2400) continue;
      drawList.push({ e, pr });
    }
    drawList.sort((a, b) => b.pr.w - a.pr.w);
    for (const { e, pr } of drawList) {
      const s = Math.min(pr.scale * 1.3, 3.2); // ビルボードは少し大きめに(視認性)
      ctx.setTransform(s, 0, 0, s, pr.x, pr.y);
      e.draw(ctx, { x: e.x, y: e.y }); // 自座標をcamに渡す→原点(0,0)に描かれる
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    G.fx.drawProjected(ctx, (x, y) => projectXZ(x, 0, y));
  };

  const hide = () => { if (glCanvas) glCanvas.style.display = 'none'; };
  const invalidate = () => { zoneKey = null; };

  return {
    init, active, draw, hide, mouseWorld, invalidate,
    project: (x, y) => cam ? projectXZ(x, 0, y) : null,
    get ok() { return ok; },
  };
})();
