'use strict';
// ゲーム内時間・昼夜・月齢(8日周期、EXシナリオの鍵)
G.time = (() => {
  const DAY_LEN = 720; // 実時間12分 = ゲーム内1日
  const S = { t: DAY_LEN * 0.30, day: 1 }; // 朝スタート
  const frac = () => (S.t % DAY_LEN) / DAY_LEN;
  const isNight = () => { const f = frac(); return f >= 0.84 || f < 0.18; }; // 20:10頃〜04:20頃
  const moonPhase = () => ((S.day - 1) % 8); // 0新月 → 4満月
  const isFullMoon = () => moonPhase() === 4;
  const MOON_NAMES = ['新月', '三日月', '上弦', '十日夜', '満月', '寝待月', '下弦', '有明月'];
  const moonName = () => MOON_NAMES[moonPhase()];
  const clock = () => {
    const h = Math.floor(frac() * 24), m = Math.floor((frac() * 24 - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };
  // 夜の暗さ 0..0.62(満月の夜はやや明るい)。夕暮れ18時台→夜20時半→夜明け3時半
  const darkness = () => {
    const f = frac();
    let d = 0;
    if (f >= 0.76 && f < 0.86) d = (f - 0.76) / 0.10;          // 夕暮れ(18:14-20:38)
    else if (f >= 0.86 || f < 0.14) d = 1;                     // 夜
    else if (f >= 0.14 && f < 0.22) d = 1 - (f - 0.14) / 0.08; // 夜明け(03:21-05:16)
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
  // 指定した「1日の何分位(0..1)」まで時間を進める。今より前なら翌日の同時刻へ。
  const advanceToTimeOfDay = frac01 => {
    const curDayStart = Math.floor(S.t / DAY_LEN) * DAY_LEN;
    let target = curDayStart + DAY_LEN * frac01;
    while (target <= S.t + 1) { target += DAY_LEN; S.day++; }
    S.t = target;
  };
  // 指定月齢(0=新月, 4=満月)かつ夜になるまで進める(最大8日)
  const advanceToMoonNight = phase => {
    for (let i = 0; i < 8; i++) {
      if (((S.day - 1) % 8) === phase) { advanceToTimeOfDay(0.92); return; } // 夜へ
      advanceToMorning();
    }
  };
  // 次の夜まで(今夜が可能ならそのまま今夜21時、遠ければ今夜21時)
  const advanceToNextNight = () => advanceToTimeOfDay(0.92);
  // 次の朝(次の日の朝)
  const advanceToNextMorning = advanceToMorning;
  const save = () => ({ t: S.t, day: S.day });
  const load = d => { if (d) { S.t = d.t; S.day = d.day; } };
  const reset = () => { S.t = DAY_LEN * 0.30; S.day = 1; };
  return { S, DAY_LEN, frac, isNight, moonPhase, isFullMoon, moonName, clock, darkness, update,
    advanceToMorning, advanceToTimeOfDay, advanceToMoonNight, advanceToNextNight, advanceToNextMorning,
    save, load, reset };
})();
