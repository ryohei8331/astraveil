'use strict';
// NPC定義: 会話・店・宿・EXキーパーソン
(() => {
  const N = G.DATA.npcs;
  const def = (id, o) => { N[id] = { id, ...o }; };
  const Q = () => G.quests;

  const inn = (name, price, look) => ({
    name, look,
    onTalk(npc, p) {
      const disc = G.Social ? G.Social.discount(npc.id) : 1;
      const cost = Math.round(price * disc);
      G.dialog.open(name, [
        `いらっしゃい。一晩 ${cost}ステラ${disc < 1 ? '(なじみ割引済み)' : ''}だよ。泊まっていくかい?`,
        '(泊まると朝まで時間が進み、HP・MP・スタミナ・満腹度が全回復する)',
      ], () => {
        if (p.stella < cost) { G.ui.toast('ステラが足りない…'); return; }
        p.stella -= cost;
        if (G.Social) G.Social.onInn(npc.id);
        G.time.advanceToMorning();
        p.hp = p.hpMax; p.mp = p.mpMax; p.stm = p.stmMax; p.hunger = 100; p.statusEf = {};
        G.audio.sfx('heal');
        G.ui.banner(`${G.time.S.day}日目の朝 — よく眠れた(月齢: ${G.time.moonName()})`);
        G.save.save('auto');
      });
    },
  });

  // ---- アルバ ----
  def('mireille', {
    name: 'ギルド受付 ミレイユ', look: { body: '#8a4a5c', hair: '#c8a060' }, emblem: '📋',
    questMark() {
      return (!Q().completed.q_first_steps) ||
        (Q().completed.q_first_steps && !Q().active.q_goblin_cull && !Q().completed.q_goblin_cull) ||
        (Q().active.q_goblin_cull && Q().active.q_goblin_cull.stage === 1);
    },
    onTalk(npc, p) {
      if (!Q().completed.q_first_steps) {
        G.dialog.open(npc.def.name, [
          `ようこそ、開拓者${p.name}さん!アルバ開拓ギルドへ。`,
          'この世界はまだ、地図の大半が空白です。あなたたち開拓者が歩いた分だけ、世界が広がる——そういう仕組みです。',
          'まずは東の平原で戦い方に慣れてください。それと満腹度の管理はお忘れなく。お腹が空くとスタミナが回復しなくなりますから。',
          'これは開拓者許可証。基本報酬も付けておきますね。',
        ]);
      } else if (!Q().active.q_goblin_cull && !Q().completed.q_goblin_cull) {
        G.dialog.open(npc.def.name, [
          '最初の依頼です。平原のゴブリンが増えすぎて、隊商が通れず困っています。',
          '5体ほど間引いてもらえますか?群れの警戒網に気をつけて。1体に見つかると周りも寄ってきます。',
        ], () => Q().start('q_goblin_cull'));
      } else if (Q().active.q_goblin_cull && Q().active.q_goblin_cull.stage === 0) {
        G.dialog.open(npc.def.name, [`ゴブリン退治の進み具合はどうですか?(討伐 ${Q().active.q_goblin_cull.n || 0}/5)`]);
      } else if (Q().active.q_goblin_cull && Q().active.q_goblin_cull.stage === 1) {
        G.dialog.open(npc.def.name, ['お見事です!これで隊商も一安心。報酬のスキル書、ぜひ使ってみてください。']);
      } else {
        const hints = [
          '南の沼野、地面が不自然に盛り上がっている場所があるとか。スコップ持参で行く人が増えてます。',
          '「3のつく日の夜に黒い狼を見た」という報告が続いてます。運営は「仕様です」としか…。',
          '跳ねる森の主を倒せば、第2拠点ブレンザールへの道が開けます。',
          '樹海の奥に白い門があるらしいです。誰も開け方を知りません。書見のロータスも匙を投げたとか。',
        ];
        G.dialog.open(npc.def.name, [G.U.choice(hints)]);
      }
    },
  });
  def('alba_shop', {
    name: '雑貨屋 バルド', look: { body: '#5c6a3a', hair: '#3a2c22' }, emblem: '🛒',
    onTalk(npc) { G.menus.openShop(npc.def); },
    shop: ['bread', 'meat_skewer', 'ration', 'potion_s', 'antidote', 'shovel', 'wooden_sword', 'leather_armor', 'scroll_tensen', 'tome_aqua'],
  });
  def('alba_inn', inn('宿屋の女将 モナ', 30, { body: '#7a5c3a', hair: '#6e5540' }));
  def('alba_elder', {
    name: '長老 グレン', look: { body: '#4a4a5a', hair: '#c8c8c8' },
    lines: [
      '千年前、星鋼紀の人々は空を渡り、海の底に都市を築いたそうじゃ。',
      'じゃがある日、すべてが止まった。理由を知る者は、もうこの世界の「中」にはおらん。',
      '……いや、七体だけおるという話じゃがな。ふぉっふぉ。',
    ],
  });

  // ---- ブレンザール ----
  def('rozzo', {
    name: 'ギルド受付 ロッツォ', look: { body: '#3a5c6a', hair: '#2c2c2c' }, emblem: '📋',
    questMark() {
      return (Q().flags.orochi_dead && !Q().active.q_ruins_probe && !Q().completed.q_ruins_probe && Q().completed.q_orochi) ||
        (!Q().active.q_orochi && !Q().completed.q_orochi) ||
        (Q().active.q_orochi && Q().active.q_orochi.stage === 1);
    },
    onTalk(npc, p) {
      if (!Q().active.q_orochi && !Q().completed.q_orochi) {
        if (Q().flags.orochi_dead) {
          G.dialog.open(npc.def.name, ['あんたが例の「大蛇殺し」か!討伐報告が要る。手続きさせてくれ。'], () => { Q().start('q_orochi'); Q().advance('q_orochi'); });
        } else {
          G.dialog.open(npc.def.name, [
            'よくぞオロチの森を抜けて…え?抜けてない?西の森の主・暴食のオロチの正式討伐依頼が出ている。',
            '奴は尾から毒沼を撒く。近づきすぎるな。討伐できれば街道が完全開通する。',
          ], () => Q().start('q_orochi'));
        }
      } else if (Q().active.q_orochi && Q().active.q_orochi.stage === 1) {
        G.dialog.open(npc.def.name, ['討伐確認!あんたは大したもんだ。報酬を受け取ってくれ。']);
      } else {
        const hints = [
          '東の水晶巣崖はな、「静かに歩く」が攻略法だ。理由は行けば分かる。',
          '崖の南に星鋼紀の遺構がある。亡霊の武者が出るって話だが…興味あるならテルツェの学者に聞け。',
          '呪印?ああ、黒狼のマーキングか。解く方法は知らん。「影を倒せば消える」って噂はあるが……真に受けるなよ?',
        ];
        G.dialog.open(npc.def.name, [G.U.choice(hints)]);
      }
    },
  });
  def('doma_smith', {
    name: '鍛冶屋 ドマ', look: { body: '#6a3a2c', hair: '#2c2c2c' }, emblem: '⚒️',
    onTalk(npc) { G.menus.openShop(npc.def); },
    shop: ['iron_sword', 'twin_fangs', 'iron_spear', 'battle_gauntlet', 'iron_mail', 'vit_ring', 'str_band', 'potion_m', 'scroll_oboro', 'scroll_kabegake', 'starsteel_blade', 'starsteel_mail'],
  });
  def('brenzal_inn', inn('宿屋の親父 ゴフ', 60, { body: '#5a4a3a', hair: '#4a3a2c' }));
  def('brenzal_mage', {
    name: '魔導士 リリカ', look: { body: '#5c3a8a', hair: '#e0d0f0' }, emblem: '🔮',
    onTalk(npc) { G.menus.openShop(npc.def); },
    shop: ['tome_aqua', 'tome_gale', 'tome_terra', 'mana_s', 'scroll_shirogane', 'tec_gloves', 'agi_anklet'],
  });

  // ---- テルツェ ----
  def('theo_scholar', {
    name: '書見のロータス セオ', look: { body: '#3a4a6a', hair: '#8a8a9a' }, emblem: '📖', nameColor: '#a8c8f0',
    questMark() { return !Q().active.q_ruins_probe && !Q().completed.q_ruins_probe; },
    onTalk(npc, p) {
      if (!Q().active.q_ruins_probe && !Q().completed.q_ruins_probe) {
        G.dialog.open(npc.def.name, [
          '私は設定考証クラン「書見のロータス」の者です。星鋼紀の謎を追っています。',
          '水晶巣崖の南、星鋼の遺構の最深部に「廟」がある。あれを守る亡霊武者——我々は「廟守」と呼んでいます。',
          '仮説があります。廟守は星鋼紀の防衛機構そのもの。つまり奴が斃れれば、この世界の星鋼技術の封印が「全開拓者に対して」解かれる。',
          '危険な依頼です。ですが、世界を一段階先へ進めたくはありませんか?',
        ], () => Q().start('q_ruins_probe'));
      } else if (Q().active.q_ruins_probe) {
        const st = Q().active.q_ruins_probe.stage;
        G.dialog.open(npc.def.name, [st === 0 ? '遺構は崖の南口から。暗いので光る床のラインを辿ってください。' : st === 1 ? '廟守は健在ですか…剣波は横に避け、機馬が出たら距離を取るように。' : '——やりましたね。世界が、変わりましたよ。この瞬間の記録を取らせてください!']);
      } else {
        G.dialog.open(npc.def.name, [G.U.choice([
          '星鋼解放後、各地の商店に星鋼装備が並び始めました。あなたのおかげです。',
          '樹海の白い門の紋様、あれは月齢を表しています。8日周期の…おっと、これ以上は自分で確かめる方が面白いでしょう。',
          '「素手でしか会えない存在」の伝承をご存知ですか?武器は敵意の象徴、という古い作法らしいのです。',
        ])]);
      }
    },
  });
  def('gante_shop', {
    name: '万屋 ガンテ', look: { body: '#6a5a2c', hair: '#3a2c22' }, emblem: '🛒',
    onTalk(npc) { G.menus.openShop(npc.def); },
    shop: ['ration', 'potion_m', 'mana_s', 'antidote', 'steel_sword', 'iron_mail', 'luck_charm', 'scroll_airrise', 'scroll_utsushimi', 'scroll_bloodgear', 'tome_volt', 'starsteel_blade', 'starsteel_mail', 'scroll_antigrav'],
  });
  def('terce_inn', inn('宿屋の若旦那 ピノ', 90, { body: '#4a5a6a', hair: '#5a4a3a' }));

  // ---- クインシア ----
  def('yan_fisher', {
    name: '漁師 ヤン', look: { body: '#2c4a5c', hair: '#1a1a1a' }, emblem: '🎣',
    questMark() { return !Q().active.q_abyss && !Q().completed.q_abyss; },
    onTalk(npc, p) {
      if (!Q().active.q_abyss && !Q().completed.q_abyss) {
        G.dialog.open(npc.def.name, [
          'この海の底にゃあ、「御使い」がいる。船を丸呑みにする巨大な影だ。',
          '俺は奴を調べてる。共鳴水晶ってのが深海の音を拾うんだ。水晶巣崖の欠片を3つ、持ってきちゃくれねえか。',
        ], () => Q().start('q_abyss'));
      } else if (Q().active.q_abyss && Q().active.q_abyss.stage === 0) {
        G.dialog.open(npc.def.name, [`共鳴水晶片は集まったか?(${G.Items.count('crystal_shard')}/3)`, '崖の蠍どもの甲殻が一番質がいい。……静かに、な。']);
      } else if (Q().active.q_abyss && Q().active.q_abyss.stage === 1) {
        G.dialog.open(npc.def.name, ['おお、上物だ!こいつを海に沈めれば、深淵の「声」が聞ける——']);
      } else {
        G.dialog.open(npc.def.name, [
          '水晶が海の底で鳴いてる。「契約は結ばれた」…そう聞こえるんだ。',
          'だが今はまだ、その時じゃねえらしい。深淵への扉は、この世界の「次の章」で開くのさ。(そんな気がする)',
        ]);
      }
    },
  });
  def('quinsia_shop', {
    name: '港の商人 マリカ', look: { body: '#8a5c3a', hair: '#6e3a2c' }, emblem: '🛒',
    onTalk(npc) { G.menus.openShop(npc.def); },
    shop: ['meat_skewer', 'ration', 'potion_m', 'mana_s', 'moon_dango', 'agi_anklet', 'luck_charm', 'scroll_setsuna'],
  });
  def('quinsia_inn', inn('船宿の主 ロロ', 120, { body: '#3a5a5a', hair: '#2c2c2c' }));

  // ---- EXキーパーソン: 遠環(とわ) ----
  def('towa', {
    name: '遠環', nameColor: '#dce1ff', look: { body: '#e8e8f0', hair: '#f0f0ff', skin: '#f8e8e8' },
    visibleCond: 'unarmed',
    onTalk(npc, p) {
      const q = Q();
      if (q.completed.epic_lunahare) {
        G.dialog.open('遠環', ['月の道は、もうあなたのもの。いつでも会いに来て。シラハも待ってるわ。']);
      } else if (q.active.epic_lunahare) {
        const st = q.active.epic_lunahare.stage;
        if (st === 0) {
          G.dialog.open('遠環', ['この庭のどこかに、星鋼紀の心臓——「Ω機関」が眠っている。', '土が少し、盛り上がっている場所。……見つけられる?']);
        } else if (G.Items.count('omega_core')) {
          G.dialog.open('遠環', [
            '——ああ、これ。千年ぶりに聴く鼓動。',
            'あなた、変わり者ね。満月の夜に、武器も持たず、こんな場所まで。',
            'いいわ。月の門を、あなたに開く。兎たちの国——ルナリアへ。',
            '(Ω機関が月門と共鳴し、光の道が生まれた)',
          ], () => { G.Items.remove('omega_core', 1); });
        } else {
          G.dialog.open('遠環', ['「Ω機関」を。話はそれからよ。']);
        }
      } else {
        // EXトリガー対話(満月の夜+素手のみ到達可能な会話)
        G.dialog.open('遠環', [
          '……あら。武器を持たない開拓者なんて、何年ぶりかしら。',
          '私は遠環。千年前から、この庭の月を見てる。',
          'ねえ。あなた、「偶然」ここへ来たの?それとも「賭け」に来たの?',
          '——どちらでもいいわ。素手のあなたには、資格がある。',
        ]);
      }
    },
  });

  // ---- ルナリア ----
  def('hakuren', {
    name: '郷長 ハクレン', nameColor: '#dce1ff', look: { body: '#d8d8e8', hair: '#f0f0ff' }, emblem: '🌙',
    onTalk(npc, p) {
      if (Q().flags.rabbit_slain) {
        G.dialog.open('郷長 ハクレン', [
          'シラハを送ってくれたこと、恨みはしない。あれはあの子が望んだ「果たし合い」だ。',
          '……近く、私は旧い友に会いに行く。黄金の鱗を持つ、空の調停者に。',
          'この世界は、あなたたち開拓者が思うより、ずっと「動いて」いるのだよ。',
        ]);
      } else {
        G.dialog.open('郷長 ハクレン', [
          'ようこそ、月の客人。ここは星鋼紀の崩壊を逃れた兎たちの郷。',
          '広場のシラハは腕自慢でな。……もし刃を向ければ、あの子は全力で応える。それは「そういう約束」なのだ。',
          '七凶星のことを聞きたい?ふむ。廟守、宵闇、そして我が友——天冠の竜。世界に七つ、時代の錨がある。',
          'すべてに出会えた開拓者は、まだいない。',
        ]);
      }
    },
  });
  def('lunaria_shop', {
    name: '月兎の商人 ツキヨ', nameColor: '#dce1ff', look: { body: '#c8c8e0', hair: '#e8e8f8' }, emblem: '🌙',
    onTalk(npc) { G.menus.openShop(npc.def); },
    shop: ['moon_dango', 'moon_pendant', 'scroll_shirogane', 'scroll_setsuna', 'mana_s', 'potion_m'],
  });
})();
