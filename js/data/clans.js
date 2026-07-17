'use strict';
// クラン勧誘NPC: 各街に駐在。条件を満たせば加入できる(所属は1つ、脱退可)
(() => {
  const N = G.DATA.npcs;

  const recruiter = (id, clanName, look, opening) => {
    N[id] = {
      id, name: `${clanName} 勧誘担当`, look, emblem: '🚩',
      nameColor: '#e0c8f0',
      onTalk(npc, p) {
        const So = G.Social;
        const c = So.CLANS[clanName];
        if (So.clan === clanName) {
          G.dialog.open(npc.def.name, [
            `おう、${p.name}。クランの調子はどうだ?特典「${c.perk}」は活きてるか?`,
            '脱退したい時はもう一度話しかけて、覚悟を決めてくれ。',
          ], () => {
            if (window.confirm(`${clanName}を脱退しますか?(特典を失います)`)) So.leave();
          });
        } else if (So.clan) {
          G.dialog.open(npc.def.name, [
            `${So.clan}の${p.name}か。うちに来たいなら、まず今の所属を抜けてからだ。`,
            '義理を欠く移籍は、この世界じゃ長生きしないぜ。',
          ]);
        } else if (c.cond(p)) {
          G.dialog.open(npc.def.name, [
            opening,
            `見たところ、あんたは条件を満たしている(${c.condText})。`,
            `うちの特典は「${c.perk}」。どうだ、入るか?`,
          ], () => {
            if (window.confirm(`${clanName}に加入しますか?`)) So.join(clanName);
          });
        } else {
          G.dialog.open(npc.def.name, [
            opening,
            `だが、まだ早い。うちの加入条件は——${c.condText}。`,
            'その時が来たら、また声をかけてくれ。',
          ]);
        }
      },
    };
  };

  recruiter('recruit_kurogane', '黒鉄剣盟', { body: '#3a3a44', hair: '#2c2c2c' },
    '黒鉄剣盟——この世界最大のクランだ。数は力、組織は盾。');
  recruiter('recruit_ginro', '銀狼旅団', { body: '#8a94a8', hair: '#d8dce8' },
    '銀狼旅団。最前線を独占する少数精鋭…と言えば聞こえはいいが、要は開拓中毒の群れだ。');
  recruiter('recruit_shura', '修羅衆', { body: '#5c2430', hair: '#1a1a1a' },
    '……修羅衆に何の用だ。ウチは花畑じゃない。力と業(ごう)の吹き溜まりだ。');
  recruiter('recruit_seikan', '聖環騎士団', { body: '#c8c8dc', hair: '#e8d8a0' },
    '聖環騎士団へようこそ。我らは聖女様の御心のままに、弱きを守る盾となる者。');
  recruiter('recruit_shoken', '書見のロータス', { body: '#3a4a6a', hair: '#8a8a9a' },
    '書見のロータス。戦いより真実を。この世界の「設定」を解き明かす者たちだ。');
  recruiter('recruit_arca', '観察会アルカ', { body: '#4a6a4a', hair: '#6e5540' },
    '観察会アルカです!モンスターは倒す前に、まず観る。かわいさは正義。');

  // 各街に配置(既存ゾーン定義へ追記)
  const Z = G.DATA.zones;
  if (Z.alba_town) Z.alba_town.npcs.push({ id: 'recruit_arca', x: 16, y: 9 });
  if (Z.brenzal_town) {
    Z.brenzal_town.npcs.push({ id: 'recruit_kurogane', x: 10, y: 5 });
    Z.brenzal_town.npcs.push({ id: 'recruit_shura', x: 21, y: 13 });
  }
  if (Z.terce_town) {
    Z.terce_town.npcs.push({ id: 'recruit_ginro', x: 10, y: 5 });
    Z.terce_town.npcs.push({ id: 'recruit_shoken', x: 14, y: 5 });
  }
  if (Z.quinsia) Z.quinsia.npcs.push({ id: 'recruit_seikan', x: 7, y: 10 });
})();
