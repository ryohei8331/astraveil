'use strict';
// スキル: 物理演算の一時書き換え(仕様書4章)。アクティブ+パッシブ
G.Skills = (() => {
  const D = G.DATA.skills;
  const def = (id, o) => { D[id] = { id, ...o }; };

  def('tengu', {
    name: '天狗跳び', icon: '🪶', type: 'active', cost: { stm: 15 }, cd: 4,
    desc: '大跳躍。空中は無敵で、水や奈落を飛び越える。跳躍系モーションに高倍率フレーム補正。',
    use(p) {
      const ax = G.input.axis();
      p.jumpDir = (ax.x || ax.y) ? Math.atan2(ax.y, ax.x) : p.facing;
      p.jumpT = 0.55; p.airborne = true;
      if (G.Growth) G.Growth.note('jumps');
      G.audio.sfx('dodge'); G.fx.burst(p.x, p.y + 6, '#cfe8ff', 6, 80);
      return true;
    },
  });
  def('oboro', {
    name: '三連閃・朧', icon: '🌀', type: 'active', cost: { stm: 22 }, cd: 12,
    desc: '6秒間、攻撃の物理判定を3倍(3ヒット)に増幅。クリティカル判定は初撃を流用する。',
    use(p) { p.addBuff('oboro', 6); G.fx.ring(p.x, p.y, '#8fd0ff', 40, 0.4); return true; },
  });
  def('tensen', {
    name: '点穿', icon: '🎯', type: 'passive',
    desc: '装備中常時発動: 同じ敵に連続して当てるたびダメージ+12%累積(最大8)。被弾か対象変更でリセット。',
  });
  def('inertia', {
    name: '慣性駆動', icon: '🛞', type: 'passive',
    desc: '装備中、回避が高速の慣性スライドに変化。滑走中に旋回できるが、急旋回すると転倒する。',
  });
  def('setsuna', {
    name: '刹那の瞳', icon: '👁', type: 'active', cost: { mp: 20, stm: 10 }, cd: 30,
    desc: '思考認識だけを極限まで加速。世界が0.35倍速になり、自分だけ0.8倍速で動ける。',
    use(p) {
      G.game.timeScale = 0.35;
      p.addBuff('setsuna', 2.5 + p.stats.TEC * 0.03);
      G.audio.sfx('warp'); G.fx.ring(p.x, p.y, '#a0dcff', 90, 0.7);
      return true;
    },
  });
  def('shirogane', {
    name: '銀の御手', icon: '🤍', type: 'active', cost: { stm: 10 }, cd: 15,
    desc: '8秒間、攻撃のダメージ参照ステータスをSTRからLUCに置き換える。結果は運次第。',
    use(p) { p.addBuff('shirogane', 8); G.fx.ring(p.x, p.y, '#e8e8ff', 36, 0.4); return true; },
  });
  def('kabegake', {
    name: '壁駆け', icon: '🧗', type: 'passive',
    desc: '装備中、崖(茶色の岩肌)を手を使わずに駆け登れる。登攀中はスタミナを消費。',
  });
  def('airrise', {
    name: '空蹴り', icon: '🦶', type: 'passive',
    desc: '装備中、落下時に空中を蹴って落下距離を2分割し、落下ダメージ計算を D=α(h1−h0)+α(h2−h0) に再定義する。',
  });
  def('bloodgear', {
    name: '血装駆動', icon: '🩸', type: 'active', cost: { hpPct: 15 }, cd: 25,
    desc: '現在HPの15%を燃やし、10秒間 STR+50%・AGI+30%。攻撃にも1.4倍補正。',
    use(p) {
      p.addBuff('bloodgear', 10);
      G.fx.burst(p.x, p.y - 8, '#ff4a4a', 16, 140); G.audio.sfx('roar');
      return true;
    },
  });
  def('utsushimi', {
    name: '写し身', icon: '👥', type: 'active', cost: { mp: 15 }, cd: 20,
    desc: '全ヘイトを継承する幻影をその場に残し、本体は3秒間ステルス化する。',
    use(p) {
      const decoy = {
        kind: 'decoy', x: p.x, y: p.y, r: 10, t: 0, dead: false, hp: 1,
        update(dt) { this.t += dt; if (this.t > 4) this.dead = true; },
        draw(ctx, cam) {
          const px = this.x - cam.x, py = this.y - cam.y;
          ctx.save(); ctx.globalAlpha = 0.55 + 0.2 * Math.sin(this.t * 6);
          ctx.fillStyle = '#3b6ea5'; ctx.beginPath(); ctx.arc(px, py - 4, 8, 0, 7); ctx.fill();
          ctx.fillStyle = '#f2cfa5'; ctx.beginPath(); ctx.arc(px, py - 14, 6.5, 0, 7); ctx.fill();
          ctx.strokeStyle = 'rgba(160,220,255,.6)'; ctx.beginPath(); ctx.arc(px, py - 8, 14, 0, 7); ctx.stroke();
          ctx.restore();
        },
      };
      G.world.add(decoy);
      // ヘイト譲渡: 現在プレイヤーを狙う敵をすべて幻影へ
      for (const e of G.world.enemies()) if (e.target === p) e.target = decoy;
      p.stealthT = 3;
      G.audio.sfx('warp'); G.fx.burst(p.x, p.y - 8, '#cfe8ff', 10, 90);
      return true;
    },
  });
  def('antigrav', {
    name: '反重力歩法', icon: '🌊', type: 'active', cost: { mp: 12 }, cd: 18,
    desc: '8秒間、接地面の法線方向へ重力を書き換える。水面を歩け、ノックバックを受けない。',
    use(p) { p.addBuff('antigrav', 8); G.fx.ring(p.x, p.y + 6, '#c9a0ff', 30, 0.5); return true; },
  });

  const use = (p, slot) => {
    const id = p.hotbar[slot];
    if (!id) return;
    const sk = D[id];
    if (!sk) return;
    if (sk.type === 'passive') { G.ui.toast(`${sk.name} はパッシブ(装備するだけで発動)`); return; }
    if (p.cooldowns[id] > 0) { G.fx.float(p.x, p.y - 34, 'クールダウン中', { color: '#9aa3b2', size: 11 }); return; }
    const c = sk.cost || {};
    if (c.stm && p.stm < c.stm) { G.fx.float(p.x, p.y - 34, 'STM不足', { color: '#9aa3b2', size: 11 }); return; }
    if (c.mp && p.mp < c.mp) { G.fx.float(p.x, p.y - 34, 'MP不足', { color: '#9aa3b2', size: 11 }); return; }
    if (c.hpPct && p.hp <= p.hpMax * c.hpPct / 100 + 1) { G.fx.float(p.x, p.y - 34, 'HPが足りない', { color: '#ff6b6b', size: 11 }); return; }
    if (sk.use(p)) {
      if (c.stm) { p.stm -= c.stm; p.stmDelay = 0.6; }
      if (c.mp) p.mp -= c.mp;
      if (c.hpPct) p.hp -= Math.round(p.hpMax * c.hpPct / 100);
      p.cooldowns[id] = sk.cd || 1;
      G.fx.float(p.x, p.y - 40, sk.name, { color: '#8fd0ff', size: 12 });
    }
  };

  const equippedPassive = id => G.player && G.player.hotbar.includes(id);

  const learn = id => {
    const p = G.player;
    if (p.skillsKnown.includes(id)) { G.ui.toast('習得済みのスキルだ'); return false; }
    if (p.skillsKnown.length >= p.maxSkills) {
      G.ui.toast(`これ以上覚えられない(上限${p.maxSkills}: TECを上げれば増える)`);
      return false;
    }
    p.skillsKnown.push(id);
    const empty = p.hotbar.indexOf(null);
    if (empty >= 0) p.hotbar[empty] = id;
    G.audio.sfx('quest');
    G.ui.banner(`スキル習得: ${D[id].name}`);
    return true;
  };

  return { defs: D, use, equippedPassive, learn };
})();
