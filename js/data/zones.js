'use strict';
// ゾーン定義: 決定論的ビルダーでマップ生成(セーブ互換のため乱数はシード固定)
(() => {
  const Z = G.DATA.zones;

  // ---- マップビルダー ----
  let seed = 1;
  const srand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const mk = (w, h, c = '.') => Array.from({ length: h }, () => Array(w).fill(c));
  const put = (m, x, y, c) => { if (y >= 0 && y < m.length && x >= 0 && x < m[0].length) m[y][x] = c; };
  const rect = (m, x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(m, i, j, c); };
  const frame = (m, c) => { rect(m, 0, 0, m[0].length, 1, c); rect(m, 0, m.length - 1, m[0].length, 1, c); rect(m, 0, 0, 1, m.length, c); rect(m, m[0].length - 1, 0, 1, m.length, c); };
  const hline = (m, x0, x1, y, c) => { for (let i = x0; i <= x1; i++) put(m, i, y, c); };
  const vline = (m, x, y0, y1, c) => { for (let j = y0; j <= y1; j++) put(m, x, j, c); };
  const scatter = (m, c, n, x, y, w, h, avoid = '=') => {
    for (let k = 0; k < n; k++) {
      const px = x + Math.floor(srand() * w), py = y + Math.floor(srand() * h);
      if (m[py] && m[py][px] === '.' ) put(m, px, py, c);
    }
  };
  const S = m => m.map(r => r.join(''));

  // ================= アルバの街(第1拠点) =================
  seed = 101;
  {
    const m = mk(24, 16, '.');
    frame(m, 'T');
    hline(m, 1, 22, 8, '='); vline(m, 12, 1, 14, '=');
    rect(m, 3, 3, 5, 3, 'w');   // ギルド会館
    rect(m, 16, 3, 5, 3, 'w');  // 雑貨屋
    rect(m, 3, 11, 5, 3, 'w');  // 宿屋
    rect(m, 16, 11, 4, 3, '~'); // 泉
    scatter(m, 'F', 10, 1, 1, 22, 14);
    hline(m, 21, 23, 8, '='); put(m, 23, 7, '='); put(m, 23, 9, '=');
    // 東口を開ける
    put(m, 23, 8, '=');
    Z['alba_town'] = {
      name: '第1拠点 アルバの街', biome: 'town', mood: 'town', town: true, fakePlayers: 7,
      map: S(m),
      npcs: [
        { id: 'mireille', x: 5, y: 7 },
        { id: 'alba_shop', x: 18, y: 7 },
        { id: 'alba_inn', x: 5, y: 10 },
        { id: 'alba_elder', x: 10, y: 3 },
      ],
      props: [
        { type: 'board', x: 14, y: 7 },
        { type: 'sign', x: 21, y: 9, text: '東: アルバ平原 — 初心者はまずぷるぷる狩りから' },
      ],
      exits: [{ x: 23, y: 7, w: 1, h: 3, to: 'alba_field', tx: 1, ty: 13 }],
    };
  }

  // ================= アルバ平原 =================
  seed = 202;
  {
    const m = mk(38, 26, '.');
    frame(m, 'T');
    hline(m, 1, 36, 13, '='); vline(m, 19, 13, 24, '=');
    rect(m, 8, 4, 6, 4, '~');
    rect(m, 26, 5, 5, 3, 'h'); rect(m, 5, 18, 6, 4, 'h'); rect(m, 30, 18, 5, 4, 'h');
    scatter(m, 'T', 14, 2, 2, 34, 22);
    scatter(m, 'F', 12, 2, 2, 34, 22);
    scatter(m, ',', 30, 2, 2, 34, 22);
    // 出入口
    vline(m, 0, 12, 14, '='); vline(m, 37, 12, 14, '='); hline(m, 18, 20, 25, '=');
    Z['alba_field'] = {
      name: 'アルバ平原', biome: 'grass', mood: 'field',
      map: S(m),
      spawns: [
        { enemy: 'slime', n: 4, area: [3, 3, 30, 18], respawn: 12 },
        { enemy: 'goblin', n: 5, area: [14, 4, 20, 18], respawn: 18 },
        { enemy: 'goblin_chief', n: 1, area: [28, 16, 6, 6], respawn: 90 },
        { enemy: 'night_wisp', n: 3, area: [4, 4, 30, 18], respawn: 30, night: true },
        { enemy: 'fenreed', n: 1, area: [10, 6, 20, 12], respawn: 999, night: true, boss: true, cond: 'nightRare', once: 'fenreed_slain' },
      ],
      props: [
        { type: 'sign', x: 3, y: 12, text: ['西: アルバの街 / 東: 跳ねる森(中級者向け) / 南: 泥濘の沼野', '掲示: 「3」のつく日の夜、平原に黒いナニカが出るという苦情が寄せられていますが、運営は関知していません。'] },
        { type: 'chest', x: 33, y: 4, flagId: 'chest_af1', items: [['luck_charm', 1], ['bread', 2]] },
      ],
      exits: [
        { x: 0, y: 12, w: 1, h: 3, to: 'alba_town', tx: 22, ty: 8 },
        { x: 37, y: 12, w: 1, h: 3, to: 'hane_forest', tx: 1, ty: 13 },
        { x: 18, y: 25, w: 3, h: 1, to: 'numano', tx: 17, ty: 1 },
      ],
    };
  }

  // ================= 跳ねる森(エリアボス: 暴食のオロチ) =================
  seed = 303;
  {
    const m = mk(38, 26, '.');
    frame(m, 'T'); rect(m, 1, 1, 36, 1, 'T'); rect(m, 1, 24, 36, 1, 'T');
    hline(m, 1, 36, 13, '=');
    scatter(m, 'T', 60, 2, 2, 34, 22);
    scatter(m, 'h', 20, 2, 2, 34, 22);
    scatter(m, ',', 30, 2, 2, 34, 22);
    rect(m, 24, 8, 10, 9, '.'); rect(m, 26, 10, 6, 5, ','); // ボスの空き地
    hline(m, 24, 36, 13, '=');
    vline(m, 0, 12, 14, '='); vline(m, 37, 12, 14, '=');
    Z['hane_forest'] = {
      name: '跳ねる森', biome: 'forest', mood: 'dungeon',
      map: S(m),
      spawns: [
        { enemy: 'packhound', n: 3, area: [4, 3, 18, 20], respawn: 25, scale: true },
        { enemy: 'grudge_trent', n: 2, area: [4, 15, 28, 8], respawn: 45 },
        { enemy: 'orochi', n: 1, area: [27, 10, 4, 4], respawn: 999, boss: true, once: 'orochi_dead' },
        { enemy: 'shadow_fenreed', n: 1, area: [8, 4, 20, 16], respawn: 300, night: true, cond: 'cursed' },
      ],
      props: [
        { type: 'sign', x: 3, y: 12, text: '警告: この先、巨大な蛇の目撃情報多数。単独行動は非推奨(ギルド)' },
        { type: 'chest', x: 4, y: 3, flagId: 'chest_hf1', items: [['potion_m', 1], ['str_band', 1]] },
      ],
      exits: [
        { x: 0, y: 12, w: 1, h: 3, to: 'alba_field', tx: 36, ty: 13 },
        { x: 37, y: 12, w: 1, h: 3, to: 'brenzal_town', tx: 1, ty: 8, cond: 'orochiDead', msg: '森の主の巨大な気配が道を塞いでいる——主を討たねば通れない' },
      ],
    };
  }

  // ================= 泥濘の沼野 =================
  seed = 404;
  {
    const m = mk(34, 24, '.');
    frame(m, 'T');
    rect(m, 4, 4, 8, 5, '~'); rect(m, 16, 8, 10, 6, '~'); rect(m, 6, 15, 9, 5, '~'); rect(m, 24, 17, 7, 4, '~');
    hline(m, 16, 25, 11, 'b'); vline(m, 9, 15, 19, 'b');
    scatter(m, 'h', 46, 2, 2, 30, 20);
    scatter(m, ',', 40, 2, 2, 30, 20);
    scatter(m, 'T', 10, 2, 2, 30, 20);
    vline(m, 17, 1, 4, '='); hline(m, 16, 18, 1, '=');
    Z['numano'] = {
      name: '泥濘の沼野', biome: 'swamp', mood: 'dungeon',
      map: S(m),
      spawns: [
        { enemy: 'mudlurker', n: 3, area: [3, 3, 28, 18], respawn: 35 },
        { enemy: 'bog_serpent', n: 4, area: [3, 3, 28, 18], respawn: 22 },
      ],
      props: [
        { type: 'sign', x: 15, y: 2, text: '足元注意。ここの泥は「生きて」いる。妙な盛り上がりを見つけたら…掘るのも一興(誰かの落書き)' },
        { type: 'dig', x: 7, y: 13, flagId: 'dig_nm1', item: 'ration' },
        { type: 'dig', x: 26, y: 6, flagId: 'dig_nm2', item: 'scroll_airrise' },
        { type: 'chest', x: 30, y: 21, flagId: 'chest_nm1', items: [['shovel', 1], ['antidote', 2]] },
      ],
      exits: [{ x: 16, y: 0, w: 3, h: 1, to: 'alba_field', tx: 19, ty: 24 }],
    };
  }

  // ================= 第2拠点 ブレンザール =================
  seed = 505;
  {
    const m = mk(24, 16, '.');
    frame(m, '#');
    hline(m, 1, 22, 8, '='); vline(m, 12, 1, 14, '=');
    rect(m, 3, 3, 5, 3, 'w'); rect(m, 16, 3, 5, 3, 'w'); rect(m, 3, 11, 5, 3, 'w');
    rect(m, 17, 11, 4, 3, 'w');
    scatter(m, 'F', 6, 1, 1, 22, 14);
    put(m, 0, 8, '='); put(m, 23, 8, '=');
    vline(m, 12, 0, 1, '=');
    Z['brenzal_town'] = {
      name: '第2拠点 ブレンザール', biome: 'town', mood: 'town', town: true, fakePlayers: 8,
      map: S(m),
      npcs: [
        { id: 'rozzo', x: 5, y: 7 },
        { id: 'doma_smith', x: 18, y: 7 },
        { id: 'brenzal_inn', x: 5, y: 10 },
        { id: 'brenzal_mage', x: 18, y: 10 },
      ],
      props: [
        { type: 'board', x: 14, y: 7 },
        { type: 'sign', x: 10, y: 2, text: '北: 千枝の樹海(迷いの森) / 東: 水晶巣崖 / 西: 跳ねる森' },
      ],
      exits: [
        { x: 0, y: 7, w: 1, h: 3, to: 'hane_forest', tx: 36, ty: 13 },
        { x: 23, y: 7, w: 1, h: 3, to: 'crystal_cliff', tx: 1, ty: 13 },
        { x: 11, y: 0, w: 3, h: 1, to: 'jukai', tx: 17, ty: 26 },
      ],
    };
  }

  // ================= 千枝の樹海(最奥に月門) =================
  seed = 606;
  {
    const m = mk(36, 28, '.');
    frame(m, 'T'); rect(m, 1, 1, 34, 1, 'T');
    scatter(m, 'T', 120, 2, 3, 32, 22);
    scatter(m, ',', 40, 2, 3, 32, 22);
    scatter(m, 'h', 24, 2, 3, 32, 22);
    // 迷路的な小道
    vline(m, 17, 3, 26, '='); hline(m, 5, 17, 9, '='); hline(m, 17, 31, 17, '=');
    vline(m, 5, 9, 20, '='); vline(m, 31, 8, 17, '='); hline(m, 24, 31, 8, '=');
    // 月門(満月の夜のみ通過可)
    rect(m, 15, 1, 5, 2, '.');
    put(m, 16, 2, 'c'); put(m, 18, 2, 'c');
    put(m, 17, 2, 'M');
    hline(m, 16, 18, 0, '.');
    hline(m, 16, 18, 27, '='); // 南口
    Z['jukai'] = {
      name: '千枝の樹海', biome: 'forest', mood: 'mystic',
      map: S(m),
      spawns: [
        { enemy: 'forest_stalker', n: 4, area: [3, 4, 30, 20], respawn: 25 },
        { enemy: 'packhound', n: 3, area: [3, 12, 30, 12], respawn: 30, scale: true },
        { enemy: 'lich_quartet', n: 1, area: [6, 4, 8, 6], respawn: 180 },
      ],
      props: [
        { type: 'sign', x: 17, y: 4, text: ['月光の紋様が刻まれた白い門がある。触れてもびくともしない。', '「———月満ちる夜、閉じた枝は道をひらく」と刻まれている。'] },
        { type: 'sign', x: 6, y: 18, text: '記録: この樹海は「多層」だ。地図が役に立たない。骸の詠う声が聞こえたら引き返せ(書見のロータス調査班)' },
      ],
      exits: [
        { x: 16, y: 27, w: 3, h: 1, to: 'brenzal_town', tx: 12, ty: 1 },
        { x: 16, y: 0, w: 3, h: 1, to: 'hisono', tx: 9, ty: 13, cond: 'fullMoonNight', msg: '門は沈黙している(満月の夜にのみ、何かが起こる気がする)' },
      ],
    };
  }

  // ================= 秘園(満月の夜のみ) =================
  seed = 707;
  {
    const m = mk(20, 16, '.');
    frame(m, 'T');
    scatter(m, 'F', 40, 1, 1, 18, 14);
    rect(m, 3, 3, 4, 3, '~');
    rect(m, 8, 6, 4, 3, ','); // 中央の空き地
    hline(m, 8, 10, 15, '=');
    Z['hisono'] = {
      name: '???', biome: 'moon', mood: 'mystic', fallHeight: 10,
      map: S(m),
      npcs: [{ id: 'towa', x: 10, y: 6 }],
      props: [
        { type: 'sign', x: 4, y: 12, text: '花々が月光を浴びて開いている。ここは、地図のどこにも載っていない。' },
        { type: 'dig', x: 5, y: 11, flagId: 'dig_omega', item: 'omega_core', cond: 'exRabbitActive' },
        { type: 'portal', x: 16, y: 4, to: 'lunaria', tx: 12, ty: 15, cond: 'lunaria', msg: '月光が渦を巻いている…だが、まだ道にはならない' },
      ],
      exits: [{ x: 8, y: 15, w: 3, h: 1, to: 'jukai', tx: 17, ty: 3 }],
    };
  }

  // ================= 水晶巣崖 =================
  seed = 808;
  {
    const m = mk(36, 26, '.');
    frame(m, '#');
    // 崖と奈落の段丘
    rect(m, 6, 3, 3, 12, '^'); rect(m, 14, 10, 3, 13, '^'); rect(m, 24, 3, 3, 14, '^');
    rect(m, 9, 5, 5, 4, '_'); rect(m, 18, 15, 5, 4, '_'); rect(m, 28, 6, 4, 8, '_');
    scatter(m, 'c', 22, 2, 2, 32, 22);
    scatter(m, ',', 20, 2, 2, 32, 22);
    hline(m, 1, 34, 13, '='); vline(m, 20, 13, 24, '=');
    put(m, 0, 13, '='); put(m, 35, 13, '=');
    hline(m, 19, 21, 25, '=');
    Z['crystal_cliff'] = {
      name: '水晶巣崖', biome: 'cave', mood: 'dungeon', fallHeight: 18,
      map: S(m),
      spawns: [
        { enemy: 'crystal_scorpion', n: 5, area: [3, 3, 30, 18], respawn: 40 },
        { enemy: 'night_wisp', n: 3, area: [3, 3, 30, 18], respawn: 30, night: true },
        { enemy: 'fenreed', n: 1, area: [8, 6, 20, 12], respawn: 999, night: true, boss: true, cond: 'nightRare', once: 'fenreed_slain' },
      ],
      props: [
        { type: 'sign', x: 3, y: 12, text: ['観察会アルカの注意書き: この崖の水晶は「生きて」いるものが混じる。', '打撃音や走行の振動で目覚める。静かに歩け。目覚めたら——走れ。'] },
        { type: 'chest', x: 31, y: 3, flagId: 'chest_cc1', items: [['tome_terra', 1], ['mana_s', 2]] },
        { type: 'sign', x: 30, y: 5, text: '崖の上に宝箱が見える。手を使わずに登る技術があれば…' },
      ],
      exits: [
        { x: 0, y: 12, w: 1, h: 3, to: 'brenzal_town', tx: 22, ty: 8 },
        { x: 35, y: 12, w: 1, h: 3, to: 'terce_town', tx: 1, ty: 8 },
        { x: 19, y: 25, w: 3, h: 1, to: 'ruins', tx: 16, ty: 1 },
      ],
    };
  }

  // ================= 星鋼の遺構(七凶星: 廟守のカガチマル) =================
  seed = 909;
  {
    const m = mk(34, 26, 'r');
    frame(m, '*');
    scatter(m, '*', 40, 2, 2, 30, 22);
    // 発光通路
    vline(m, 16, 1, 24, 'g'); hline(m, 4, 29, 12, 'g');
    rect(m, 12, 18, 10, 7, 'r'); rect(m, 13, 19, 8, 5, 'g'); // 廟(ボス間)
    // 星鋼の門(世界フラグで開く宝物庫)
    rect(m, 26, 16, 7, 8, 'r');
    vline(m, 26, 17, 22, 'D');
    hline(m, 15, 17, 1, 'r');
    Z['ruins'] = {
      name: '星鋼の遺構', biome: 'ruins', mood: 'boss', dark: true, gateFlag: 'starsteel_open',
      map: S(m),
      spawns: [
        { enemy: 'rust_walker', n: 4, area: [3, 3, 28, 12], respawn: 40 },
        { enemy: 'kagachimaru', n: 1, area: [15, 20, 4, 3], respawn: 999, boss: true, once: 'starsteel_open' },
      ],
      props: [
        { type: 'sign', x: 8, y: 3, text: ['星鋼紀の警告表示が明滅している: 「墓所ニ・触レル・ナカレ」', '床の発光ラインは、奥の「廟」へ続いている。'] },
        { type: 'chest', x: 30, y: 20, flagId: 'chest_ru1', items: [['scroll_bloodgear', 1], ['starsteel_scrap', 3], ['mana_s', 2]] },
        { type: 'sign', x: 27, y: 15, text: '星鋼の隔壁が道を塞いでいる。制御主が「生きて」いる限り、開くことはない。' },
      ],
      exits: [{ x: 15, y: 0, w: 3, h: 1, to: 'crystal_cliff', tx: 20, ty: 24 }],
    };
  }

  // ================= 第3拠点 テルツェの街 =================
  seed = 1010;
  {
    const m = mk(24, 16, '.');
    frame(m, '#');
    hline(m, 1, 22, 8, '='); vline(m, 12, 1, 14, '=');
    rect(m, 3, 3, 5, 3, 'w'); rect(m, 16, 3, 5, 3, 'w'); rect(m, 3, 11, 5, 3, 'w');
    scatter(m, 'F', 5, 1, 1, 22, 14);
    put(m, 0, 8, '='); put(m, 23, 8, '=');
    Z['terce_town'] = {
      name: '第3拠点 テルツェの街', biome: 'town', mood: 'town', town: true, fakePlayers: 8,
      map: S(m),
      npcs: [
        { id: 'theo_scholar', x: 5, y: 7 },
        { id: 'gante_shop', x: 18, y: 7 },
        { id: 'terce_inn', x: 5, y: 10 },
      ],
      props: [
        { type: 'board', x: 14, y: 7 },
        { type: 'sign', x: 10, y: 2, text: '西: 水晶巣崖 / 東: 港湾都市クインシア(街道崩落中)' },
      ],
      exits: [
        { x: 0, y: 7, w: 1, h: 3, to: 'crystal_cliff', tx: 34, ty: 13 },
        { x: 23, y: 7, w: 1, h: 3, to: 'quinsia', tx: 1, ty: 8, cond: 'starsteel', msg: '街道が崩落している。「星鋼の技術でも戻らない限り、修復は無理だね」と作業員が肩をすくめた' },
      ],
    };
  }

  // ================= 港湾都市クインシア =================
  seed = 1111;
  {
    const m = mk(30, 18, '.');
    frame(m, '#');
    rect(m, 1, 12, 28, 5, '~'); // 海
    hline(m, 1, 28, 11, 's');
    rect(m, 20, 12, 2, 5, 'b'); // 桟橋
    hline(m, 1, 28, 8, '='); vline(m, 10, 1, 8, '=');
    rect(m, 3, 3, 5, 3, 'w'); rect(m, 14, 3, 5, 3, 'w');
    put(m, 0, 8, '=');
    Z['quinsia'] = {
      name: '港湾都市クインシア', biome: 'beach', mood: 'town', town: true, fakePlayers: 9,
      map: S(m),
      npcs: [
        { id: 'yan_fisher', x: 20, y: 13 },
        { id: 'quinsia_shop', x: 16, y: 7 },
        { id: 'quinsia_inn', x: 5, y: 7 },
      ],
      props: [
        { type: 'board', x: 12, y: 7 },
        { type: 'sign', x: 22, y: 10, text: '桟橋の先——深く、暗い海。時折、巨大な影が横切るという。' },
      ],
      exits: [{ x: 0, y: 7, w: 1, h: 3, to: 'terce_town', tx: 22, ty: 8 }],
    };
  }

  // ================= 月兎の郷ルナリア(隠し国) =================
  seed = 1212;
  {
    const m = mk(26, 18, '.');
    frame(m, 'T');
    scatter(m, 'F', 30, 1, 1, 24, 16);
    rect(m, 4, 4, 4, 3, '~');
    rect(m, 17, 3, 5, 3, 'w');
    hline(m, 1, 24, 9, '=');
    rect(m, 11, 14, 3, 3, ',');
    Z['lunaria'] = {
      name: '月兎の郷 ルナリア', biome: 'moon', mood: 'mystic', town: true, fakePlayers: 0,
      map: S(m),
      npcs: [
        { id: 'hakuren', x: 12, y: 5 },
        { id: 'lunaria_shop', x: 19, y: 7 },
      ],
      spawns: [
        { enemy: 'lunahare', n: 1, area: [11, 14, 3, 2], respawn: 999, boss: true, once: 'rabbit_slain' },
      ],
      props: [
        { type: 'sign', x: 6, y: 9, text: ['ここは月の兎たちの隠れ里。地上の地図には決して載らない。', '「武器を持たずに月の門をくぐった者だけが、客人と呼ばれる」'] },
        { type: 'portal', x: 12, y: 15, to: 'hisono', tx: 16, ty: 6, cond: 'always' },
      ],
      exits: [],
    };
  }
})();
