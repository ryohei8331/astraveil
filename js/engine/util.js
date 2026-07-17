'use strict';
// ASTRAVEIL 基盤: グローバル名前空間とユーティリティ
window.G = window.G || {};
G.TILE = 32;
G.DATA = G.DATA || {};
G.DATA.zones = G.DATA.zones || {};
G.DATA.enemies = G.DATA.enemies || {};
G.DATA.items = G.DATA.items || {};
G.DATA.skills = G.DATA.skills || {};
G.DATA.npcs = G.DATA.npcs || {};
G.DATA.quests = G.DATA.quests || {};

G.U = (() => {
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  const angTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
  const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
  const irnd = (a, b) => Math.floor(rnd(a, b + 1));
  const chance = p => Math.random() < p;
  const choice = arr => arr[Math.floor(Math.random() * arr.length)];
  // 決定的ハッシュ(タイル装飾のゆらぎ用): 0..1
  const hash2 = (x, y) => {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >> 13)) | 0; h = Math.imul(h, 1274126177);
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  };
  const fmt = n => Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  // 角度差(-PI..PI)
  const angDiff = (a, b) => {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  };
  const wrap = s => s; // 将来の折返し用フック
  return { clamp, lerp, dist, angTo, rnd, irnd, chance, choice, hash2, fmt, angDiff, wrap };
})();
