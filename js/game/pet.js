'use strict';
// モンスター仲間(テイム)システム
// 弱った敵(HP25%以下)に食料を差し出すと、確率で仲間になる。
// 仲間は連れ歩けて、近くの敵を自動で攻撃してくれる。上限3体、セーブに永続化。
G.Pet = (() => {
  const MAX = 3;
  const S = { list: [], active: [] }; // list: 手持ち、active: 現在連れているindex

  const foodIds = () => ['bread', 'meat_skewer', 'ration', 'moon_dango']
    .filter(id => G.Items.count(id) > 0);

  // 弱った敵の頭上に「食べさせられる」印を出すか(UI/enemyから参照)
  const canTame = e => e.kind === 'enemy' && !e.dead && !e.def.boss && !e.def.unique && e.hp / e.hpMax <= 0.25;

  const tryTame = (enemy, foodId) => {
    if (!canTame(enemy)) { G.ui.toast('もっと弱らせないと食べてくれない'); return false; }
    if (!G.Items.count(foodId)) return false;
    if (S.list.length >= 12) { G.ui.toast('もう新しい仲間は覚えきれない(12体上限)'); return false; }
    G.Items.remove(foodId, 1);
    G.audio.sfx('eat');
    G.fx.burst(enemy.x, enemy.y - 12, '#ffd75e', 12, 100);
    // 成功率: 基本30% + LUC*0.8% + 好物ボーナス
    const like = LIKES[enemy.defId] || [];
    const bonus = like.includes(foodId) ? 0.35 : 0;
    const rate = Math.min(0.92, 0.30 + G.player.stats.LUC * 0.008 + bonus);
    if (Math.random() > rate) {
      G.ui.toast(`${enemy.def.name} は食べ物を受け取ったが、まだ心を許さない…(成功率 ${Math.round(rate * 100)}%)`);
      enemy.hp = Math.min(enemy.hpMax, enemy.hp + Math.round(enemy.hpMax * 0.15)); // 少し回復して離脱
      enemy.aggro = false;
      G.game.defer(0.8, () => { if (!enemy.dead) { enemy.dead = true; G.fx.burst(enemy.x, enemy.y, '#9aa3b2', 8, 80); } });
      return false;
    }
    // 成功
    const nick = randomNick(enemy.def);
    const spec = {
      defId: enemy.defId, nick, level: 1, exp: 0,
      hp: enemy.hpMax, hpMax: enemy.hpMax,
      atk: enemy.def.atk || 8,
    };
    S.list.push(spec);
    if (S.active.length < MAX) S.active.push(S.list.length - 1);
    enemy.dead = true;
    G.fx.ring(enemy.x, enemy.y, '#ffd75e', 60, 0.7);
    G.audio.sfx('quest');
    G.ui.exBanner(`${enemy.def.name} 『${nick}』が仲間になった!`);
    G.quests.fire('tame', { id: enemy.defId });
    spawnActivePet(spec);
    return true;
  };

  const LIKES = {
    slime: ['bread'], goblin: ['meat_skewer'], goblin_chief: ['meat_skewer'],
    packhound: ['meat_skewer', 'ration'], ember_hound: ['meat_skewer'],
    forest_stalker: ['moon_dango'], bog_serpent: ['meat_skewer'],
    magma_slime: ['bread'], crystal_scorpion: ['ration'], rust_walker: ['ration'],
    night_wisp: ['moon_dango'], mudlurker: ['ration'],
  };

  const NICK_PARTS = {
    pre: ['ちび', '小さな', 'ふわり', 'ぽむ', 'ころ', 'ぷに', 'もふ', 'ちゅる', 'こま', 'るる', 'たま', 'ぽち', 'みけ', 'しろ', 'くろ', 'あお', 'もも'],
    post: ['丸', '太', '助', '子', '介', 'ちゃん', '坊', '姫'],
  };
  const randomNick = def => G.U.choice(NICK_PARTS.pre) + G.U.choice(NICK_PARTS.post);

  const spawnActivePet = spec => {
    const p = G.player;
    G.world.add(makePetEntity(spec, p.x + G.U.rnd(-30, 30), p.y + G.U.rnd(-30, 30)));
  };

  const summonAll = () => {
    const p = G.player;
    for (const idx of S.active) {
      const spec = S.list[idx];
      if (!spec) continue;
      const already = G.world.entities.find(e => e.kind === 'pet' && e.spec === spec);
      if (already) continue;
      G.world.add(makePetEntity(spec, p.x + G.U.rnd(-30, 30), p.y + G.U.rnd(-30, 30)));
    }
  };
  const dismissAll = () => {
    for (const e of G.world.entities) if (e.kind === 'pet') e.dead = true;
  };

  const makePetEntity = (spec, x, y) => {
    const def = G.DATA.enemies[spec.defId] || { name: '?', color: '#8a8a8a', shape: 'blob', r: 10 };
    return {
      kind: 'pet', spec, x, y, r: def.r || 10, hp: spec.hp, hpMax: spec.hpMax,
      atk: spec.atk, dead: false, t: 0, atkCd: 0, facing: 0, target: null, respawnT: 0,
      def, // 敵の描画コードに流用するため
      update(dt) {
        this.t += dt;
        this.atkCd -= dt;
        if (this.hp <= 0) { // 一時ダウン: 5秒で復活
          this.respawnT = (this.respawnT || 5) - dt;
          if (this.respawnT <= 0) {
            this.hp = Math.round(this.hpMax * 0.6); this.respawnT = 0;
            const p = G.player;
            this.x = p.x + G.U.rnd(-30, 30); this.y = p.y + G.U.rnd(-30, 30);
            G.fx.ring(this.x, this.y, '#ffd75e', 30, 0.4);
          }
          return;
        }
        const p = G.player;
        // 近い敵を探す
        const foes = G.world.enemies();
        this.target = null; let best = 240;
        for (const f of foes) {
          if (f.untargetable || f.dormant) continue;
          const d = G.U.dist(this.x, this.y, f.x, f.y);
          if (d < best) { best = d; this.target = f; }
        }
        if (this.target) {
          const t = this.target, d = G.U.dist(this.x, this.y, t.x, t.y);
          const a = G.U.angTo(this.x, this.y, t.x, t.y);
          this.facing = a;
          if (d > 28) {
            const spd = (this.def.speed || 70) * 1.15;
            G.world.moveEntity(this, Math.cos(a) * spd * dt, Math.sin(a) * spd * dt);
          } else if (this.atkCd <= 0) {
            this.atkCd = 0.9;
            const dmg = Math.round(this.atk * (0.9 + this.spec.level * 0.08));
            t.hp -= dmg;
            G.fx.float(t.x, t.y - 22, dmg, { color: '#ffd0a0', size: 12 });
            G.fx.burst(t.x, t.y - 6, '#ffd0a0', 5, 80);
            t.aggro = true; if (!t.target) t.target = this;
            if (t.hp <= 0 && !t.dead) { t.die(); this.spec.exp += 1; }
          }
        } else {
          const d = G.U.dist(this.x, this.y, p.x, p.y);
          if (d > 90) {
            const a = G.U.angTo(this.x, this.y, p.x, p.y);
            this.facing = a;
            G.world.moveEntity(this, Math.cos(a) * 130 * dt, Math.sin(a) * 130 * dt);
          }
        }
      },
      onHit(dmg) {
        this.hp -= dmg;
        if (this.hp <= 0) { this.hp = 0; this.respawnT = 5; G.fx.burst(this.x, this.y, '#8a5a5a', 12, 100); }
      },
      draw(ctx, cam) {
        if (this.hp <= 0) return; // ダウン中は非表示
        const px = this.x - cam.x, py = this.y - cam.y;
        ctx.save();
        // 味方マーカー(緑の首輪)
        ctx.fillStyle = 'rgba(0,0,0,.28)';
        ctx.beginPath(); ctx.ellipse(px, py + this.r * 0.7, this.r * 0.9, this.r * 0.35, 0, 0, 7); ctx.fill();
        // 敵の描画を流用(小さく)
        ctx.translate(px, py); ctx.scale(0.75, 0.75); ctx.translate(-px, -py);
        // 簡易ブロブ
        const col = this.def.color || '#8ac0e0';
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(px, py - 4, this.r, 0, 7); ctx.fill();
        ctx.fillStyle = this.def.eyeColor || '#333';
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(px + s * 3, py - 6, 1.6, 0, 7); ctx.fill(); }
        // 首輪
        ctx.strokeStyle = '#7ee0a3'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px, py + 2, this.r * 0.7, 0.4, Math.PI - 0.4); ctx.stroke();
        ctx.restore();
        // 名前+HP
        ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(this.spec.nick, px, py - this.r * 2 - 3);
        ctx.fillStyle = '#7ee0a3'; ctx.fillText(this.spec.nick, px, py - this.r * 2 - 4);
        const w = 22;
        ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(px - w / 2, py - this.r * 2 + 2, w, 2.5);
        ctx.fillStyle = '#7ee0a3'; ctx.fillRect(px - w / 2, py - this.r * 2 + 2, w * this.hp / this.hpMax, 2.5);
        ctx.textAlign = 'left';
      },
    };
  };

  const load = d => {
    if (!d) return;
    S.list = d.list || []; S.active = d.active || [];
  };
  const save = () => ({ list: S.list, active: S.active });
  const reset = () => { S.list = []; S.active = []; };

  return {
    tryTame, canTame, summonAll, dismissAll, foodIds, MAX,
    get list() { return S.list; }, get active() { return S.active; },
    save, load, reset,
    setActive(indices) { S.active = indices.slice(0, MAX); },
    removeAt(i) { S.list.splice(i, 1); S.active = S.active.filter(x => x !== i).map(x => x > i ? x - 1 : x); },
  };
})();
