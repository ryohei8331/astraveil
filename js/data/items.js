'use strict';
// アイテム定義
(() => {
  const I = G.DATA.items;
  const def = (id, o) => { I[id] = { id, ...o }; };

  // ---- 武器(wtype: sword/dual/fist/spear/bow) ----
  def('wooden_sword', { name: '木剣', icon: '🗡', type: 'weapon', wtype: 'sword', atk: 6, reach: 46, price: 120, desc: '開拓者に最初に支給される剣。振れば一応戦える' });
  def('iron_sword', { name: '鉄の剣', icon: '⚔️', type: 'weapon', wtype: 'sword', atk: 13, reach: 48, reqSTR: 8, price: 900, desc: '定番の一振り。素直な性能' });
  def('steel_sword', { name: '鋼の大剣', icon: '⚔️', type: 'weapon', wtype: 'sword', atk: 22, reach: 54, reqSTR: 15, price: 3600, desc: '重いがよく斬れる。STRが足りないと振り遅れる' });
  def('twin_fangs', { name: '双牙', icon: '🔪', type: 'weapon', wtype: 'dual', atk: 9, reach: 40, price: 1400, mods: { AGI: 3 }, desc: '二刀流の短剣。手数で押す軽業師の得物' });
  def('iron_spear', { name: '鉄槍', icon: '🔱', type: 'weapon', wtype: 'spear', atk: 15, reach: 64, reqSTR: 10, price: 1600, desc: '間合いの長さは正義' });
  def('battle_gauntlet', { name: '闘拳鍔', icon: '🥊', type: 'weapon', wtype: 'fist', atk: 10, reach: 38, price: 1100, mods: { STR: 2 }, desc: '拳闘用の篭手。素手術の延長で扱える' });
  def('starsteel_blade', { name: '星鋼の刃', icon: '💠', type: 'weapon', wtype: 'sword', atk: 36, reach: 52, reqSTR: 18, price: 18000, reqFlag: 'starsteel_open', mods: { TEC: 4 }, desc: '星鋼紀の合金を鍛え直した刀身。青白く発光する' });
  def('gessen', { name: '月剪(げっせん)', icon: '🌙', type: 'weapon', wtype: 'dual', atk: 30, reach: 44, price: 66666, mods: { LUC: 10, AGI: 5 }, desc: '月光を剪(き)る双刃。月兎の郷の秘宝。EXシナリオの証' });

  // ---- 防具 ----
  def('cloth_tunic', { name: '布の胴衣', icon: '👕', type: 'armor', defense: 3, price: 100, desc: '無いよりマシ、を体現した服' });
  def('leather_armor', { name: '革の鎧', icon: '🦺', type: 'armor', defense: 8, price: 850, desc: '軽くて丈夫。開拓者の定番' });
  def('iron_mail', { name: '鉄の鎖帷子', icon: '🛡', type: 'armor', defense: 14, price: 3200, mods: { VIT: 3 }, desc: '重量感のある守り。透過ダメージには耐久も大事' });
  def('starsteel_mail', { name: '星鋼の甲冑', icon: '💠', type: 'armor', defense: 24, price: 22000, reqFlag: 'starsteel_open', mods: { VIT: 6 }, desc: '星鋼紀の防護服の再現。衝撃を面で受け流す' });

  // ---- 装飾 ----
  def('luck_charm', { name: '幸運のお守り', icon: '🍀', type: 'acc', price: 1500, mods: { LUC: 5 }, desc: 'ドロップ率とクリ率がちょっと上がる…気がする' });
  def('agi_anklet', { name: '疾風の足環', icon: '💨', type: 'acc', price: 1500, mods: { AGI: 5 }, desc: '足が軽くなる' });
  def('tec_gloves', { name: '技巧の手袋', icon: '🧤', type: 'acc', price: 1500, mods: { TEC: 5 }, desc: '手先が器用になり、武器習熟とスキル上限が伸びる' });
  def('vit_ring', { name: '堅牢の指輪', icon: '💍', type: 'acc', price: 1500, mods: { VIT: 5 }, desc: '体幹が安定する。透過ダメージ対策の定番' });
  def('str_band', { name: '剛力の腕輪', icon: '💪', type: 'acc', price: 1500, mods: { STR: 5 }, desc: '重い武器が少し軽く感じる' });
  def('moon_pendant', { name: '月光のペンダント', icon: '🌙', type: 'acc', price: 8800, mods: { LUC: 8, AGI: 4 }, desc: '満月の夜に淡く光る。ルナリアの工芸品' });

  // ---- 食料(満腹度) ----
  def('bread', { name: '黒パン', icon: '🍞', type: 'food', hunger: 25, price: 40, desc: '固いが腹持ちは良い(満腹度+25)' });
  def('meat_skewer', { name: '串焼き肉', icon: '🍖', type: 'food', hunger: 40, hp: 25, price: 140, desc: '広場の屋台の味(満腹度+40 / HP+25)' });
  def('ration', { name: '開拓者の携行食', icon: '🥫', type: 'food', hunger: 65, price: 300, desc: '味は二の次、栄養は満点(満腹度+65)' });
  def('moon_dango', { name: '月見団子', icon: '🍡', type: 'food', hunger: 30, mp: 40, price: 500, desc: 'ルナリア銘菓。魔力の巡りが良くなる(満腹度+30 / MP+40)' });

  // ---- 薬 ----
  def('potion_s', { name: '小回復薬', icon: '🧪', type: 'potion', hp: 60, price: 120, desc: 'HPを60回復する' });
  def('potion_m', { name: '中回復薬', icon: '⚗️', type: 'potion', hp: 160, price: 520, desc: 'HPを160回復する' });
  def('mana_s', { name: '魔力水', icon: '🫙', type: 'potion', mp: 50, price: 200, desc: 'MPを50回復する' });
  def('antidote', { name: '解毒草の丸薬', icon: '💊', type: 'potion', cure: 'poison', hp: 10, price: 90, desc: '毒を治す' });

  // ---- スキル書 ----
  def('scroll_oboro', { name: 'スキル書『三連閃・朧』', icon: '📜', type: 'scroll', skillId: 'oboro', price: 2800, desc: '攻撃判定を3倍化する剣技の口伝' });
  def('scroll_tensen', { name: 'スキル書『点穿』', icon: '📜', type: 'scroll', skillId: 'tensen', price: 2200, desc: '同じ一点を穿ち続ける集中の法' });
  def('scroll_inertia', { name: 'スキル書『慣性駆動』', icon: '📜', type: 'scroll', skillId: 'inertia', price: 2600, desc: '回避を加速滑走に変える体術。転倒注意' });
  def('scroll_setsuna', { name: 'スキル書『刹那の瞳』', icon: '📜', type: 'scroll', skillId: 'setsuna', price: 8500, desc: '思考だけを加速させる禁術めいた知覚法' });
  def('scroll_shirogane', { name: 'スキル書『銀の御手』', icon: '📜', type: 'scroll', skillId: 'shirogane', price: 4400, desc: '膂力ではなく運命で殴る、変わり者の拳理' });
  def('scroll_kabegake', { name: 'スキル書『壁駆け』', icon: '📜', type: 'scroll', skillId: 'kabegake', price: 3000, desc: '手を使わず崖を駆ける登攀術' });
  def('scroll_airrise', { name: 'スキル書『空蹴り』', icon: '📜', type: 'scroll', skillId: 'airrise', price: 3600, desc: '空中の大気を足場にする軽業。落下計算を2分割する' });
  def('scroll_bloodgear', { name: 'スキル書『血装駆動』', icon: '📜', type: 'scroll', skillId: 'bloodgear', price: 5200, desc: '命を燃やして出力を得る危険な強化法' });
  def('scroll_utsushimi', { name: 'スキル書『写し身』', icon: '📜', type: 'scroll', skillId: 'utsushimi', price: 6000, desc: 'ヘイトごと幻影に置き去りにする忍びの秘伝' });
  def('scroll_antigrav', { name: 'スキル書『反重力歩法』', icon: '📜', type: 'scroll', skillId: 'antigrav', price: 7000, reqFlag: 'starsteel_open', desc: '重力ベクトルを書き換える星鋼紀の歩行制御理論' });

  // ---- 魔導書(属性解放) ----
  def('tome_aqua', { name: '水の魔導書', icon: '📘', type: 'tome', element: 'aqua', price: 3000, desc: '水属性を習得する' });
  def('tome_gale', { name: '風の魔導書', icon: '📗', type: 'tome', element: 'gale', price: 3000, desc: '風属性を習得する' });
  def('tome_terra', { name: '土の魔導書', icon: '📙', type: 'tome', element: 'terra', price: 3400, desc: '土属性を習得する' });
  def('tome_volt', { name: '雷の魔導書', icon: '📒', type: 'tome', element: 'volt', price: 5600, desc: '雷属性を習得する。指向性分岐(放射/落雷)対応' });

  // ---- 素材(売却・収集) ----
  def('goblin_fang', { name: 'ゴブリンの牙', icon: '🦷', type: 'material', price: 30, desc: '小さいが鋭い。買い取り対象' });
  def('slime_gel', { name: 'ぷるぷるゲル', icon: '🫧', type: 'material', price: 20, desc: '用途は無限、単価は安い' });
  def('hound_pelt', { name: '猟犬の毛皮', icon: '🐺', type: 'material', price: 80, desc: '群れで狩る犬の丈夫な毛皮' });
  def('mud_shell', { name: '泥甲殻', icon: '🪨', type: 'material', price: 120, desc: '泥潜りの背甲。乾くと非常に硬い' });
  def('snake_venom', { name: '大蛇の毒腺', icon: '🧫', type: 'material', price: 400, desc: '暴食のオロチの毒腺。薬にも毒にもなる' });
  def('crystal_shard', { name: '共鳴水晶片', icon: '🔮', type: 'material', price: 260, desc: '振動に共鳴して鳴く水晶。晶殻蠍の甲殻由来' });
  def('ghost_ash', { name: '亡霊の残灰', icon: '🫗', type: 'material', price: 500, desc: '骸の魔物が残す灰。ひんやりしている' });
  def('wolf_shadowfur', { name: '宵闇の毛皮', icon: '🌑', type: 'material', price: 6000, desc: '黒狼の毛皮。夜そのもののような手触り' });
  def('starsteel_scrap', { name: '星鋼の破片', icon: '⚙️', type: 'material', price: 800, desc: '星鋼紀の機械の残骸。まだ微かに動こうとする' });
  def('moon_grass', { name: '月光草', icon: '🌿', type: 'material', price: 180, desc: '満月の夜にだけ花開く薬草' });

  // ---- 重要アイテム ----
  def('shovel', { name: 'スコップ', icon: '⛏', type: 'key', price: 800, desc: '掘れそうな場所を掘れる。開拓者のロマン' });
  def('omega_core', { name: 'Ω機関', icon: '🧿', type: 'key', price: 0, desc: '星鋼紀の遺物。内部で何かが円環し続けている。月門に反応する…?' });
  def('guild_pass', { name: '開拓者許可証', icon: '🪪', type: 'key', price: 0, desc: 'ギルド公認の開拓者である証明' });
})();
