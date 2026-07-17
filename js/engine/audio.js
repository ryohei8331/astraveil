'use strict';
// WebAudio合成(外部アセットゼロ)。SFX + 簡易プロシージャルBGM
G.audio = (() => {
  let ctx = null, master = null, bgmGain = null, enabled = true, bgmTimer = null, mood = null;
  const ensure = () => {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
        bgmGain = ctx.createGain(); bgmGain.gain.value = 0.16; bgmGain.connect(master);
      } catch (e) { enabled = false; }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return !!ctx;
  };
  const tone = (freq, dur, type = 'square', vol = 0.16, slide = 0, delay = 0) => {
    if (!enabled || !ensure()) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  };
  const noise = (dur, vol = 0.2, freq = 1000, delay = 0) => {
    if (!enabled || !ensure()) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, (dur * ctx.sampleRate) | 0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  };
  const SFX = {
    hit: () => { noise(0.08, 0.25, 1800); tone(160, 0.08, 'square', 0.1, -60); },
    crit: () => { noise(0.12, 0.3, 3000); tone(880, 0.15, 'sawtooth', 0.14, -400); },
    hurt: () => { tone(140, 0.2, 'sawtooth', 0.18, -60); noise(0.1, 0.15, 700); },
    die: () => { tone(220, 0.5, 'sawtooth', 0.16, -180); noise(0.4, 0.2, 500); },
    level: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 'square', 0.12, 0, i * 0.09)); },
    coin: () => { tone(988, 0.06, 'square', 0.1); tone(1319, 0.12, 'square', 0.1, 0, 0.06); },
    ui: () => tone(660, 0.05, 'square', 0.06),
    open: () => { tone(440, 0.08, 'triangle', 0.1); tone(660, 0.1, 'triangle', 0.1, 0, 0.07); },
    dodge: () => noise(0.09, 0.12, 2400),
    magic: () => { tone(300, 0.25, 'sine', 0.14, 500); noise(0.2, 0.08, 2500); },
    charge: () => tone(180, 0.3, 'sine', 0.05, 240),
    thunder: () => { noise(0.5, 0.35, 900); tone(80, 0.5, 'sawtooth', 0.2, -30); },
    heal: () => { [392, 523, 659].forEach((f, i) => tone(f, 0.16, 'sine', 0.1, 0, i * 0.08)); },
    eat: () => { tone(300, 0.06, 'square', 0.08); tone(240, 0.06, 'square', 0.08, 0, 0.08); },
    roar: () => { tone(90, 0.7, 'sawtooth', 0.22, -40); noise(0.6, 0.18, 400); },
    howl: () => { tone(440, 0.9, 'sine', 0.14, 220); tone(330, 0.9, 'sine', 0.08, 180, 0.1); },
    warp: () => { tone(200, 0.4, 'sine', 0.12, 900); },
    quest: () => { [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.12, 'triangle', 0.11, 0, i * 0.08)); },
    dig: () => { noise(0.15, 0.25, 500); },
    curse: () => { tone(110, 1.0, 'sawtooth', 0.16, -50); tone(116, 1.0, 'sawtooth', 0.12, -50); },
    step: () => noise(0.03, 0.03, 900),
    sos: () => { [880, 660, 880, 660].forEach((f, i) => tone(f, 0.1, 'square', 0.12, 0, i * 0.12)); },
  };
  const sfx = name => { try { SFX[name] && SFX[name](); } catch (e) { } };
  // ---- BGM: ムード別ペンタトニック・シーケンサ ----
  const SCALES = {
    field: [261, 293, 329, 392, 440, 523, 587],
    town: [293, 329, 392, 440, 493, 587],
    dungeon: [220, 261, 293, 349, 392, 440],
    night: [220, 246, 293, 329, 392],
    boss: [174, 220, 233, 261, 349],
    mystic: [261, 311, 349, 415, 466],
  };
  let seqPos = 3;
  const startBgm = m => {
    mood = m;
    if (bgmTimer) return;
    bgmTimer = setInterval(() => {
      if (!enabled || !ctx || document.hidden || !mood) return;
      const scale = SCALES[mood] || SCALES.field;
      seqPos = G.U.clamp(seqPos + G.U.irnd(-2, 2), 0, scale.length - 1);
      const f = scale[seqPos] * (G.time && G.time.isNight() && mood === 'field' ? 0.5 : 1);
      const t0 = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = mood === 'boss' ? 'sawtooth' : 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(mood === 'boss' ? 0.5 : 0.32, t0 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + (mood === 'boss' ? 0.5 : 1.4));
      o.connect(g); g.connect(bgmGain); o.start(t0); o.stop(t0 + 1.6);
      if (G.U.chance(0.3)) { // ベース
        const b = ctx.createOscillator(), bg = ctx.createGain();
        b.type = 'sine'; b.frequency.value = scale[0] / 2;
        bg.gain.setValueAtTime(0.25, t0); bg.gain.exponentialRampToValueAtTime(0.001, t0 + 1.8);
        b.connect(bg); bg.connect(bgmGain); b.start(t0); b.stop(t0 + 2);
      }
    }, mood === 'boss' ? 340 : 640);
  };
  const setMood = m => {
    if (m === mood) return;
    if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
    if (m) startBgm(m);
    else mood = null;
  };
  const toggle = () => { enabled = !enabled; return enabled; };
  return { ensure, sfx, setMood, toggle, get enabled() { return enabled; } };
})();
