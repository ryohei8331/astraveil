'use strict';
// プロシージャルテクスチャ工房: 起動時にマテリアル詳細(ディテールマップ)を描き上げ、
// WebGLアトラスとして全ポリゴンに貼る。値は「明度の肌合い」(平均~0.84)で、
// シェーダ側で頂点色(ライティング済みの色)に乗算される。
G.Tex = (() => {
  const CELL = 64, GRID = 4; // 4x4 = 16マテリアル / 256px角
  let canvas = null, ok = false;

  // セル内ローカル乱数(決定論)
  let seed = 1;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const R = (a, b) => a + rnd() * (b - a);

  const gray = v => `rgb(${(v * 255) | 0},${(v * 255) | 0},${(v * 255) | 0})`;

  const MATS = {};
  const build = () => {
    try {
      canvas = document.createElement('canvas');
      canvas.width = canvas.height = CELL * GRID;
      const x = canvas.getContext('2d');
      if (!x || !x.fillRect) return false;

      let idx = 0;
      const cell = (name, painter) => {
        const cx = (idx % GRID) * CELL, cy = Math.floor(idx / GRID) * CELL;
        MATS[name] = idx;
        x.save();
        x.translate(cx, cy);
        x.beginPath(); x.rect(0, 0, CELL, CELL); x.clip();
        seed = 1000 + idx * 777;
        painter(x);
        x.restore();
        idx++;
      };
      const speckle = (x2, n, lo, hi, s = 1) => {
        for (let i = 0; i < n; i++) {
          x2.fillStyle = gray(R(lo, hi));
          x2.fillRect(R(0, CELL), R(0, CELL), s, s);
        }
      };
      const base = (x2, v) => { x2.fillStyle = gray(v); x2.fillRect(0, 0, CELL, CELL); };

      // 0: フラット(フォールバック)
      cell('flat', x2 => { base(x2, 0.84); speckle(x2, 120, 0.80, 0.88); });

      // 1: 草A(葉先の流れ)
      cell('grassA', x2 => {
        base(x2, 0.82);
        speckle(x2, 500, 0.74, 0.92);
        x2.lineWidth = 1;
        for (let i = 0; i < 90; i++) {
          const gx = R(0, CELL), gy = R(0, CELL), h = R(3, 7), lean = R(-2, 2);
          x2.strokeStyle = gray(R(0.86, 1.02));
          x2.beginPath(); x2.moveTo(gx, gy); x2.quadraticCurveTo(gx + lean, gy - h * 0.6, gx + lean * 1.6, gy - h); x2.stroke();
          x2.strokeStyle = gray(R(0.66, 0.76));
          x2.beginPath(); x2.moveTo(gx + 1, gy); x2.lineTo(gx + 1 + lean, gy - h * 0.5); x2.stroke();
        }
      });

      // 2: 草B(密・葉群。樹冠にも使う)
      cell('grassB', x2 => {
        base(x2, 0.80);
        for (let i = 0; i < 240; i++) {
          x2.fillStyle = gray(R(0.68, 1.04));
          const gx = R(0, CELL), gy = R(0, CELL), r2 = R(1, 3);
          x2.beginPath(); x2.ellipse(gx, gy, r2, r2 * 0.6, R(0, 3), 0, 7); x2.fill();
        }
        speckle(x2, 200, 0.62, 0.74);
      });

      // 3: 土の道(踏み跡・小石)
      cell('dirt', x2 => {
        base(x2, 0.86);
        speckle(x2, 700, 0.78, 0.94);
        for (let i = 0; i < 26; i++) { // 小石
          x2.fillStyle = gray(R(0.7, 1.0));
          const gx = R(2, CELL - 2), gy = R(2, CELL - 2), r2 = R(1, 2.6);
          x2.beginPath(); x2.ellipse(gx, gy, r2, r2 * 0.75, R(0, 3), 0, 7); x2.fill();
          x2.fillStyle = gray(0.66);
          x2.beginPath(); x2.ellipse(gx + 0.6, gy + 0.7, r2 * 0.8, r2 * 0.5, 0, 0, 7); x2.fill();
        }
        x2.strokeStyle = gray(0.74); x2.lineWidth = 1.5; // 轍
        x2.beginPath(); x2.moveTo(0, R(8, 20)); x2.quadraticCurveTo(CELL / 2, R(10, 26), CELL, R(8, 22)); x2.stroke();
        x2.beginPath(); x2.moveTo(0, R(40, 56)); x2.quadraticCurveTo(CELL / 2, R(38, 56), CELL, R(42, 58)); x2.stroke();
      });

      // 4: 砂(風紋)
      cell('sand', x2 => {
        base(x2, 0.88);
        speckle(x2, 800, 0.82, 0.95);
        x2.lineWidth = 1;
        for (let i = 0; i < 8; i++) {
          const gy = i * 8 + R(0, 5);
          x2.strokeStyle = gray(R(0.78, 0.84));
          x2.beginPath(); x2.moveTo(0, gy);
          for (let gx = 0; gx <= CELL; gx += 8) x2.lineTo(gx, gy + Math.sin(gx * 0.4 + i) * 2);
          x2.stroke();
        }
      });

      // 5: 岩石(割れ目のあるファセット)
      cell('rock', x2 => {
        base(x2, 0.82);
        for (let i = 0; i < 14; i++) { // 面
          x2.fillStyle = gray(R(0.72, 0.96));
          const gx = R(-6, CELL), gy = R(-6, CELL), s2 = R(10, 24);
          x2.beginPath();
          x2.moveTo(gx, gy); x2.lineTo(gx + s2, gy + R(-4, 4)); x2.lineTo(gx + s2 - R(2, 8), gy + s2); x2.lineTo(gx - R(0, 6), gy + s2 - R(2, 8));
          x2.closePath(); x2.fill();
        }
        x2.strokeStyle = gray(0.58); x2.lineWidth = 1; // 亀裂
        for (let i = 0; i < 7; i++) {
          x2.beginPath(); x2.moveTo(R(0, CELL), R(0, CELL));
          for (let k = 0; k < 4; k++) x2.lineTo(R(0, CELL), R(0, CELL));
          x2.stroke();
        }
        speckle(x2, 250, 0.7, 0.92);
      });

      // 6: 漆喰+木骨の壁(家の側面)
      cell('plaster', x2 => {
        base(x2, 0.95);
        speckle(x2, 500, 0.88, 1.0);
        x2.fillStyle = gray(0.55); // 梁
        x2.fillRect(0, 0, CELL, 5); x2.fillRect(0, CELL - 5, CELL, 5);
        x2.fillRect(0, 0, 5, CELL); x2.fillRect(CELL - 5, 0, 5, CELL);
        x2.fillRect(CELL / 2 - 2.5, 0, 5, CELL);
        x2.save(); x2.translate(CELL * 0.25, CELL / 2); x2.rotate(0.6); x2.fillRect(-2, -CELL, 4, CELL * 2); x2.restore();
        x2.save(); x2.translate(CELL * 0.75, CELL / 2); x2.rotate(-0.6); x2.fillRect(-2, -CELL, 4, CELL * 2); x2.restore();
        x2.strokeStyle = gray(0.8); x2.lineWidth = 1; // 汚れ
        for (let i = 0; i < 10; i++) { x2.beginPath(); x2.moveTo(R(6, CELL - 6), R(6, 20)); x2.lineTo(R(6, CELL - 6), R(30, CELL - 6)); x2.stroke(); }
      });

      // 7: 屋根瓦(重なる列)
      cell('shingle', x2 => {
        base(x2, 0.8);
        for (let row = 0; row < 5; row++) {
          const gy = row * 13;
          const off = row % 2 ? 8 : 0;
          for (let gx = -16; gx < CELL + 8; gx += 16) {
            x2.fillStyle = gray(R(0.76, 0.94));
            x2.beginPath(); x2.roundRect(gx + off, gy, 15, 14, 4); x2.fill();
            x2.fillStyle = gray(0.6);
            x2.fillRect(gx + off, gy + 11, 15, 3);
          }
        }
        speckle(x2, 160, 0.7, 0.9);
      });

      // 8: 木板(節と木目)
      cell('plank', x2 => {
        base(x2, 0.86);
        for (let row = 0; row < 4; row++) {
          const gy = row * 16;
          x2.strokeStyle = gray(0.62); x2.lineWidth = 2;
          x2.beginPath(); x2.moveTo(0, gy); x2.lineTo(CELL, gy); x2.stroke();
          x2.strokeStyle = gray(R(0.72, 0.8)); x2.lineWidth = 1;
          for (let i = 0; i < 4; i++) {
            const ly = gy + R(3, 13);
            x2.beginPath(); x2.moveTo(0, ly); x2.quadraticCurveTo(CELL / 2, ly + R(-2, 2), CELL, ly); x2.stroke();
          }
          if (rnd() > 0.4) { // 節
            const nx = R(8, CELL - 8), ny = gy + 8;
            x2.strokeStyle = gray(0.6);
            x2.beginPath(); x2.ellipse(nx, ny, 3.5, 2.4, 0, 0, 7); x2.stroke();
            x2.beginPath(); x2.ellipse(nx, ny, 1.6, 1.1, 0, 0, 7); x2.stroke();
          }
        }
      });

      // 9: 水面コースティクス(光の網)
      cell('water', x2 => {
        base(x2, 0.85);
        x2.lineWidth = 1.6;
        for (let i = 0; i < 16; i++) {
          x2.strokeStyle = gray(R(0.92, 1.08));
          x2.beginPath();
          const gy = R(0, CELL);
          x2.moveTo(0, gy);
          for (let gx = 0; gx <= CELL; gx += 6) x2.lineTo(gx, gy + Math.sin(gx * 0.3 + i * 2) * R(2, 5));
          x2.stroke();
        }
        speckle(x2, 140, 0.78, 0.9);
      });

      // 10: 草むら(密な茂み)
      cell('bush', x2 => {
        base(x2, 0.74);
        x2.lineWidth = 1.4;
        for (let i = 0; i < 120; i++) {
          const gx = R(0, CELL), gy = R(4, CELL), h = R(6, 13), lean = R(-3, 3);
          x2.strokeStyle = gray(R(0.6, 1.0));
          x2.beginPath(); x2.moveTo(gx, gy); x2.quadraticCurveTo(gx + lean, gy - h * 0.7, gx + lean * 1.8, gy - h); x2.stroke();
        }
      });

      // 11: 遺構の床(石畳+微かな紋)
      cell('ruinfloor', x2 => {
        base(x2, 0.82);
        x2.strokeStyle = gray(0.62); x2.lineWidth = 1.6;
        for (let gy = 0; gy <= CELL; gy += 21) { x2.beginPath(); x2.moveTo(0, gy); x2.lineTo(CELL, gy); x2.stroke(); }
        for (let row = 0; row < 3; row++) {
          const off = row % 2 ? 11 : 0;
          for (let gx = off; gx <= CELL; gx += 22) {
            x2.beginPath(); x2.moveTo(gx, row * 21); x2.lineTo(gx, row * 21 + 21); x2.stroke();
          }
        }
        x2.strokeStyle = gray(1.0); // 微かな回路紋
        x2.lineWidth = 1;
        x2.beginPath(); x2.moveTo(6, 10); x2.lineTo(26, 10); x2.lineTo(26, 31); x2.lineTo(52, 31); x2.stroke();
        x2.beginPath(); x2.arc(52, 31, 2.4, 0, 7); x2.stroke();
        speckle(x2, 260, 0.72, 0.9);
      });

      // 12: 発光グリッド床
      cell('techfloor', x2 => {
        base(x2, 0.72);
        x2.strokeStyle = gray(1.12); x2.lineWidth = 1.4;
        x2.strokeRect(7, 7, CELL - 14, CELL - 14);
        x2.strokeRect(15, 15, CELL - 30, CELL - 30);
        x2.fillStyle = gray(1.25);
        x2.fillRect(CELL / 2 - 2, CELL / 2 - 2, 4, 4);
        for (const [gx, gy] of [[7, 7], [CELL - 7, 7], [7, CELL - 7], [CELL - 7, CELL - 7]]) {
          x2.fillRect(gx - 1.5, gy - 1.5, 3, 3);
        }
        speckle(x2, 120, 0.66, 0.8);
      });

      // 13: 水晶ファセット
      cell('crystal', x2 => {
        base(x2, 0.9);
        for (let i = 0; i < 9; i++) {
          x2.fillStyle = gray(R(0.82, 1.15));
          const gx = R(0, CELL), gy = R(0, CELL), s2 = R(8, 20);
          x2.beginPath();
          x2.moveTo(gx, gy - s2 / 2); x2.lineTo(gx + s2 / 3, gy); x2.lineTo(gx, gy + s2 / 2); x2.lineTo(gx - s2 / 3, gy);
          x2.closePath(); x2.fill();
        }
        x2.strokeStyle = gray(1.2); x2.lineWidth = 1;
        for (let i = 0; i < 6; i++) { x2.beginPath(); x2.moveTo(R(0, CELL), R(0, CELL)); x2.lineTo(R(0, CELL), R(0, CELL)); x2.stroke(); }
      });

      // 14: 月の花畑(花弁の散り)
      cell('moonfield', x2 => {
        base(x2, 0.84);
        speckle(x2, 350, 0.78, 0.92);
        for (let i = 0; i < 40; i++) {
          x2.fillStyle = gray(R(0.95, 1.12));
          const gx = R(0, CELL), gy = R(0, CELL);
          x2.beginPath(); x2.ellipse(gx, gy, 2.2, 1.2, R(0, 3), 0, 7); x2.fill();
        }
        for (let i = 0; i < 12; i++) {
          x2.fillStyle = gray(1.08);
          const gx = R(4, CELL - 4), gy = R(4, CELL - 4);
          for (let k = 0; k < 5; k++) {
            const a = k * 1.256;
            x2.beginPath(); x2.ellipse(gx + Math.cos(a) * 2.6, gy + Math.sin(a) * 2.6, 1.8, 1.0, a, 0, 7); x2.fill();
          }
        }
      });

      // 15: 溶岩の殻(黒い殻に走る光)
      cell('lava', x2 => {
        base(x2, 0.66);
        for (let i = 0; i < 12; i++) {
          x2.fillStyle = gray(R(0.5, 0.66));
          const gx = R(-6, CELL), gy = R(-6, CELL), s2 = R(12, 26);
          x2.beginPath();
          x2.moveTo(gx, gy); x2.lineTo(gx + s2, gy + R(-5, 5)); x2.lineTo(gx + s2 - R(0, 8), gy + s2); x2.closePath(); x2.fill();
        }
        x2.strokeStyle = gray(1.5); x2.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
          x2.beginPath(); x2.moveTo(R(0, CELL), R(0, CELL));
          for (let k = 0; k < 3; k++) x2.lineTo(R(0, CELL), R(0, CELL));
          x2.stroke();
        }
      });

      ok = true;
      return true;
    } catch (e) { ok = false; return false; }
  };

  // UV矩形(にじみ防止に1.5pxインセット)
  const uv = name => {
    const i = MATS[name] !== undefined ? MATS[name] : 0;
    const s = CELL * GRID;
    const u0 = ((i % GRID) * CELL + 1.5) / s, v0 = (Math.floor(i / GRID) * CELL + 1.5) / s;
    const u1 = ((i % GRID) * CELL + CELL - 1.5) / s, v1 = (Math.floor(i / GRID) * CELL + CELL - 1.5) / s;
    return [u0, v0, u1, v1];
  };

  return { build, uv, get canvas() { return canvas; }, get ok() { return ok; }, MATS };
})();
