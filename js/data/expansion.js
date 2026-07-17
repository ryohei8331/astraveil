'use strict';
// 拡張: 七凶星の残り三体 —— 天冠のソルドレイク / 深潭のヨグリム / 詠奏のカンタービレ
// 新ゾーン3(天冠の峰・深潭・奏の間)、新AI4種、リズム戦闘、酸素システム連動
(() => {
  const E = G.DATA.enemies, Z = G.DATA.zones, I = G.DATA.items, N = G.DATA.npcs;
  const H = G.Enemy.helpers;
  const T = G.TILE;

  // ================= 追加アイテム =================
  const idef = (id, o) => { I[id] = { id, ...o }; };
  idef('dragon_scale', { name: '黄金竜の鱗', icon: '🥇', type: 'material', price: 5000, desc: '天冠のソルドレイクの鱗。触れるとほのかに温かい' });
  idef('dragon_crown_shard', { name: '天冠の欠片', icon: '👑', type: 'acc', price: 50000, mods: { STR: 8, VIT: 8 }, desc: '調停者の冠の一片。裁定に耐えた者の証' });
  idef('abyss_pearl', { name: '深潭の真珠', icon: '🫧', type: 'material', price: 3000, desc: '深海の圧力が生んだ黒真珠' });
  idef('abyss_eye', { name: '深淵の瞳', icon: '👁‍🗨', type: 'acc', price: 50000, mods: { TEC: 8, LUC: 8 }, desc: '深潭のヨグリムの複眼の一つ。まだこちらを見ている' });
  idef('score_fragment', { name: '楽譜の欠片', icon: '🎼', type: 'material', price: 2000, desc: '世界の調律に使われていた楽譜の断片。読むと眠くなる' });
  idef('metronome_heart', { name: '拍節の心臓', icon: '🫀', type: 'acc', price: 50000, mods: { AGI: 8, DEX: 8 }, desc: '詠奏のカンタービレの核。今も正確に脈打つ' });

  // ================= 追加AI =================
  // --- 天冠のソルドレイク: 地上戦⇄飛翔・急降下・黄金の吐息 ---
  G.Enemy.AIS.dragon = (e, dt) => {
    const p = G.player;
    if (!e.hostile) { // 調停者: 手を出さねば戦いは始まらない
      e.facing = G.U.angTo(e.x, e.y, p.x, p.y);
      return;
    }
    e.target = p;
    const ratio = e.hp / e.hpMax;
    if (ratio < 0.35) e.enrage = true;
    e.phaseT = (e.phaseT || 0) - dt;
    if (!e.phase) { e.phase = 'ground'; e.phaseT = 8; }
    if (e.phase === 'ground') {
      // 黄金の吐息(扇状火炎)
      e.breathCd = (e.breathCd || 2.5) - dt;
      if (e.breathCd <= 0) {
        e.breathCd = e.enrage ? 2.4 : 3.8;
        const a0 = G.U.angTo(e.x, e.y, p.x, p.y);
        for (let i = -3; i <= 3; i++) {
          G.Magic.spawnProj({
            side: 'enemy', x: e.x, y: e.y - 10, vx: Math.cos(a0 + i * 0.14) * 240, vy: Math.sin(a0 + i * 0.14) * 240,
            r: 7, dmg: e.atk * 0.7, color: '#ffd75e', life: 1.4, label: '黄金の吐息',
          });
        }
        G.audio.sfx('roar');
      }
      H.chaseAndLunge(e, dt, { lungeRange: 100, lungeSpd: 4, windup: 0.5, lungeMult: 1.6, recover: 0.6 });
      if (e.phaseT <= 0) { e.phase = 'fly'; e.phaseT = 2.2; e.untargetable = true; e.flying = true; G.ui.toast('黄金の翼が空を覆う!'); G.audio.sfx('howl'); }
    } else if (e.phase === 'fly') {
      // 上空滞空(攻撃不可・影だけが走る)
      e.x += (p.x - e.x) * 0.6 * dt; e.y += (p.y - e.y) * 0.6 * dt;
      if (e.phaseT <= 0) { e.phase = 'dive'; e.diveCount = e.enrage ? 4 : 3; e.phaseT = 0; }
    } else if (e.phase === 'dive') {
      if (e.phaseT <= 0) {
        if (e.diveCount <= 0) { e.phase = 'ground'; e.phaseT = 8; e.untargetable = false; e.flying = false; }
        else {
          e.diveCount--;
          e.phaseT = 1.1;
          const tx = p.x, ty = p.y;
          G.world.add({ // 急降下の予兆と着弾
            kind: 'fx', x: tx, y: ty, t: 0, dead: false, zOrder: 400,
            update(dtt) {
              this.t += dtt;
              if (this.t >= 0.75 && !this.hit) {
                this.hit = true;
                G.fx.shake(8); G.fx.burst(tx, ty, '#ffd75e', 22, 200); G.fx.ring(tx, ty, '#ffd75e', 80, 0.5);
                G.audio.sfx('thunder');
                if (G.U.dist(tx, ty, G.player.x, G.player.y) < 60) {
                  G.Combat.hitPlayer(e.atk * 1.4, { from: e.def.name, label: '天冠の急降下', aoe: true });
                }
                e.x = tx; e.y = ty; // 竜が舞い降りた位置
              }
              if (this.t > 1.0) this.dead = true;
            },
            draw(ctx, cam) {
              const px = tx - cam.x, py = ty - cam.y;
              ctx.strokeStyle = `rgba(255,215,94,${0.4 + this.t * 0.6})`; ctx.lineWidth = 3;
              ctx.beginPath(); ctx.arc(px, py, 62 * Math.max(0.1, 1 - this.t / 0.75), 0, 7); ctx.stroke();
            },
          });
        }
      }
    }
  };

  // --- 深潭のヨグリム: 触手を全滅させないと本体に届かない ---
  G.Enemy.AIS.kraken = (e, dt) => {
    const p = G.player;
    if (!e.awake) {
      if (G.U.dist(e.x, e.y, p.x, p.y) < 260) {
        e.awake = true; e.aggro = true; e.target = p;
        G.Enemy.bossStart(e);
        G.ui.toast('海が、うねった——深潭の主が目を覚ます');
        G.audio.sfx('roar');
        // 触手召喚
        e.tents = [];
        for (let i = 0; i < 4; i++) {
          const a = Math.PI * 2 * i / 4;
          const t2 = G.Enemy.create('yoglim_tentacle', e.x + Math.cos(a) * 110, e.y + Math.sin(a) * 110, {});
          if (t2) { t2.aggro = true; t2.target = p; t2.master = e; G.world.add(t2); e.tents.push(t2); }
        }
      }
      return;
    }
    const alive = (e.tents || []).filter(t2 => !t2.dead);
    e.untargetable = alive.length > 0;
    // 触手全滅→弱点露出→一度だけ再生
    if (!alive.length && !e.regened && e.hp < e.hpMax * 0.55) {
      e.regened = true;
      G.ui.toast('ヨグリムが身悶えし、新たな触手が生える!');
      for (let i = 0; i < 2; i++) {
        const a = Math.PI * i + 0.6;
        const t2 = G.Enemy.create('yoglim_tentacle', e.x + Math.cos(a) * 110, e.y + Math.sin(a) * 110, {});
        if (t2) { t2.aggro = true; t2.target = p; t2.master = e; G.world.add(t2); e.tents.push(t2); }
      }
    }
    // 渦潮(引き寄せ)
    e.pullCd = (e.pullCd || 5) - dt;
    if (e.pullCd <= 0) {
      e.pullCd = 7;
      G.ui.toast('渦が生まれた——引き込まれる!');
      G.fx.ring(e.x, e.y, '#5eb9ff', 200, 1.2);
      e.pulling = 2.2;
    }
    if (e.pulling > 0) {
      e.pulling -= dt;
      const d = G.U.dist(e.x, e.y, p.x, p.y);
      if (d > 40 && !p.hasBuff('antigrav')) { // 反重力歩法で渦に抗える
        const a = G.U.angTo(p.x, p.y, e.x, e.y);
        G.world.moveEntity(p, Math.cos(a) * 95 * dt, Math.sin(a) * 95 * dt);
      }
      if (d < 55) G.Combat.hitPlayer(e.atk * 0.5, { from: e.def.name, label: '渦潮' });
    }
    // 墨(視界を奪う)
    e.inkCd = (e.inkCd || 9) - dt;
    if (e.inkCd <= 0 && alive.length === 0) {
      e.inkCd = 12;
      G.world.S.inkT = 5;
      G.ui.toast('墨だ!視界が…');
    }
  };
  G.Enemy.AIS.tentacle = (e, dt) => {
    const p = G.player;
    e.target = p;
    e.facing = G.U.angTo(e.x, e.y, p.x, p.y);
    const d = G.U.dist(e.x, e.y, p.x, p.y);
    e.slamCd = (e.slamCd || G.U.rnd(1, 2)) - dt;
    if (e.slamCd <= 0) {
      e.slamCd = G.U.rnd(2.2, 3.4);
      if (d < 120) { // 薙ぎ払い
        const tx = p.x, ty = p.y;
        G.world.add({
          kind: 'fx', x: tx, y: ty, t: 0, dead: false,
          update(dtt) {
            this.t += dtt;
            if (this.t >= 0.55 && !this.hit) {
              this.hit = true;
              G.fx.shake(4); G.fx.burst(tx, ty, '#4a6a8a', 12, 130);
              if (G.U.dist(tx, ty, G.player.x, G.player.y) < 42) {
                G.Combat.hitPlayer(e.atk, { from: '深潭の触手', label: '触手の薙ぎ払い' });
              }
            }
            if (this.t > 0.8) this.dead = true;
          },
          draw(ctx, cam) {
            const px = tx - cam.x, py = ty - cam.y;
            ctx.strokeStyle = `rgba(94,185,255,${0.5 + this.t * 0.5})`; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.arc(px, py, 42 * Math.max(0.1, 1 - this.t / 0.55), 0, 7); ctx.stroke();
          },
        });
      } else { // 水弾
        const a = G.U.angTo(e.x, e.y, p.x, p.y);
        G.Magic.spawnProj({
          side: 'enemy', x: e.x, y: e.y - 8, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200,
          r: 6, dmg: e.atk * 0.7, color: '#5eb9ff', life: 1.8, label: '水弾',
        });
      }
    }
  };

  // --- 詠奏のカンタービレ: 全てが「拍」の上にある ---
  G.BeatInfo = { active: false, phase: 0, bpm: 100 };
  G.Enemy.AIS.maestro = (e, dt) => {
    const p = G.player;
    if (!e.aggro) {
      if (G.U.dist(e.x, e.y, p.x, p.y) < 220) {
        e.aggro = true; e.target = p;
        G.Enemy.bossStart(e);
        G.ui.toast('「——さあ、合奏の時間だ。拍を外すなよ、開拓者」');
        G.ui.chat('[SYSTEM] リズム戦闘: 拍に合わせた攻撃は威力1.5倍。敵の攻撃も拍の上に来る');
        e.beatT = 0; e.beatCount = 0;
      }
      return;
    }
    const spb = 60 / G.BeatInfo.bpm; // 1拍の秒数
    e.beatT = (e.beatT || 0) + dt;
    G.BeatInfo.active = true;
    G.BeatInfo.phase = (e.beatT % spb) / spb;
    if (e.beatT >= spb) {
      e.beatT -= spb;
      e.beatCount = (e.beatCount || 0) + 1;
      G.audio.sfx(e.beatCount % 4 === 0 ? 'crit' : 'step');
      // 4拍目に攻撃が着弾する(2拍前に予兆)
      if (e.beatCount % 4 === 2) {
        const n = e.hp / e.hpMax < 0.5 ? 3 : 2;
        e.marks = [];
        for (let i = 0; i < n; i++) {
          e.marks.push({ x: p.x + G.U.rnd(-50, 50), y: p.y + G.U.rnd(-50, 50) });
        }
        for (const mk of e.marks) {
          const { x: mx, y: my } = mk;
          G.world.add({
            kind: 'fx', x: mx, y: my, t: 0, dead: false, dur: spb * 2,
            update(dtt) {
              this.t += dtt;
              if (this.t >= this.dur && !this.hit) {
                this.hit = true;
                G.fx.burst(mx, my, '#c9a0ff', 14, 150); G.audio.sfx('thunder'); G.fx.shake(4);
                if (G.U.dist(mx, my, G.player.x, G.player.y) < 40) {
                  G.Combat.hitPlayer(e.atk, { from: e.def.name, label: '強拍' });
                }
              }
              if (this.t > this.dur + 0.2) this.dead = true;
            },
            draw(ctx, cam) {
              const px = mx - cam.x, py = my - cam.y;
              ctx.strokeStyle = `rgba(201,160,255,${0.4 + (this.t / this.dur) * 0.6})`;
              ctx.lineWidth = 2.5;
              ctx.beginPath(); ctx.arc(px, py, 40 * Math.max(0.08, 1 - this.t / this.dur), 0, 7); ctx.stroke();
              ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
              ctx.fillStyle = 'rgba(201,160,255,.9)'; ctx.fillText('♪', px, py + 4); ctx.textAlign = 'left';
            },
          });
        }
      }
    }
    // 移動は優雅に円を描く
    const a = G.U.angTo(e.x, e.y, p.x, p.y) + Math.PI / 2;
    H.seek(e, e.x + Math.cos(a) * 40, e.y + Math.sin(a) * 40, e.speed * 0.6, dt);
    if (G.U.dist(e.x, e.y, p.x, p.y) > 200) H.seek(e, p.x, p.y, e.speed, dt);
    e.facing = G.U.angTo(e.x, e.y, p.x, p.y);
  };

  // ================= 追加エネミー定義 =================
  const edef = (id, o) => { E[id] = { id, ...o }; };
  edef('sordrake', {
    name: '天冠のソルドレイク', title: '七凶星', ai: 'dragon', shape: 'dragon', color: '#c8a832', eyeColor: '#fff',
    hp: 2600, atk: 34, def: 22, speed: 95, r: 20, exp: 5000, stella: 66666, sight: 400,
    boss: true, unique: true, noKnockback: true, deathFlag: 'dragon_pact', resist: ['fire'],
    drops: [{ item: 'dragon_scale', p: 1, qty: 4 }, { item: 'dragon_crown_shard', p: 1 }],
  });
  edef('yoglim', {
    name: '深潭のヨグリム', title: '七凶星', ai: 'kraken', shape: 'blob', color: '#2c3e5c', eyeColor: '#5eb9ff',
    hp: 2200, atk: 30, def: 18, speed: 0, r: 24, exp: 5000, stella: 55555, sight: 400,
    boss: true, unique: true, noKnockback: true, deathFlag: 'abyss_open', resist: ['aqua'], weak: ['volt'],
    drops: [{ item: 'abyss_pearl', p: 1, qty: 3 }, { item: 'abyss_eye', p: 1 }],
  });
  edef('yoglim_tentacle', {
    name: '深潭の触手', ai: 'tentacle', shape: 'snake', color: '#37507a', eyeColor: '#5eb9ff',
    hp: 220, atk: 24, def: 10, speed: 0, r: 12, exp: 150, stella: 500, sight: 400, noKnockback: true,
    drops: [{ item: 'abyss_pearl', p: 0.3 }],
  });
  edef('cantabile', {
    name: '詠奏のカンタービレ', title: '七凶星', ai: 'maestro', shape: 'lich', color: '#6a4a8a', eyeColor: '#c9a0ff',
    hp: 1800, atk: 28, def: 14, speed: 90, r: 13, exp: 5000, stella: 44444, sight: 400,
    boss: true, unique: true, deathFlag: 'attunement',
    drops: [{ item: 'score_fragment', p: 1, qty: 3 }, { item: 'metronome_heart', p: 1 }],
  });
  edef('deep_lurker', {
    name: '深海の徘徊種', ai: 'mob', shape: 'blob', color: '#1e3d5c', eyeColor: '#5eb9ff',
    hp: 130, atk: 22, def: 12, speed: 75, r: 11, exp: 60, stella: 120, sight: 220,
    resist: ['aqua'], weak: ['volt'],
    drops: [{ item: 'abyss_pearl', p: 0.12 }],
  });
  edef('angler', {
    name: '提灯喰らい', ai: 'mob', shape: 'blob', color: '#0e2438', eyeColor: '#ffd75e',
    hp: 90, atk: 20, def: 8, speed: 60, r: 10, exp: 50, stella: 100, sight: 260,
    ranged: { cd: 2.0 }, projColor: '#ffd75e', nocturnal: true,
    drops: [{ item: 'abyss_pearl', p: 0.1 }],
  });
  edef('sky_wisp', {
    name: '天嶺の霊燈', ai: 'mob', shape: 'blob', color: '#c8d0f0', eyeColor: '#fff',
    hp: 140, atk: 24, def: 10, speed: 65, r: 9, exp: 70, stella: 140, sight: 240,
    ranged: { cd: 2.2 }, projColor: '#dce1ff',
    drops: [{ item: 'moon_grass', p: 0.4 }],
  });

  // ================= 追加ゾーン =================
  let seed = 7777;
  const srand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const mk = (w, h, c = '.') => Array.from({ length: h }, () => Array(w).fill(c));
  const put = (m, x, y, c) => { if (m[y] && m[y][x] !== undefined) m[y][x] = c; };
  const rect = (m, x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(m, i, j, c); };
  const frame = (m, c) => { rect(m, 0, 0, m[0].length, 1, c); rect(m, 0, m.length - 1, m[0].length, 1, c); rect(m, 0, 0, 1, m.length, c); rect(m, m[0].length - 1, 0, 1, m.length, c); };
  const scatter = (m, c, n, x, y, w, h) => {
    for (let k = 0; k < n; k++) {
      const px = x + Math.floor(srand() * w), py = y + Math.floor(srand() * h);
      if (m[py] && m[py][px] === '.') put(m, px, py, c);
    }
  };
  const S2 = m => m.map(r => r.join(''));

  // --- 天冠の峰 ---
  {
    const m = mk(30, 26, '.');
    frame(m, '#');
    rect(m, 0, 20, 30, 6, '_'); // 雲海(下は奈落)
    rect(m, 4, 18, 22, 3, '.');
    rect(m, 6, 14, 4, 5, '^'); rect(m, 20, 13, 4, 6, '^');
    scatter(m, '#', 16, 2, 2, 26, 16);
    scatter(m, 'F', 8, 2, 2, 26, 16);
    rect(m, 10, 2, 10, 8, ','); // 山頂の祭壇平原
    rect(m, 13, 4, 4, 3, 'g');
    rect(m, 13, 22, 4, 2, '.'); put(m, 14, 23, '='); put(m, 15, 23, '=');
    Z['tenkan_peak'] = {
      name: '天冠の峰', biome: 'moon', mood: 'mystic', fallHeight: 26,
      map: S2(m),
      spawns: [
        { enemy: 'sky_wisp', n: 3, area: [3, 10, 24, 8], respawn: 40 },
        { enemy: 'sordrake', n: 1, area: [13, 4, 4, 3], respawn: 999, boss: true, once: 'dragon_pact' },
      ],
      npcs: [{ id: 'hakuren_visitor', x: 12, y: 6 }],
      props: [
        { type: 'sign', x: 14, y: 10, text: ['ここは世界で最も空に近い場所。', '祭壇の金色の主に、武器を向けるかどうかは——あなたの選択だ。'] },
        { type: 'portal', x: 15, y: 23, to: 'lunaria', tx: 12, ty: 10, cond: 'always' },
      ],
      exits: [],
    };
  }

  // --- 深潭(海底) ---
  {
    const m = mk(34, 26, '.');
    frame(m, '#');
    scatter(m, 'c', 26, 2, 2, 30, 22);
    scatter(m, ',', 30, 2, 2, 30, 22);
    scatter(m, 'h', 14, 2, 2, 30, 22);
    put(m, 6, 6, 'o'); put(m, 26, 8, 'o'); put(m, 10, 20, 'o'); put(m, 24, 19, 'o'); // 気泡孔
    rect(m, 14, 10, 7, 6, ','); // 主の窪地
    rect(m, 16, 1, 3, 1, '.');
    Z['shintan'] = {
      name: '深潭', biome: 'abyss', mood: 'boss', underwater: true, dark: false,
      map: S2(m),
      spawns: [
        { enemy: 'deep_lurker', n: 4, area: [3, 3, 28, 20], respawn: 35 },
        { enemy: 'angler', n: 3, area: [3, 3, 28, 20], respawn: 40 },
        { enemy: 'yoglim', n: 1, area: [16, 12, 3, 3], respawn: 999, boss: true, once: 'abyss_open' },
      ],
      props: [
        { type: 'sign', x: 17, y: 3, text: ['気泡孔(白い泡)で息を継げる。酸素残量に常に注意。', '「深淵の御使い」は、契約者だけを深みへ招く。'] },
        { type: 'portal', x: 17, y: 2, to: 'quinsia', tx: 20, ty: 13, cond: 'always' },
      ],
      exits: [],
    };
  }

  // --- 奏の間(リズム戦闘アリーナ) ---
  {
    const m = mk(22, 20, '.');
    frame(m, 'c');
    rect(m, 2, 2, 18, 16, ',');
    rect(m, 6, 5, 10, 9, '.');
    rect(m, 10, 9, 2, 1, 'g');
    put(m, 10, 17, '='); put(m, 11, 17, '=');
    Z['kanade_arena'] = {
      name: '奏の間', biome: 'moon', mood: 'boss',
      map: S2(m),
      spawns: [
        { enemy: 'cantabile', n: 1, area: [10, 8, 2, 2], respawn: 999, boss: true, once: 'attunement' },
      ],
      props: [
        { type: 'portal', x: 10, y: 17, to: 'alba_field', tx: 19, ty: 13, cond: 'always' },
        { type: 'sign', x: 12, y: 17, text: '床に音叉の紋。世界そのものが楽器として設計されている——書見のロータスの走り書きが落ちていた。' },
      ],
      exits: [],
    };
  }

  // ================= NPC: 郷長の来訪(調停者の友) =================
  N['hakuren_visitor'] = {
    name: '郷長 ハクレン', nameColor: '#dce1ff', look: { body: '#d8d8e8', hair: '#f0f0ff' }, emblem: '🌙',
    visibleCond: 'notDragonPact',
    onTalk(npc, p) {
      G.dialog.open('郷長 ハクレン', [
        'おや、あなたも来たのか。……ふふ、そうだ。ここが「友」の住まいだよ。',
        '千年前、世界が壊れた日。私と彼だけが「覚えている側」として残った。',
        '彼は世界の調停者。手を出さなければ、何もしない。手を出せば——全力で応える。それだけの存在だ。',
        '挑むもよし、ただ隣に座って空を見るもよし。どちらもきっと、正しい。',
      ]);
    },
  };

  // ================= 入り口の配線 =================
  // ルナリア → 天冠の峰(星鋼解放+月路開通後)
  if (Z.lunaria) {
    Z.lunaria.props.push({
      type: 'portal', x: 12, y: 11, to: 'tenkan_peak', tx: 14, ty: 22,
      cond: 'dragonGate', msg: '月光の橋はまだ形を成さない(星鋼の封印が解かれた世界でのみ、橋は架かる)',
    });
  }
  // クインシアの桟橋 → 深潭(深き淵の御使いクリア+調停者の裁定後)
  if (Z.quinsia) {
    Z.quinsia.props.push({
      type: 'portal', x: 21, y: 16, to: 'shintan', tx: 17, ty: 3,
      cond: 'abyssGate', msg: '海中の共鳴水晶が沈黙している…(契約と、調停者の承認が要る気がする)',
    });
  }

  // ================= 条件・トリガー =================
  Object.assign(G.quests.conds, {
    dragonGate: () => !!G.quests.flags.starsteel_open && !!G.quests.flags.lunaria_open,
    abyssGate: () => !!G.quests.completed.q_abyss && !!G.quests.flags.dragon_pact,
    notDragonPact: () => !G.quests.flags.dragon_pact,
  });

  G.DATA.triggers.push(
    { // 旋律の夜: 三体の痕跡を持つ者にだけ、コンサートの招待が届く
      id: 'trig_melody', on: 'enter', repeat: true,
      check: d => {
        const f = G.quests.flags;
        const z = G.DATA.zones[d.zone];
        return f.fenreed_met && f.starsteel_open && f.dragon_pact && !f.attunement
          && z && !z.town && !z.underwater
          && G.time.isNight() && f.melody_day !== G.time.S.day;
      },
      run: d => {
        G.quests.flags.melody_day = G.time.S.day;
        setTimeout(() => {
          if (G.game.mode !== 'play') return;
          const p = G.player;
          G.ui.chat('[WORLD] どこかから、旋律が聞こえる…');
          G.ui.exBanner('夜のどこかで、誰かが「調律」を始めた');
          G.audio.sfx('howl');
          G.world.add({
            kind: 'prop', x: p.x + G.U.rnd(-120, 120), y: p.y + G.U.rnd(-120, 120), r: 14, t: 0, dead: false,
            update(dt2) { this.t += dt2; if (this.t > 90) this.dead = true; },
            interact() {
              G.audio.sfx('warp');
              G.game.changeZone('kanade_arena', 10, 15);
            },
            draw(ctx, cam) {
              const px = this.x - cam.x, py = this.y - cam.y;
              ctx.font = '22px sans-serif'; ctx.textAlign = 'center';
              ctx.globalAlpha = 0.7 + 0.3 * Math.sin(this.t * 4);
              ctx.fillStyle = '#c9a0ff';
              ctx.fillText('♪', px, py - 10 + Math.sin(this.t * 2) * 4);
              ctx.globalAlpha = 1; ctx.textAlign = 'left';
              ctx.fillStyle = 'rgba(201,160,255,.7)'; ctx.font = '9px sans-serif';
              ctx.fillText('旋律を追う', px - 20, py + 12);
            },
          });
        }, 2000);
      },
    },
    { // ソルドレイクに挑んだ瞬間の演出
      id: 'trig_dragon_fight', on: 'kill', repeat: false,
      check: d => d.id === 'sordrake',
      run: () => {
        G.ui.chat('[WORLD] 空の色が、一瞬だけ金色に染まった');
      },
    },
  );

  // 世界フラグ演出の追加(quests.jsのWORLD_FLAG_FXに直接追記できないため、setWorldFlagの前にFXを登録する仕組みが無い分はチャットで補完)
  const origSetFlag = G.quests.setWorldFlag;
  // dragon_pact / abyss_open / attunement のワールド演出
  G.quests._expansionFlagFx = {
    dragon_pact: () => G.ui.worldChange('調停者の裁定', [
      '黄金竜ソルドレイクが翼を畳み、頭を垂れました。',
      '「——見事。汝の開拓を、世界の意思として承認する」',
      '深海への航路の封が、いま解かれました。',
    ]),
    abyss_open: () => G.ui.worldChange('深淵開放', [
      '深潭のヨグリムが沈黙し、海が凪ぎました。',
      '深海の交易路が全開拓者に開放されます。',
      'クインシアの漁師たちが、千年ぶりに沖へ出ます。',
    ]),
    attunement: () => G.ui.worldChange('世界の調律', [
      '詠奏のカンタービレが最後の一音を置きました。',
      '「いい耳だった。この世界の楽譜は、次の楽章へ」',
      '……世界のどこかで、まだ見ぬ二体が耳を澄ましています。(七凶星: 5/7 確認)',
    ]),
  };
})();
