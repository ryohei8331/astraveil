'use strict';
// ワールド: ゾーン(タイルマップ)管理・衝突・スポーン・描画
// タイル凡例:
//  . 草  , 濃草  = 道  s 砂  h 草むら(減速)  F 花  f 床  b 橋  r 遺構床  g 発光床
//  # 岩(壁)  T 樹  w 建物壁  c 水晶(壁)  * 瓦礫(壁)  ^ 崖(壁駆けで通行可)
//  ~ 水(反重力歩法/跳躍で通行可)  _ 奈落(落下ダメージ)  l 溶岩(接触ダメージ)
//  D 門(世界フラグで開放)  M 月門(満月の夜のみ)  (空白) 虚無
G.cam = { x: 0, y: 0 };

G.world = (() => {
  const T = G.TILE;
  const W = {
    zoneId: null, zone: null, grid: [], tw: 0, th: 0,
    entities: [], spawnRecs: [], animT: 0, bossActive: null,
    enteredMsgs: new Set(),
  };
  const SOLID_ALL = new Set(['#', 'T', 'w', 'c', '*', ' ']);

  const tile = (tx, ty) => {
    if (tx < 0 || ty < 0 || tx >= W.tw || ty >= W.th) return ' ';
    return W.grid[ty][tx];
  };

  const isSolidFor = (c, ent) => {
    if (SOLID_ALL.has(c)) return true;
    if (c === '^') return !(ent && ent.canClimb);
    if (c === '~') return !(ent && (ent.waterWalk || ent.airborne || ent.flying));
    if (c === '_') return !!(ent && ent.kind !== 'player' && !ent.flying); // 敵は奈落に入らない
    if (c === 'D') return !(W.zone.gateFlag && G.quests && G.quests.flags[W.zone.gateFlag]);
    if (c === 'M') return !(G.time.isFullMoon() && G.time.isNight());
    return false;
  };
  const solidAtPx = (x, y, ent) => isSolidFor(tile(Math.floor(x / T), Math.floor(y / T)), ent);

  // 軸分離の衝突判定つき移動。戻り値: ぶつかったか
  const moveEntity = (e, dx, dy) => {
    let blocked = false;
    const r = e.r * 0.8;
    if (dx !== 0) {
      const nx = e.x + dx, edge = nx + Math.sign(dx) * r;
      if (solidAtPx(edge, e.y - r, e) || solidAtPx(edge, e.y + r, e)) {
        e.x = (Math.floor(edge / T) + (dx > 0 ? 0 : 1)) * T - Math.sign(dx) * (r + 0.01);
        blocked = true;
      } else e.x = nx;
    }
    if (dy !== 0) {
      const ny = e.y + dy, edge = ny + Math.sign(dy) * r;
      if (solidAtPx(e.x - r, edge, e) || solidAtPx(e.x + r, edge, e)) {
        e.y = (Math.floor(edge / T) + (dy > 0 ? 0 : 1)) * T - Math.sign(dy) * (r + 0.01);
        blocked = true;
      } else e.y = ny;
    }
    return blocked;
  };

  const tileUnder = e => tile(Math.floor(e.x / T), Math.floor(e.y / T));

  const randOpenPos = (area) => { // area: [tx,ty,tw,th]
    for (let i = 0; i < 40; i++) {
      const tx = G.U.irnd(area[0], area[0] + area[2] - 1);
      const ty = G.U.irnd(area[1], area[1] + area[3] - 1);
      const c = tile(tx, ty);
      if (!isSolidFor(c, null) && c !== '_' && c !== 'l' && c !== '~') {
        return { x: (tx + 0.5) * T, y: (ty + 0.5) * T };
      }
    }
    return null;
  };

  const condOk = name => !name || (G.quests && G.quests.conds[name] && G.quests.conds[name]());

  const load = (zoneId, px, py) => {
    const def = G.DATA.zones[zoneId];
    if (!def) { console.error('zone not found:', zoneId); return; }
    W.zoneId = zoneId; W.zone = def;
    const maxW = Math.max(...def.map.map(r => r.length));
    W.grid = def.map.map(r => r.padEnd(maxW, ' '));
    W.th = W.grid.length; W.tw = maxW;
    W.entities = []; W.spawnRecs = []; W.bossActive = null; W.enteredMsgs.clear();
    G.fx.clear();
    // スポーン記録
    for (const sp of (def.spawns || [])) {
      W.spawnRecs.push({ def: sp, alive: new Set(), timer: 0, spawned: 0 });
    }
    // NPC・プロップ
    for (const n of (def.npcs || [])) {
      const e = G.NPC.create(n);
      if (e) W.entities.push(e);
    }
    for (const p of (def.props || [])) {
      const e = G.NPC.createProp(p);
      if (e) W.entities.push(e);
    }
    // 偽プレイヤー(街の賑わい)
    if (def.town && G.DATA.flavor && G.NPC.createFake) {
      const n = def.fakePlayers !== undefined ? def.fakePlayers : 6;
      for (let i = 0; i < n; i++) {
        const pos = randOpenPos([1, 1, W.tw - 2, W.th - 2]);
        if (pos) W.entities.push(G.NPC.createFake(pos.x, pos.y));
      }
    }
    if (G.player) {
      G.player.x = px * T + T / 2; G.player.y = py * T + T / 2;
      G.player.airborne = false;
      G.cam.x = G.player.x - innerWidth / 2; G.cam.y = G.player.y - innerHeight / 2;
    }
    G.audio.setMood(def.mood || 'field');
    if (G.ui) G.ui.banner(def.name);
    if (G.quests) G.quests.fire('enter', { zone: zoneId });
  };

  const add = e => { W.entities.push(e); return e; };

  const spawnEnemy = (id, x, y, opt) => {
    const e = G.Enemy.create(id, x, y, opt);
    if (e) W.entities.push(e);
    return e;
  };

  const enemies = () => W.entities.filter(e => e.kind === 'enemy' && !e.dead);
  const near = (x, y, r, pred) =>
    W.entities.filter(e => !e.dead && (!pred || pred(e)) && G.U.dist(x, y, e.x, e.y) <= r);

  // 騒音(攻撃音・振動): 晶殻蠍の覚醒、周辺mobの警戒
  const notifyNoise = (x, y, r) => {
    for (const e of W.entities) {
      if (e.kind !== 'enemy' || e.dead) continue;
      if (G.U.dist(x, y, e.x, e.y) > r) continue;
      if (e.onNoise) e.onNoise(x, y);
    }
  };

  const dropPickup = (x, y, item, qty) => {
    add({
      kind: 'pickup', x: x + G.U.rnd(-8, 8), y: y + G.U.rnd(-8, 8), r: 6,
      item, qty: qty || 1, t: 0, dead: false,
      update(dt) {
        this.t += dt;
        const p = G.player;
        const d = G.U.dist(this.x, this.y, p.x, p.y);
        if (d < 90 + p.stats.LUC) { // LUCで吸引範囲拡大
          this.x += (p.x - this.x) * 6 * dt; this.y += (p.y - this.y) * 6 * dt;
        }
        if (d < 16) {
          this.dead = true;
          if (this.item === 'stella') {
            p.stella += this.qty; G.audio.sfx('coin');
            G.fx.float(p.x, p.y - 20, `+${G.U.fmt(this.qty)} st`, { color: '#ffd75e', size: 13 });
          } else {
            G.Items.give(this.item, this.qty);
          }
        }
        if (this.t > 60) this.dead = true;
      },
      draw(ctx, cam) {
        const bob = Math.sin(this.t * 5) * 3;
        const px = this.x - cam.x, py = this.y - cam.y + bob;
        if (this.item === 'stella') {
          ctx.fillStyle = '#ffd75e'; ctx.strokeStyle = '#b8860b';
          ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        } else {
          const it = G.DATA.items[this.item] || {};
          ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(it.icon || '📦', px, py + 5); ctx.textAlign = 'left';
        }
      },
    });
  };

  const onEnemyDeath = e => {
    for (const rec of W.spawnRecs) rec.alive.delete(e);
    if (W.bossActive === e) { W.bossActive = null; G.audio.setMood(W.zone.mood || 'field'); }
    // ドロップ
    const def = e.def;
    const luc = (1 + G.player.stats.LUC * 0.01) * (G.Social && G.Social.clan === '観察会アルカ' ? 1.25 : 1);
    if (def.stella) dropPickup(e.x, e.y, 'stella', Math.round(G.U.rnd(def.stella * 0.7, def.stella * 1.3)));
    for (const d of (def.drops || [])) {
      if (G.U.chance(Math.min(1, d.p * luc))) {
        dropPickup(e.x, e.y, d.item, d.qty || 1);
        if (d.p < 0.2 && G.Growth) G.Growth.note('lucky_drops'); // レア枠を引き当てた
      }
    }
    G.player.gainExp(def.exp || 1);
    if (G.Growth) G.Growth.onKill(e);
    G.quests.fire('kill', { id: e.defId, e });
  };

  const update = dt => {
    W.animT += dt;
    if (W.inkT > 0) W.inkT -= dt; // ヨグリムの墨
    if (G.BeatInfo) G.BeatInfo.active = false; // maestroが毎フレーム立て直す
    // スポーン
    for (const rec of W.spawnRecs) {
      const sp = rec.def;
      if (sp.once && G.quests.flags[sp.once]) continue;
      if (sp.night && !G.time.isNight()) continue;
      if (!condOk(sp.cond)) continue;
      // 群れスケーリング(頭数狩り): プレイヤーLvと救援NPC数で増員
      let want = sp.n;
      if (sp.scale) {
        const allies = W.entities.filter(e => e.kind === 'ally' && !e.dead).length;
        want = Math.min(sp.n + Math.floor(G.player.level / 4) + allies, sp.n * 2 + 2);
      }
      rec.timer -= dt;
      if (rec.alive.size < want && rec.timer <= 0) {
        if (sp.boss && rec.spawned > 0) continue; // ボスは1体のみ
        const pos = randOpenPos(sp.area);
        const minDist = sp.boss ? 60 : 180; // 固定ボスは近くてもスポーン(縄張りの主)
        if (pos && G.U.dist(pos.x, pos.y, G.player.x, G.player.y) > minDist) {
          const e = spawnEnemy(sp.enemy, pos.x, pos.y, { spawnRec: rec, pack: rec });
          if (e) { rec.alive.add(e); rec.spawned++; }
          // ゾーン到着直後は素早く頭数を揃え、以後は本来のリスポーン間隔
          rec.timer = rec.spawned < want ? 0.6 : (sp.respawn || 20);
        } else rec.timer = 1.5;
      }
    }
    // エンティティ更新
    for (const e of W.entities) if (!e.dead && e.update) e.update(dt);
    for (let i = W.entities.length - 1; i >= 0; i--) {
      if (W.entities[i].dead) W.entities.splice(i, 1);
    }
    // 出口判定
    const p = G.player;
    if (p && !p.dead && G.game.mode === 'play') {
      for (const ex of (W.zone.exits || [])) {
        const rx = ex.x * T, ry = ex.y * T, rw = (ex.w || 1) * T, rh = (ex.h || 1) * T;
        if (p.x > rx && p.x < rx + rw && p.y > ry && p.y < ry + rh) {
          if (ex.cond && !condOk(ex.cond)) {
            if (ex.msg && !W.enteredMsgs.has(ex.label || ex.to)) {
              G.ui.toast(ex.msg); W.enteredMsgs.add(ex.label || ex.to);
            }
            continue;
          }
          G.game.changeZone(ex.to, ex.tx, ex.ty);
          return;
        }
      }
      // 地形ダメージ
      const c = tileUnder(p);
      if (c === 'l' && !p.airborne && !p.lavaTick) {
        p.lavaTick = 0.5;
        G.Combat.hitPlayer(12 + G.player.level * 2, { type: 'fire', pure: true, label: '灼熱' });
      }
      if (p.lavaTick) { p.lavaTick -= dt; if (p.lavaTick <= 0) p.lavaTick = null; }
      if (c === '_' && !p.airborne) p.fallIntoPit();
    }
  };

  // ---- 描画 ----
  const PAL = {
    grass: { base: '#3f7a34', alt: '#376d2e', path: '#b39b6d', water: '#2b6b9e' },
    forest: { base: '#2c5c28', alt: '#254f22', path: '#8d7a55', water: '#1f5d8a' },
    swamp: { base: '#4a5c33', alt: '#3f4f2c', path: '#7a7050', water: '#4a6a52' },
    volcano: { base: '#4a3833', alt: '#41302c', path: '#6b5148', water: '#2b6b9e' },
    ruins: { base: '#37414e', alt: '#2f3844', path: '#556273', water: '#274a66' },
    town: { base: '#4f8a41', alt: '#467a39', path: '#c2a878', water: '#2b6b9e' },
    indoor: { base: '#6b5138', alt: '#61492f', path: '#7a5e42', water: '#2b6b9e' },
    cave: { base: '#3a3440', alt: '#332d38', path: '#584e60', water: '#1e3d5c' },
    moon: { base: '#5e6b8f', alt: '#525e80', path: '#9aa3c2', water: '#3b4a80' },
    beach: { base: '#c9b380', alt: '#bfa877', path: '#d8c390', water: '#2e86ab' },
    abyss: { base: '#1a2c40', alt: '#16263a', path: '#2c4560', water: '#0e1a2c' },
  };
  const drawTile = (ctx, c, px, py, tx, ty, pal) => {
    const h = G.U.hash2(tx, ty);
    switch (c) {
      case '.': case 'f': case 'r': case ',': {
        let col = c === ',' ? pal.alt : (c === 'f' ? '#a08b64' : (c === 'r' ? pal.base : (h > 0.5 ? pal.base : pal.alt)));
        ctx.fillStyle = col; ctx.fillRect(px, py, T, T);
        if (c === '.' && h > 0.82) { ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(px + h * 20, py + h * 14, 3, 3); }
        if (c === 'r' && h > 0.7) { ctx.strokeStyle = 'rgba(94,234,212,.14)'; ctx.strokeRect(px + 4, py + 4, T - 8, T - 8); }
        break;
      }
      case '=': ctx.fillStyle = pal.path; ctx.fillRect(px, py, T, T);
        if (h > 0.75) { ctx.fillStyle = 'rgba(0,0,0,.1)'; ctx.beginPath(); ctx.arc(px + h * 28, py + (1 - h) * 28, 2.5, 0, 7); ctx.fill(); }
        break;
      case 's': ctx.fillStyle = '#cdb787'; ctx.fillRect(px, py, T, T);
        if (h > 0.8) { ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(px + h * 24, py + h * 20, 3, 2); }
        break;
      case 'h': ctx.fillStyle = pal.alt; ctx.fillRect(px, py, T, T);
        ctx.fillStyle = 'rgba(20,60,20,.55)';
        for (let i = 0; i < 4; i++) {
          const gx = px + ((h * 97 + i * 41) % 26) + 3, gy = py + ((h * 61 + i * 27) % 24) + 4;
          ctx.fillRect(gx, gy, 2, 8);
        }
        break;
      case 'F': ctx.fillStyle = pal.base; ctx.fillRect(px, py, T, T);
        ctx.fillStyle = ['#ff8fa3', '#ffd75e', '#c9a0ff', '#fff'][Math.floor(h * 4)];
        ctx.beginPath(); ctx.arc(px + 8 + h * 14, py + 8 + (1 - h) * 14, 3, 0, 7); ctx.fill();
        ctx.fillStyle = '#ffd75e'; ctx.fillRect(px + 8 + h * 14 - 1, py + 8 + (1 - h) * 14 - 1, 2, 2);
        break;
      case '#': ctx.fillStyle = '#5d5d66'; ctx.fillRect(px, py, T, T);
        ctx.fillStyle = '#6d6d78'; ctx.fillRect(px + 2, py + 2, T - 4, T - 10);
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(px, py + T - 6, T, 6);
        break;
      case '^': ctx.fillStyle = '#7a6a55'; ctx.fillRect(px, py, T, T);
        ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(px + 4, py + 6 + h * 8); ctx.lineTo(px + T - 4, py + 2 + h * 12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px + 6, py + 20); ctx.lineTo(px + T - 6, py + 16 + h * 8); ctx.stroke();
        break;
      case 'T': {
        ctx.fillStyle = pal.alt; ctx.fillRect(px, py, T, T);
        ctx.fillStyle = '#5a4632'; ctx.fillRect(px + T / 2 - 3, py + T / 2, 6, T / 2);
        const g = h > 0.5 ? '#2e6b28' : '#27541f';
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2 - 4, 14 + h * 3, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.08)';
        ctx.beginPath(); ctx.arc(px + T / 2 - 4, py + T / 2 - 9, 5, 0, 7); ctx.fill();
        break;
      }
      case '~': {
        ctx.fillStyle = pal.water; ctx.fillRect(px, py, T, T);
        const ph = Math.sin(W.animT * 2 + tx * 1.3 + ty * 0.9);
        ctx.fillStyle = 'rgba(255,255,255,.10)';
        if (ph > 0.4) ctx.fillRect(px + 4 + ph * 6, py + 10 + h * 12, 12, 2);
        break;
      }
      case 'o': { // 気泡孔(深海の空気溜まり)
        ctx.fillStyle = pal.alt; ctx.fillRect(px, py, T, T);
        ctx.fillStyle = '#2c4560'; ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, 9, 0, 7); ctx.fill();
        for (let i = 0; i < 3; i++) {
          const bp = (W.animT * 0.7 + h + i * 0.33) % 1;
          ctx.fillStyle = `rgba(207,232,255,${0.7 - bp * 0.6})`;
          ctx.beginPath(); ctx.arc(px + T / 2 + Math.sin(bp * 9 + i) * 5, py + T / 2 - bp * 26, 2.5 + i, 0, 7); ctx.fill();
        }
        break;
      }
      case '_': ctx.fillStyle = '#0a0a12'; ctx.fillRect(px, py, T, T);
        ctx.fillStyle = 'rgba(255,255,255,.03)'; if (h > 0.9) ctx.fillRect(px + h * 28, py + h * 20, 2, 2);
        break;
      case 'l': {
        const f = 0.5 + 0.5 * Math.sin(W.animT * 3 + tx * 2.1 + ty * 1.7);
        ctx.fillStyle = `rgb(${200 + f * 55},${60 + f * 60},20)`; ctx.fillRect(px, py, T, T);
        ctx.fillStyle = 'rgba(255,240,120,.5)';
        if (h > 0.6) ctx.fillRect(px + h * 20, py + (1 - h) * 20, 4 + f * 3, 3);
        break;
      }
      case 'c': ctx.fillStyle = '#2f3844'; ctx.fillRect(px, py, T, T);
        ctx.fillStyle = `rgba(140,220,255,${0.75 + 0.2 * Math.sin(W.animT * 2 + h * 9)})`;
        ctx.beginPath();
        ctx.moveTo(px + T / 2, py + 3); ctx.lineTo(px + T - 5, py + T / 2 + 4);
        ctx.lineTo(px + T / 2, py + T - 2); ctx.lineTo(px + 5, py + T / 2 + 4);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(px + T / 2 - 1, py + 6, 2, 8);
        break;
      case 'w': ctx.fillStyle = '#6d5844'; ctx.fillRect(px, py, T, T);
        ctx.fillStyle = 'rgba(0,0,0,.18)';
        ctx.fillRect(px, py + 10, T, 2); ctx.fillRect(px, py + 22, T, 2);
        ctx.fillRect(px + (h > .5 ? 8 : 18), py, 2, 10);
        break;
      case 'b': ctx.fillStyle = '#8a6a45'; ctx.fillRect(px, py, T, T);
        ctx.fillStyle = 'rgba(0,0,0,.2)';
        for (let i = 1; i < 4; i++) ctx.fillRect(px, py + i * 8, T, 1.5);
        break;
      case '*': ctx.fillStyle = '#37414e'; ctx.fillRect(px, py, T, T);
        ctx.fillStyle = '#59677a';
        ctx.beginPath(); ctx.moveTo(px + 4, py + T - 4); ctx.lineTo(px + T / 2 + h * 6, py + 4 + h * 8);
        ctx.lineTo(px + T - 4, py + T - 4); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(94,234,212,.25)'; ctx.strokeRect(px + 8, py + T - 12, 8, 4);
        break;
      case 'g': {
        const f = 0.5 + 0.5 * Math.sin(W.animT * 2.5 + (tx + ty) * 0.8);
        ctx.fillStyle = '#252d3a'; ctx.fillRect(px, py, T, T);
        ctx.strokeStyle = `rgba(94,234,212,${0.25 + f * 0.4})`; ctx.lineWidth = 2;
        ctx.strokeRect(px + 5, py + 5, T - 10, T - 10);
        ctx.fillStyle = `rgba(94,234,212,${0.2 + f * 0.3})`; ctx.fillRect(px + T / 2 - 2, py + T / 2 - 2, 4, 4);
        break;
      }
      case 'D': {
        const open = W.zone.gateFlag && G.quests.flags[W.zone.gateFlag];
        ctx.fillStyle = open ? pal.base : '#20262e'; ctx.fillRect(px, py, T, T);
        if (!open) {
          ctx.fillStyle = '#4a5563'; ctx.fillRect(px + 2, py, T - 4, T);
          ctx.strokeStyle = '#94ecd8'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, 6, 0, 7); ctx.stroke();
          ctx.fillStyle = '#94ecd8'; ctx.fillRect(px + T / 2 - 1, py + T / 2, 2, 6);
        }
        break;
      }
      case 'M': {
        const open = G.time.isFullMoon() && G.time.isNight();
        ctx.fillStyle = open ? '#1a2340' : '#2a2f3a'; ctx.fillRect(px, py, T, T);
        ctx.strokeStyle = open ? `rgba(220,225,255,${0.6 + 0.4 * Math.sin(W.animT * 3)})` : 'rgba(160,160,180,.5)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, 10, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.arc(px + T / 2 + 3, py + T / 2 - 2, 7, 0, 7); ctx.stroke();
        break;
      }
      default: ctx.fillStyle = '#05060a'; ctx.fillRect(px, py, T, T);
    }
  };

  const draw = (ctx, cam, vw, vh) => {
    const pal = PAL[W.zone.biome] || PAL.grass;
    const x0 = Math.max(0, Math.floor(cam.x / T)), y0 = Math.max(0, Math.floor(cam.y / T));
    const x1 = Math.min(W.tw - 1, Math.ceil((cam.x + vw) / T)), y1 = Math.min(W.th - 1, Math.ceil((cam.y + vh) / T));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        drawTile(ctx, W.grid[ty][tx], tx * T - cam.x, ty * T - cam.y, tx, ty, pal);
      }
    }
    // y座標ソートで前後関係
    const drawables = W.entities.filter(e => !e.dead && e.draw);
    if (G.player && !G.player.dead) drawables.push(G.player);
    drawables.sort((a, b) => (a.y + (a.zOrder || 0)) - (b.y + (b.zOrder || 0)));
    for (const e of drawables) e.draw(ctx, cam);
  };

  return {
    get S() { return W; },
    get zone() { return W.zone; }, get zoneId() { return W.zoneId; },
    get entities() { return W.entities; },
    get pxW() { return W.tw * T; }, get pxH() { return W.th * T; },
    get animT() { return W.animT; },
    get bossActive() { return W.bossActive; }, set bossActive(e) { W.bossActive = e; },
    tile, isSolidFor, solidAtPx, moveEntity, tileUnder, load, add, spawnEnemy,
    enemies, near, notifyNoise, dropPickup, onEnemyDeath, update, draw, randOpenPos,
  };
})();
