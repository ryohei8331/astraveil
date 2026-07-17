'use strict';
// ゲーム内時間・昼夜・月齢(8日周期、EXシナリオの鍵)
G.time = (() => {
  const DAY_LEN = 720; // 実時間12分 = ゲーム内1日
  const S = { t: DAY_LEN * 0.30, day: 1 }; // 朝スタート
  const frac = () => (S.t % DAY_LEN) / DAY_LEN;
  const isNight = () => { const f = frac(); return f >= 0.58 || f < 0.04; };
  const moonPhase = () => ((S.day - 1) % 8); // 0新月 → 4満月
  const isFullMoon = () => moonPhase() === 4;
  const MOON_NAMES = ['新月', '三日月', '上弦', '十日夜', '満月', '寝待月', '下弦', '有明月'];
  const moonName = () => MOON_NAMES[moonPhase()];
  const clock = () => {
    const h = Math.floor(frac() * 24), m = Math.floor((frac() * 24 - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };
  // 夜の暗さ 0..0.62(満月の夜はやや明るい)
  const darkness = () => {
    const f = frac();
    let d = 0;
    if (f >= 0.52 && f < 0.62) d = (f - 0.52) / 0.10;       // 夕暮れ
    else if (f >= 0.62 || f < 0.02) d = 1;                   // 夜
    else if (f >= 0.02 && f < 0.10) d = 1 - (f - 0.02) / 0.08; // 夜明け
    return d * (isFullMoon() ? 0.45 : 0.62);
  };
  const update = dt => {
    const before = Math.floor(S.t / DAY_LEN);
    S.t += dt;
    if (Math.floor(S.t / DAY_LEN) > before) {
      S.day++;
      if (G.ui) G.ui.banner(`${S.day}日目の朝 — 月齢: ${moonName()}`);
    }
  };
  const advanceToMorning = () => { // 宿屋
    S.t = Math.floor(S.t / DAY_LEN + 1) * DAY_LEN + DAY_LEN * 0.30;
    S.day++;
  };
  const save = () => ({ t: S.t, day: S.day });
  const load = d => { if (d) { S.t = d.t; S.day = d.day; } };
  return { S, DAY_LEN, frac, isNight, moonPhase, isFullMoon, moonName, clock, darkness, update, advanceToMorning, save, load };
})();
