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

  // 合体音「ぽいんっ」:低めでやわらかいサインがクイッと上がってすぐ戻る。
  // 倍音は1オクターブ上(協和)だけにして不協和感を無くす。
  function merge(level = 0) {
    ensure();
    const t = ctx.currentTime;
    const base = Math.max(300, 470 - level * 15); // 全体的に低め。大きい果物ほどさらに低い
    // [周波数, 音量] 根音＋1オクターブ上(きれいに響く比率)
    [[base, 0.22], [base * 2, 0.06]].forEach(([f, v]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(f * 0.92, t);
      o.frequency.linearRampToValueAtTime(f * 1.16, t + 0.05); // クイッと上がって
      o.frequency.linearRampToValueAtTime(f, t + 0.16);        // すっと戻る=ぽいんっ
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g); g.connect(sfxGain);
      o.start(t); o.stop(t + 0.3);
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
