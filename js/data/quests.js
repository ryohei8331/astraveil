'use strict';
// クエスト定義+グローバルトリガー(EX発火・呪印上書き)
(() => {
  const Q = G.DATA.quests;
  const def = (id, o) => { Q[id] = { id, ...o }; };

  def('q_first_steps', {
    name: '開拓者登録',
    stages: [{ text: '広場のギルド受付ミレイユに挨拶する', on: 'talk', check: d => d.id === 'mireille' }],
    rewards: { stella: 200, exp: 15, items: [['guild_pass', 1], ['bread', 2]] },
  });

  def('q_goblin_cull', {
    name: 'ゴブリン間引き依頼',
    stages: [
      {
        text: 'アルバ平原のゴブリンを5体討伐する', on: 'kill',
        check: (d, a) => {
          if (d.id !== 'goblin' && d.id !== 'goblin_chief') return false;
          a.n = (a.n || 0) + 1;
          if (a.n < 5) G.ui.toast(`ゴブリン討伐 ${a.n}/5`);
          return a.n >= 5;
        },
      },
      { text: 'ミレイユに報告する', on: 'talk', check: d => d.id === 'mireille' },
    ],
    rewards: { stella: 600, exp: 40, items: [['scroll_tensen', 1]] },
  });

  def('q_orochi', {
    name: '討伐依頼: 暴食のオロチ',
    stages: [
      { text: '跳ねる森の主・暴食のオロチを討伐する', on: 'kill', check: d => d.id === 'orochi' },
      { text: 'ロッツォに報告する', on: 'talk', check: d => d.id === 'rozzo' },
    ],
    rewards: { stella: 1500, exp: 150, items: [['iron_mail', 1]] },
  });

  def('q_ruins_probe', {
    name: '調査依頼: 星鋼の遺構と廟守',
    stages: [
      { text: '星鋼の遺構に踏み込む(水晶巣崖の南口)', on: 'enter', check: d => d.zone === 'ruins' },
      { text: '最深部の「廟守」を討つ', on: 'kill', check: d => d.id === 'kagachimaru' },
      { text: 'セオに世界の変化を報告する', on: 'talk', check: d => d.id === 'theo_scholar' },
    ],
    rewards: { stella: 5000, exp: 600, items: [['tome_volt', 1]] },
  });

  def('curse_quest', {
    name: '呪印の行方',
    stages: [
      {
        text: '黒狼の「呪印」について調べる(夜の跳ねる森に「影」が出るという…)', on: 'kill',
        check: d => d.id === 'shadow_fenreed',
      },
    ],
    rewards: { exp: 200 },
  });

  def('q_abyss', {
    name: '深き淵の御使い',
    stages: [
      {
        text: '共鳴水晶片を3つ集めてヤンに渡す(水晶巣崖)', on: 'talk',
        check: d => d.id === 'yan_fisher' && G.Items.count('crystal_shard') >= 3,
      },
      { text: '(水晶を海に沈める)', on: 'talk', check: d => d.id === 'yan_fisher' },
    ],
    rewards: { stella: 2000, exp: 250, flag: 'abyss_contract' },
  });

  // ---- ユニークシナリオEX『月兎抄(エピック・オブ・ルナハレ)』 ----
  // 発火条件(クエストマーカー一切なし):
  //  満月の夜 × 秘園(樹海の月門の先) × 完全な素手 × 遠環との対話成功
  def('epic_lunahare', {
    name: '月兎抄(エピック・オブ・ルナハレ)', ex: true,
    stages: [
      { text: '秘園のどこかに眠る星鋼紀の遺物「Ω機関」を掘り出す(土の盛り上がりを探せ)', on: 'dig', check: d => d.id === 'dig_omega' },
      { text: 'Ω機関を遠環に届ける', on: 'talk', check: d => d.id === 'towa' && G.Items.count('omega_core') > 0 },
    ],
    rewards: { stella: 6666, exp: 800, items: [['gessen', 1]], flag: 'lunaria_open' },
  });

  // ---- グローバルトリガー ----
  G.DATA.triggers = [
    {
      id: 'trig_ex_rabbit', on: 'talk',
      check: d => d.id === 'towa'
        && G.quests.conds.fullMoonNight() && G.quests.conds.unarmed()
        && !G.quests.active.epic_lunahare && !G.quests.completed.epic_lunahare,
      run: () => setTimeout(() => G.quests.start('epic_lunahare'), 400),
    },
    {
      id: 'trig_hisono', on: 'enter',
      check: d => d.zone === 'hisono',
      run: () => {
        G.ui.toast('空気が変わった。ここは「そういう場所」だ');
        G.ui.chat('[SYSTEM] 未踏エリアを発見: 開拓ボーナス +500ステラ');
        G.player.stella += 500;
        if (G.player.equipment.weapon) {
          setTimeout(() => G.ui.toast('花々の奥に、誰かの気配がする。……だが、姿は見えない'), 2500);
        }
      },
    },
    {
      id: 'trig_shadow_curse', on: 'kill', repeat: true,
      check: d => d.id === 'shadow_fenreed' && G.player.curse.level > 0,
      run: () => {
        // 仕様: 影を倒しても呪印は解除されず、上位呪印に「上書き」される
        setTimeout(() => {
          G.ui.toast('呪印が消える——かと思われた。だが');
          G.quests.applyCurse();
          G.ui.chat('[SYSTEM] 上位存在のマーキングが更新されました');
        }, 700);
      },
    },
    {
      id: 'trig_lunaria', on: 'enter',
      check: d => d.zone === 'lunaria',
      run: () => {
        G.ui.exBanner('隠し国——月兎の郷ルナリアに到達');
        G.ui.chat('[WORLD] ??? : 「月の門をくぐった客人に、祝福を」');
        G.player.gainExp(300);
      },
    },
    {
      id: 'trig_quinsia', on: 'enter',
      check: d => d.zone === 'quinsia',
      run: () => {
        G.ui.banner('港湾都市クインシア — 世界の果てはまだ先にある');
        G.ui.chat('[WORLD] 港湾都市クインシアへの街道が開通しました');
      },
    },
    {
      id: 'trig_first_curse_info', on: 'equip', repeat: false,
      check: () => G.player.curse.level > 0,
      run: () => { },
    },
  ];
})();
