'use strict';
// 魔法: 呼吸同調チャージ(リング収縮タイミング) + MP残量比率で威力スケール(仕様5章)
// 雷のみ指向性分岐: 短チャージ=前方放射 / 満チャージ=天空からの落雷
G.Magic = (() => {
  const ELEMENTS = {
    fire: { name: '火', color: '#ff8c42', cost: 12, desc: '炎弾。着弾で小爆発+延焼' },
    aqua: { name: '水', color: '#5eb9ff', cost: 12, desc: '追尾する三連水刃。敵を鈍足に' },
    gale: { name: '風', color: '#a8f0c0', cost: 10, desc: '全周囲の突風。敵を吹き飛ばす' },
    terra: { name: '土', color: '#d2a05e', cost: 14, desc: '礫弾+岩の護り(防御バフ)' },
    volt: { name: '雷', color: '#f5e663', cost: 16, desc: '短チャージ=前方放射 / 満チャージ=落雷' },
  };
  const SWEET = [0.85, 1.25]; // 好機ウィンドウ

  const startCharge = p => {
    const el = ELEMENTS[p.element];
    if (p.mp < 4) { G.fx.float(p.x, p.y - 34, 'MPが尽きている', { color: '#9aa3b2', size: 11 }); return; }
    p.magicCharge = { t: 0, el: p.element };
    G.audio.sfx('charge');
  };
  const tickCharge = (p, dt) => {
    p.magicCharge.t += dt;
    if (p.magicCharge.t > 2.4) { fizzle(p); }
    if (G.U.chance(0.3)) {
      G.fx.burst(p.x + G.U.rnd(-14, 14), p.y - 6 + G.U.rnd(-14, 14), ELEMENTS[p.magicCharge.el].color, 1, 25);
    }
  };
  const fizzle = p => {
    G.fx.float(p.x, p.y - 34, '循環が乱れた…', { color: '#9aa3b2', size: 11 });
    p.magicCharge = null;
  };

  const timingMult = t => {
    if (t >= SWEET[0] && t <= SWEET[1]) return { m: 1.5, label: '完全同調!' };
    if (t < SWEET[0]) return { m: 0.55 + (t / SWEET[0]) * 0.45, label: null };
    if (t <= 2.0) return { m: 1.15, label: null };
    return { m: 0.5, label: '乱調' };
  };

  const release = p => {
    const ch = p.magicCharge; p.magicCharge = null;
    if (!ch || ch.t < 0.12) return; // 誤爆防止
    const el = ELEMENTS[ch.el];
    const tm = timingMult(ch.t);
    // MP残量比率スケール(仕様: 総量に応じ威力変化・枯渇時低下)
    const ratio = p.mp / p.mpMax;
    const mpScale = 0.5 + 0.5 * ratio;
    const cost = Math.min(el.cost, p.mp);
    const starved = p.mp < el.cost;
    p.mp -= cost;
    let power = (1 + p.level * 0.05) * tm.m * mpScale * (starved ? 0.5 : 1);
    if (tm.label) G.fx.float(p.x, p.y - 44, tm.label, { color: tm.m > 1 ? '#ffd75e' : '#9aa3b2', size: 13 });
    if (G.Growth) { G.Growth.note('spells'); G.Growth.note('spell_' + ch.el); }
    if (G.ui.tutorNote) G.ui.tutorNote('magic');
    G.audio.sfx('magic');
    const aim = aimAngle(p);
    switch (ch.el) {
      case 'fire': spawnProj({
        x: p.x, y: p.y - 6, vx: Math.cos(aim) * 300, vy: Math.sin(aim) * 300, r: 6,
        dmg: 20 * power, element: 'fire', color: el.color, life: 1.6,
        onDie(px, py) {
          G.fx.burst(px, py, '#ff8c42', 14, 130); G.fx.ring(px, py, '#ff8c42', 34, 0.3);
          for (const e of G.world.near(px, py, 40, x => x.kind === 'enemy' && !x.dead)) {
            G.Combat.playerHit(e, { magic: true, raw: 10 * power, element: 'fire' });
            e.burn = { t: 3, dps: 4 * power };
          }
        },
      }); break;
      case 'aqua': {
        for (let i = -1; i <= 1; i++) {
          spawnProj({
            x: p.x, y: p.y - 6, vx: Math.cos(aim + i * 0.35) * 240, vy: Math.sin(aim + i * 0.35) * 240,
            r: 4, dmg: 9 * power, element: 'aqua', color: el.color, life: 1.8, homing: 3.2,
            onHitEnemy(e) { e.slowT = 2.5; },
          });
        }
        break;
      }
      case 'gale': {
        G.fx.ring(p.x, p.y - 6, el.color, 90, 0.4);
        for (const e of G.world.near(p.x, p.y, 95, x => x.kind === 'enemy' && !x.dead)) {
          G.Combat.playerHit(e, { magic: true, raw: 15 * power, element: 'gale' });
          const a = G.U.angTo(p.x, p.y, e.x, e.y);
          e.kbx = Math.cos(a) * 380; e.kby = Math.sin(a) * 380;
        }
        break;
      }
      case 'terra': {
        spawnProj({
          x: p.x, y: p.y - 6, vx: Math.cos(aim) * 200, vy: Math.sin(aim) * 200, r: 8,
          dmg: 30 * power, element: 'terra', color: el.color, life: 1.4,
          onDie(px, py) { G.fx.burst(px, py, '#d2a05e', 10, 90); },
        });
        p.addBuff('terra_shield', 6);
        G.fx.float(p.x, p.y - 56, '岩の護り', { color: '#d2a05e', size: 11 });
        break;
      }
      case 'volt': {
        if (ch.t < SWEET[0]) {
          // 前方への放射(ビーム=貫通高速弾)
          spawnProj({
            x: p.x, y: p.y - 6, vx: Math.cos(aim) * 620, vy: Math.sin(aim) * 620, r: 5,
            dmg: 17 * power, element: 'volt', color: el.color, life: 0.7, pierce: true,
          });
          G.audio.sfx('thunder');
        } else {
          // 天空からの落雷: 最寄りの敵(いなければ照準先)にAoE
          let tx = p.x + Math.cos(aim) * 130, ty = p.y + Math.sin(aim) * 130;
          const cand = G.world.near(p.x, p.y, 260, x => x.kind === 'enemy' && !x.dead);
          if (cand.length) {
            cand.sort((a, b) => G.U.dist(p.x, p.y, a.x, a.y) - G.U.dist(p.x, p.y, b.x, b.y));
            tx = cand[0].x; ty = cand[0].y;
          }
          skyStrike(tx, ty, 38 * power);
        }
        break;
      }
    }
  };

  const skyStrike = (tx, ty, dmg) => {
    G.world.add({
      kind: 'fx', x: tx, y: ty, r: 0, t: 0, dead: false, zOrder: 500,
      update(dt) {
        this.t += dt;
        if (this.t >= 0.5 && !this.hit) {
          this.hit = true;
          G.audio.sfx('thunder'); G.fx.shake(7);
          G.fx.burst(tx, ty, '#f5e663', 20, 190); G.fx.ring(tx, ty, '#f5e663', 60, 0.4);
          for (const e of G.world.near(tx, ty, 55, x => x.kind === 'enemy' && !x.dead)) {
            G.Combat.playerHit(e, { magic: true, raw: dmg, element: 'volt' });
            e.stunT = Math.max(e.stunT || 0, 1.0);
          }
          G.world.notifyNoise(tx, ty, 260);
        }
        if (this.t > 0.75) this.dead = true;
      },
      draw(ctx, cam) {
        const px = tx - cam.x, py = ty - cam.y;
        if (this.t < 0.5) { // 予兆
          ctx.strokeStyle = `rgba(245,230,99,${0.3 + this.t})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(px, py, 55 * (1 - this.t), 0, 7); ctx.stroke();
        } else { // 落雷柱
          ctx.fillStyle = `rgba(255,255,220,${1 - (this.t - 0.5) * 4})`;
          ctx.fillRect(px - 7, py - 400, 14, 400);
          ctx.fillRect(px - 16, py - 60, 32, 60);
        }
      },
    });
  };

  const aimAngle = p => {
    if (!G.input.touchMode && (G.input.mouse.x || G.input.mouse.y)) {
      if (G.R3D && G.R3D.active()) {
        const mw = G.R3D.mouseWorld();
        if (mw) return G.U.angTo(p.x, p.y, mw.x, mw.y);
      }
      return G.U.angTo(p.x, p.y, G.cam.x + G.input.mouse.x, G.cam.y + G.input.mouse.y);
    }
    return p.facing;
  };

  // 汎用弾丸(プレイヤー/敵 共用)
  const spawnProj = o => {
    G.world.add({
      kind: o.side === 'enemy' ? 'eproj' : 'proj',
      x: o.x, y: o.y, vx: o.vx, vy: o.vy, r: o.r || 5,
      dmg: o.dmg, element: o.element, color: o.color || '#fff',
      life: o.life || 2, t: 0, dead: false, pierce: !!o.pierce, homing: o.homing || 0,
      hitSet: new Set(), zOrder: 100,
      onDie: o.onDie, onHitEnemy: o.onHitEnemy, status: o.status, label: o.label,
      update(dt) {
        this.t += dt;
        if (this.t >= this.life) { this.dead = true; if (this.onDie) this.onDie(this.x, this.y); return; }
        if (this.homing && this.kind === 'proj') {
          const cand = G.world.near(this.x, this.y, 160, x => x.kind === 'enemy' && !x.dead && !this.hitSet.has(x));
          if (cand.length) {
            const tgt = cand[0];
            const want = G.U.angTo(this.x, this.y, tgt.x, tgt.y);
            const cur = Math.atan2(this.vy, this.vx);
            const na = cur + G.U.clamp(G.U.angDiff(cur, want), -this.homing * dt, this.homing * dt);
            const sp = Math.hypot(this.vx, this.vy);
            this.vx = Math.cos(na) * sp; this.vy = Math.sin(na) * sp;
          }
        }
        this.x += this.vx * dt; this.y += this.vy * dt;
        if (G.world.solidAtPx(this.x, this.y, { flying: true })) {
          this.dead = true; if (this.onDie) this.onDie(this.x, this.y); return;
        }
        if (this.kind === 'proj') {
          for (const e of G.world.near(this.x, this.y, this.r + 12, x => x.kind === 'enemy' && !x.dead)) {
            if (this.hitSet.has(e)) continue;
            this.hitSet.add(e);
            G.Combat.playerHit(e, { magic: true, raw: this.dmg, element: this.element });
            if (this.onHitEnemy) this.onHitEnemy(e);
            if (!this.pierce) { this.dead = true; if (this.onDie) this.onDie(this.x, this.y); return; }
          }
        } else {
          const p = G.player;
          if (!p.dead && G.U.dist(this.x, this.y, p.x, p.y) < this.r + p.r) {
            G.Combat.hitPlayer(this.dmg, { status: this.status, label: this.label || '飛来物' });
            if (!this.pierce) { this.dead = true; if (this.onDie) this.onDie(this.x, this.y); }
          }
        }
      },
      draw(ctx, cam) {
        const px = this.x - cam.x, py = this.y - cam.y;
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(px, py, this.r, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        ctx.beginPath(); ctx.arc(px - this.vx * 0.01, py - this.vy * 0.01, this.r * 0.5, 0, 7); ctx.fill();
      },
    });
  };

  const drawCharge = (ctx, px, py, p) => {
    const ch = p.magicCharge;
    const el = ELEMENTS[ch.el];
    const prog = Math.min(ch.t / SWEET[0], 1);
    const r = 30 - prog * 20;
    // 好機ゾーン(内側の輪)
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(px, py, 10, 0, 7); ctx.stroke();
    const inSweet = ch.t >= SWEET[0] && ch.t <= SWEET[1];
    ctx.strokeStyle = inSweet ? '#ffd75e' : el.color;
    ctx.lineWidth = inSweet ? 3.5 : 2;
    ctx.beginPath(); ctx.arc(px, py, Math.max(8, r), 0, 7); ctx.stroke();
    if (inSweet) { ctx.strokeStyle = 'rgba(255,215,94,.4)'; ctx.beginPath(); ctx.arc(px, py, 14, 0, 7); ctx.stroke(); }
  };

  const cycleElement = p => {
    const i = p.elements.indexOf(p.element);
    p.element = p.elements[(i + 1) % p.elements.length];
    const el = ELEMENTS[p.element];
    G.ui.toast(`属性切替: ${el.name} — ${el.desc}`);
    G.audio.sfx('ui');
  };

  return { ELEMENTS, startCharge, tickCharge, release, drawCharge, cycleElement, spawnProj, skyStrike };
})();
