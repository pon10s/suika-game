// サウンド(Web Audio API で合成。音声ファイル無し=ロード不要・軽量)
// - BGM: のどかでポップなループ
// - SFX: 落とす/合体(軽くて明るい音)
// BGMと効果音はそれぞれ独立してON/OFFできる。
// 自動再生はブラウザに禁止されているので、最初の操作で start() を呼んで開始する。
const GameAudio = (() => {
  let ctx, master, bgmGain, sfxGain;
  let started = false, bgmTimer = null;
  let bgmOn = true, sfxOn = true;

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(ctx.destination);
      bgmGain = ctx.createGain();
      bgmGain.gain.value = bgmOn ? 0.16 : 0; // BGMは控えめ
      bgmGain.connect(master);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = sfxOn ? 1 : 0;
      sfxGain.connect(master);
    }
    if (ctx.state === "suspended") ctx.resume();
  }

  function note(freq, t, dur, type, vol, dest) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // --- BGM(C → G → Am → F のやさしいループ)---
  const CHORDS = [
    [261.63, 329.63, 392.00], // C
    [392.00, 493.88, 587.33], // G
    [220.00, 261.63, 329.63], // Am
    [349.23, 440.00, 523.25], // F
  ];
  const BEAT = 0.5;

  function playBar(t, chord) {
    note(chord[0] / 2, t, BEAT * 3.8, "sine", 0.10, bgmGain);
    const arp = [chord[0], chord[1], chord[2], chord[1], chord[0], chord[1], chord[2], chord[1]];
    arp.forEach((f, k) => note(f * 2, t + k * BEAT / 2, BEAT * 0.45, "triangle", 0.05, bgmGain));
  }

  function scheduleBGM() {
    let bar = 0;
    let next = ctx.currentTime + 0.1;
    function tick() {
      if (!started) return;
      while (next < ctx.currentTime + 0.6) {
        playBar(next, CHORDS[bar % CHORDS.length]);
        next += BEAT * 4;
        bar++;
      }
      bgmTimer = setTimeout(tick, 120);
    }
    tick();
  }

  // --- 公開API ---
  function start() {
    ensure();
    if (!started) { started = true; scheduleBGM(); }
  }

  // 落とす音「ぷいっ」:軽くて明るい短いサイン(上にちょい跳ね)
  function drop() {
    ensure();
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(720, t);
    o.frequency.exponentialRampToValueAtTime(1080, t + 0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + 0.12);
  }

  // 合体音「ポンっ」:明るくやさしいベル(根音＋5度の倍音)
  function merge(level = 0) {
    ensure();
    const t = ctx.currentTime;
    const base = Math.max(420, 760 - level * 26); // 大きいほど少し低いが明るさは保つ
    [[base, 0.2], [base * 1.5, 0.13]].forEach(([f, v]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 1.18, t + 0.04);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g); g.connect(sfxGain);
      o.start(t); o.stop(t + 0.22);
    });
  }

  function toggleBgm() {
    ensure();
    bgmOn = !bgmOn;
    bgmGain.gain.value = bgmOn ? 0.16 : 0;
    return bgmOn;
  }
  function toggleSfx() {
    ensure();
    sfxOn = !sfxOn;
    sfxGain.gain.value = sfxOn ? 1 : 0;
    return sfxOn;
  }

  return { start, drop, merge, toggleBgm, toggleSfx, isBgmOn: () => bgmOn, isSfxOn: () => sfxOn };
})();
