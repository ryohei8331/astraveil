'use strict';
// 戦闘計算: 仕様書準拠のダメージ式
//  - クリ率: 5% + LUC*0.2% (+背面: 10% + DEX*0.4%)
//  - クリ倍率: 1.5 + DEX*1%
//  - 敵防御: dmg * 100/(100+def)
//  - プレイヤー被弾: 防具軽減 + VITが低いと「透過ダメージ」(防具を素通りする内部衝撃)
G.Combat = (() => {
  const playerAtk = () => {
    const p = G.player;
    const w = p.equipment.weapon ? G.DATA.items[p.equipment.weapon] : null;
    const base = w ? w.atk : 4; // 素手=4
    const wtype = w ? w.wtype : 'fist';
    const prof = p.proficiency[wtype] || 0;
    // 習熟 0→100 で 0.7倍→1.15倍(TECは習熟の伸びに効く: player側)
    const profMul = 0.7 + 0.45 * (prof / 100);
    return { base, wtype, profMul, weapon: w };
  };

  // プレイヤー → 敵
  const playerHit = (e, opt = {}) => {
    const p = G.player;
    if (e.dead || e.untargetable) return 0;
    const s = p.stats;
    const { base, wtype, profMul } = playerAtk();

    // 物理無効(執念の樹霊など)
    if (e.def.physImmune && !opt.magic) {
      G.fx.float(e.x, e.y - 24, '無効', { color: '#9aa3b2', size: 14 });
      G.fx.ring(e.x, e.y, '#9aa3b2', 26, 0.25);
      if (!e._physHint) { e._physHint = true; G.ui.toast('物理攻撃が通らない…魔法なら?'); }
      return 0;
    }

    let dmg;
    if (opt.useLUC || p.hasBuff('shirogane')) {
      // 銀の御手: 参照ステータスをLUCに置換。分散が非常に大きい
      dmg = base * (1 + s.LUC * 0.035) * G.U.rnd(0.3, 2.2);
    } else if (opt.magic) {
      dmg = opt.raw;
    } else {
      dmg = base * (1 + s.STR * 0.022) * profMul;
    }
    dmg *= (opt.mult || 1);

    // 点穿: 同一対象への連続ヒットで累積ボーナス
    if (!opt.magic && G.Skills.equippedPassive('tensen')) {
      if (p.tensen.target === e) p.tensen.stacks = Math.min(8, p.tensen.stacks + 1);
      else p.tensen = { target: e, stacks: 0 };
      dmg *= 1 + p.tensen.stacks * 0.12;
      if (p.tensen.stacks >= 3) G.fx.float(e.x, e.y - 36, `点穿×${p.tensen.stacks}`, { color: '#ffb86b', size: 11 });
    }
    // 血装駆動
    if (p.hasBuff('bloodgear') && !opt.magic) dmg *= 1.4;

    // クリティカル(朧の多段はopt.critLockで初撃の判定を流用)
    let crit = false;
    if (opt.critLock !== undefined) crit = opt.critLock;
    else {
      const behind = Math.abs(G.U.angDiff(e.facing || 0, G.U.angTo(e.x, e.y, p.x, p.y))) > Math.PI * 0.6;
      const cp = 0.05 + s.LUC * 0.002 + (behind ? 0.10 + s.DEX * 0.004 : 0);
      crit = G.U.chance(cp);
    }
    if (crit) dmg *= 1.5 + s.DEX * 0.01;

    // 敵防御・耐性
    dmg *= 100 / (100 + (e.def.def || 0));
    if (e.vulnerable) dmg *= e.vulnerable;      // 統率崩壊(頭数狩り)の動揺
    if (e.guarded) dmg *= 0.5;                  // 分身が生きている間の骸のバリア
    if (opt.element) {
      if ((e.def.weak || []).includes(opt.element)) { dmg *= 1.6; G.fx.float(e.x, e.y - 38, '弱点!', { color: '#ffd75e', size: 12 }); }
      if ((e.def.resist || []).includes(opt.element)) dmg *= 0.5;
    }
    dmg = Math.max(1, Math.round(dmg * G.U.rnd(0.92, 1.08)));

    e.hp -= dmg;
    e.aggro = true; e.target = p;
    if (e.onHit) e.onHit(opt);
    G.fx.float(e.x, e.y - 26, dmg, {
      color: crit ? '#ffd75e' : (opt.magic ? '#8fd0ff' : '#fff'),
      size: crit ? 21 : 15,
    });
    G.fx.burst(e.x, e.y - 8, crit ? '#ffd75e' : '#ff6b6b', crit ? 12 : 6, 110);
    G.audio.sfx(crit ? 'crit' : 'hit');
    if (crit) { G.fx.hitstop(0.07); G.fx.shake(3); }
    // ノックバック
    if (!e.def.noKnockback && !opt.magic) {
      const a = G.U.angTo(p.x, p.y, e.x, e.y);
      e.kbx = Math.cos(a) * 140; e.kby = Math.sin(a) * 140;
    }
    // 攻撃音 → 晶殻蠍などの振動感知
    G.world.notifyNoise(e.x, e.y, 150);
    if (e.hp <= 0 && !e.dead) e.die();
    return dmg;
  };

  // 敵 → プレイヤー
  const hitPlayer = (raw, opt = {}) => {
    const p = G.player;
    if (p.dead || G.game.mode !== 'play') return;
    // 地形ダメージ(pure)は回避無敵・ステルスを貫通する
    if ((p.invulnT > 0 || p.stealthT > 0) && !opt.pure) return;
    if (p.airborne && !opt.aoe && !opt.pure) { // 天狗跳び中は無敵(仕様)
      G.fx.float(p.x, p.y - 30, '回避', { color: '#7ee0a3', size: 12 });
      return;
    }
    const s = p.stats;
    const armor = p.armorTotal();
    let dmg = raw * (100 / (100 + armor * 3));
    // 透過ダメージ: VITが低いと防具が無事でも衝撃が内部へ届く
    const pen = raw * Math.max(0, 0.22 - s.VIT * 0.003);
    let penetrated = false;
    if (pen > dmg) { dmg = pen; penetrated = true; }
    if (opt.pure) dmg = raw; // 地形ダメージ等は軽減不可
    dmg = Math.max(1, Math.round(dmg * G.U.rnd(0.9, 1.1)));

    p.hp -= dmg;
    p.tensen = { target: null, stacks: 0 }; // 被弾で点穿リセット
    p.invulnT = Math.max(p.invulnT, 0.5);
    p.hurtT = 0.25;
    G.fx.float(p.x, p.y - 30, dmg, { color: penetrated ? '#c9a0ff' : '#ff6b6b', size: 17 });
    if (penetrated) G.fx.float(p.x, p.y - 46, '透過!', { color: '#c9a0ff', size: 11 });
    G.fx.burst(p.x, p.y - 8, '#ff6b6b', 8, 120);
    G.fx.shake(5); G.audio.sfx('hurt');
    if (opt.status) p.applyStatus(opt.status);
    if (p.hp <= 0) { p.hp = 0; G.game.onPlayerDeath(opt.label || opt.from || '???'); }
    else if (p.hp / p.hpMax < 0.2) G.ui.sosHint();
  };

  return { playerHit, hitPlayer, playerAtk };
})();
