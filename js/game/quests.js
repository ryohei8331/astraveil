'use strict';
// クエスト/フラグエンジン: 通常クエスト、隠しユニークシナリオEX、世界フラグ(全体不可逆変化)、呪印
G.quests = (() => {
  const S = { flags: {}, active: {}, completed: {} };

  // ---- 条件レジストリ(ゾーンのスポーン/出口/プロップから参照) ----
  const conds = {
    always: () => true,
    fullMoonNight: () => G.time.isFullMoon() && G.time.isNight(),
    night: () => G.time.isNight(),
    cursed: () => G.player.curse.level > 0,
    unarmed: () => !G.player.equipment.weapon,
    starsteel: () => !!S.flags.starsteel_open,
    lunaria: () => !!S.flags.lunaria_open,
    orochiDead: () => !!S.flags.orochi_dead,
    kagachiDead: () => !!S.flags.starsteel_open,
    exRabbitActive: () => !!S.active.epic_lunahare || !!S.completed.epic_lunahare,
    exRabbitStage2: () => S.active.epic_lunahare && S.active.epic_lunahare.stage >= 1,
  };

  // ---- クエストライフサイクル ----
  const start = id => {
    if (S.active[id] || S.completed[id]) return;
    const q = G.DATA.quests[id];
    if (!q) return;
    S.active[id] = { stage: 0 };
    G.audio.sfx('quest');
    if (q.ex) {
      G.ui.exBanner(`ユニークシナリオEX『${q.name}』が始まった`);
      G.ui.chat(`[SYSTEM] 未知のシナリオフラグがロードされました`);
    } else {
      G.ui.banner(`クエスト受注: ${q.name}`);
    }
  };
  const advance = id => {
    const a = S.active[id];
    if (!a) return;
    const q = G.DATA.quests[id];
    a.stage++;
    if (a.stage >= q.stages.length) return complete(id);
    G.audio.sfx('quest');
    G.ui.toast(`クエスト更新: ${q.stages[a.stage].text}`);
  };
  const complete = id => {
    const q = G.DATA.quests[id];
    delete S.active[id];
    S.completed[id] = true;
    G.audio.sfx('level');
    G.ui.banner(`クエスト達成: ${q.name}`);
    const r = q.rewards || {};
    if (r.stella) { G.player.stella += r.stella; G.ui.toast(`報酬: ${G.U.fmt(r.stella)} ステラ`); }
    if (r.exp) G.player.gainExp(r.exp);
    if (r.items) for (const [iid, qty] of r.items) G.Items.give(iid, qty);
    if (r.skill) G.Skills.learn(r.skill);
    if (r.flag) setWorldFlag(r.flag);
    if (G.Social) G.Social.addFame(q.ex ? 30 : 4, 'quest');
    fire('quest_complete', { id });
  };

  // ---- 世界フラグ: 全プレイヤー(=この世界)に不可逆の変化を同期する(仕様7章) ----
  const WORLD_FLAG_FX = {
    starsteel_open: () => {
      G.ui.worldChange('星鋼解放', [
        '廟守が斃れ、封印機構が停止しました。',
        '全ての開拓者に告ぐ——星鋼紀のテクノロジーが、いま永続的に開放されます。',
        '各地の星鋼の門が開き、商店に星鋼装備が並び始めた。',
      ]);
      G.ui.chat('[WORLD] 世界フラグ《星鋼解放》が立ちました。星鋼の門が開放されます');
      G.ui.chat('[WORLD] 掲示板に新しいパッチノートはありません——これは「あなたたちがやった」ことです');
    },
    lunaria_open: () => {
      G.ui.worldChange('月路開通', [
        '秘園の月門が、月兎の郷ルナリアへの道を認めました。',
        '隠し国への道は、条件を満たした者にだけ開かれ続けます。',
      ]);
      G.ui.chat('[WORLD] 誰かが隠し国への道を拓いたようです……');
    },
    orochi_dead: () => {
      G.ui.worldChange('大蛇討伐', [
        '跳ねる森の主、暴食のオロチが討たれました。',
        '第二拠点ブレンザールへの街道が安全になりました。',
      ]);
      G.ui.chat('[WORLD] エリアボス《暴食のオロチ》討伐!ブレンザール街道が開通');
    },
    fenreed_slain: () => {
      G.ui.worldChange('七凶星、一角崩落', [
        '七凶星の一角《宵闇のフェンリード》が討たれました。',
        'この世界のどこかで、何かが確実に変わりました。',
      ]);
      G.ui.chat('[WORLD] ※未確認情報: 七凶星の一体が討伐された模様。運営の告知はありません');
    },
    rabbit_slain: () => {
      G.ui.worldChange('月兎、殞つ', ['月の兎は静かに笑い、光の粒になって消えました。', '「また満月に会おうね」']);
    },
  };
  const FLAG_FAME = {
    orochi_dead: 15, starsteel_open: 40, fenreed_slain: 50, lunaria_open: 25,
    rabbit_slain: 30, dragon_pact: 60, abyss_open: 60, attunement: 60,
  };
  const setWorldFlag = id => {
    if (S.flags[id]) return;
    S.flags[id] = true;
    if (WORLD_FLAG_FX[id]) WORLD_FLAG_FX[id]();
    else if (G.quests && G.quests._expansionFlagFx && G.quests._expansionFlagFx[id]) G.quests._expansionFlagFx[id]();
    if (G.Social && FLAG_FAME[id]) G.Social.addFame(FLAG_FAME[id], id);
    if (G.Social && id === 'rabbit_slain') {
      G.Social.addInfamy(25); // 月の兎を殺した、という事実は消えない
      G.ui.chat('[WORLD] ※月兎の郷の空気が、少し冷たくなった気がする');
    }
    if (G.R3D) G.R3D.invalidate(); // 門の開閉などをメッシュに反映
  };

  // ---- 呪印(宵闇のフェンリード): 装備スロット封印。影を倒すと解除ではなく上位に上書き(仕様) ----
  const applyCurse = () => {
    const p = G.player;
    if (p.curse.level >= 3) return;
    p.curse.level++;
    const cands = ['armor', 'acc1', 'acc2', 'weapon'].filter(s => !p.curse.sealed.includes(s));
    if (cands.length) {
      const slot = cands[Math.floor(Math.random() * Math.min(cands.length, p.curse.level === 3 ? 4 : 3))];
      p.curse.sealed.push(slot);
      if (p.equipment[slot]) { // 装備強制解除
        p.inventory[p.equipment[slot]] = (p.inventory[p.equipment[slot]] || 0) + 1;
        p.equipment[slot] = null;
      }
    }
    G.audio.sfx('curse');
    G.fx.shake(8);
    const names = ['', '呪印', '上位呪印', '極位呪印'];
    G.ui.exBanner(`${names[p.curse.level]}が刻まれた——スロット【${p.curse.sealed.map(G.Items.slotName).join('・')}】封印`);
    G.ui.toast(`…だが妙だ。体が軽い(封印1つにつきAGI+15%)`);
    if (p.curse.level === 1) {
      G.ui.chat('[SYSTEM] 状態異常《呪印》は通常の手段では解除できません');
      start('curse_quest');
    }
  };

  // ---- イベントディスパッチ ----
  const fire = (ev, data = {}) => {
    // 各クエストのフックへ
    for (const id in S.active) {
      const q = G.DATA.quests[id];
      if (!q) continue;
      const st = q.stages[S.active[id].stage];
      if (st && st.on === ev && st.check(data, S.active[id])) advance(id);
    }
    // グローバルトリガー(EX発火チェック等)
    if (G.DATA.triggers) for (const tr of G.DATA.triggers) {
      if (tr.on === ev && (tr.repeat || !S.flags[tr.id]) && tr.check(data)) {
        if (!tr.repeat) S.flags[tr.id] = true;
        tr.run(data);
      }
    }
  };

  const save = () => ({ flags: S.flags, active: S.active, completed: S.completed });
  const load = d => { if (d) { S.flags = d.flags || {}; S.active = d.active || {}; S.completed = d.completed || {}; } };

  return {
    get flags() { return S.flags; }, get active() { return S.active; }, get completed() { return S.completed; },
    conds, start, advance, complete, setWorldFlag, applyCurse, fire, save, load,
  };
})();
