'use strict';
// 行動成長: 「やったこと」がそのままステータスになる(レベル配分と併存する自然成長)
G.Growth = (() => {
  // 追跡キー → 成長先ステータスと閾値(閾値到達ごとに+1)
  const TRACKS = {
    melee_hits:     { stat: 'STR', steps: [60, 250, 800, 2500, 6000], label: '斬り込み' },
    crits:          { stat: 'DEX', steps: [20, 80, 300, 900, 2400], label: '急所打ち' },
    dodges:         { stat: 'AGI', steps: [30, 120, 400, 1200, 3000], label: '回避' },
    perfect_dodges: { stat: 'AGI', steps: [10, 40, 150, 400], label: '見切り' },
    dmg_taken:      { stat: 'VIT', steps: [300, 1200, 4000, 12000, 30000], label: '打たれ強さ' },
    spells:         { stat: 'TEC', steps: [40, 160, 500, 1500, 4000], label: '魔力循環' },
    steps:          { stat: 'AGI', steps: [3000, 12000, 40000], label: '健脚' },
    night_steps:    { stat: 'LUC', steps: [2000, 8000, 20000], label: '夜歩き' },
    eats:           { stat: 'VIT', steps: [15, 60, 200], label: '健啖' },
    lucky_drops:    { stat: 'LUC', steps: [10, 40, 150, 400], label: '拾い運' },
    jumps:          { stat: 'AGI', steps: [50, 200, 700], label: '跳躍' },
    falls:          { stat: 'VIT', steps: [5, 20, 60], label: '受け身' },
    digs:           { stat: 'LUC', steps: [5, 20], label: '発掘癖' },
  };
  const CAP_PER_STAT = 25; // 行動成長による上限(1ステータスあたり)

  const ensure = p => {
    p.growth = p.growth || {};
    p.growthMi = p.growthMi || {};
    p.growthGained = p.growthGained || {};
  };

  const note = (key, n = 1) => {
    const p = G.player;
    if (!p || p.dead) return;
    ensure(p);
    p.growth[key] = (p.growth[key] || 0) + n;
    const tr = TRACKS[key];
    if (tr) {
      let mi = p.growthMi[key] || 0;
      while (mi < tr.steps.length && p.growth[key] >= tr.steps[mi]) {
        mi++;
        p.growthMi[key] = mi;
        if ((p.growthGained[tr.stat] || 0) < CAP_PER_STAT) {
          p.base[tr.stat]++;
          p.growthGained[tr.stat] = (p.growthGained[tr.stat] || 0) + 1;
          const st = G.DATA.socialText;
          const line = st && st.growthLines && st.growthLines[tr.stat]
            ? G.U.choice(st.growthLines[tr.stat])
            : `${tr.label}が体に染み付いてきた`;
          G.ui.toast(`${line}(行動成長: ${tr.stat}+1)`);
          G.fx.float(p.x, p.y - 52, `${tr.stat}+1`, { color: '#7ee0a3', size: 13 });
          G.audio.sfx('level');
        }
      }
    }
    // 固有スキル生成チェック
    if (G.SkillForge) G.SkillForge.check(key, p.growth[key]);
  };

  // 敵撃破時の状況付きカウント
  const onKill = e => {
    const p = G.player;
    if (!p) return;
    note('kills');
    note('kills_species_' + e.defId);
    if (p.hunger <= 15) note('hungry_kills');
    if (p.hp / p.hpMax <= 0.12) note('desperate_kills');
  };

  // 歩行距離の集積(毎フレーム呼ぶには重いのでバッファ)
  let stepAcc = 0;
  const noteMove = dist => {
    stepAcc += dist / G.TILE;
    if (stepAcc >= 10) {
      const n = Math.floor(stepAcc);
      stepAcc -= n;
      note('steps', n);
      if (G.time.isNight()) note('night_steps', n);
    }
  };

  return { note, onKill, noteMove, TRACKS };
})();
