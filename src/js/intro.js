// リセット開始演出(カーテン落下 → シャボン玉 → Ready? → GO!! → カーテンが開く)
// ゲーム本体の物理・挙動には一切触らない。見た目だけの演出モジュール。
const ResetIntro = (() => {
  let running = false;

  // 画面周囲に出すフルーツ入りシャボン玉。中央は文字用に空ける。
  // x,y は%、s は直径px、side は最後にはける方向(-1=左 / 1=右)
  const SPECS = [
    { x: 13, y: 13, idx: 7, s: 64, side: -1 },
    { x: 15, y: 38, idx: 2, s: 54, side: -1 },
    { x: 11, y: 63, idx: 3, s: 60, side: -1 },
    { x: 16, y: 88, idx: 0, s: 46, side: -1 },
    { x: 87, y: 12, idx: 3, s: 58, side: 1 },
    { x: 85, y: 36, idx: 1, s: 52, side: 1 },
    { x: 89, y: 62, idx: 5, s: 62, side: 1 },
    { x: 84, y: 86, idx: 6, s: 50, side: 1 },
  ];

  // シャボン玉を作り直す(毎回ランダムな揺れにする)
  function buildBubbles(container) {
    container.replaceChildren();
    container.style.transition = "none";
    container.style.opacity = "0";
    for (const spec of SPECS) {
      const b = document.createElement("div");
      b.className = "intro-bubble";
      b.style.left = spec.x + "%";
      b.style.top = spec.y + "%";
      b.style.width = b.style.height = spec.s + "px";
      b.style.animationDelay = (-Math.random() * 3.4).toFixed(2) + "s";
      b.style.animationDuration = (3.0 + Math.random() * 1.8).toFixed(2) + "s";
      b.dataset.side = String(spec.side);

      // 中のフルーツ(高解像度で焼いて縮小表示=くっきり)
      const fr = FRUITS[spec.idx];
      const rr = spec.s * 0.32;
      const cv = document.createElement("canvas");
      const pad = 4;
      cv.width = cv.height = Math.ceil((rr + pad) * 2 * 2);
      const c = cv.getContext("2d");
      c.scale(2, 2);
      drawFruitShape(c, rr + pad, rr + pad, fr, -0.2, rr);
      cv.style.width = cv.style.height = (rr + pad) * 2 + "px";
      cv.className = "intro-bubble-fruit";
      b.appendChild(cv);
      container.appendChild(b);
    }
  }

  function makeText(textEl, ruby, main, cls) {
    textEl.replaceChildren();
    textEl.style.transition = "none";
    textEl.style.opacity = "1";
    const wrap = document.createElement("div");
    wrap.className = cls;
    const r = document.createElement("span");
    r.className = "intro-ruby";
    r.textContent = ruby;
    const m = document.createElement("span");
    m.className = "intro-main";
    m.textContent = main;
    wrap.appendChild(r);
    wrap.appendChild(m);
    textEl.appendChild(wrap);
  }

  function play({ onCovered, onDone } = {}) {
    if (running) return; // 二重起動を防止(連打対策)
    running = true;

    const el = document.getElementById("reset-intro");
    const bubbles = document.getElementById("intro-bubbles");
    const textEl = document.getElementById("intro-text");

    // --- 初期状態にリセット ---
    el.classList.remove("hidden", "closing", "opening");
    textEl.replaceChildren();
    textEl.style.transition = "none";
    textEl.style.opacity = "1";
    textEl.style.transform = "";
    buildBubbles(bubbles);
    void el.offsetWidth; // リフロー(カーテンのアニメを確実に頭から再生)

    // --- 1) 横からカーテンが閉じる(上が先・下が遅れてついてくる柔らかい動き=CSS) ---
    el.classList.add("closing");

    // --- 2) 閉じ切ったら裏でリセット → シャボン玉 → Ready? ---
    setTimeout(() => {
      if (onCovered) onCovered();                 // ここで game.restart()(カーテンの裏)
      bubbles.style.transition = "opacity .45s ease-out";
      bubbles.style.opacity = "1";
      makeText(textEl, "レディー", "Ready?", "intro-ready");
    }, 900);

    // --- 3) GO!! ---
    setTimeout(() => {
      makeText(textEl, "ゴー", "GO!!", "intro-go");
    }, 1680);

    // --- 4) カーテンが左右に開く + シャボン玉も外へ流れる ---
    setTimeout(() => {
      el.classList.remove("closing");
      el.classList.add("opening");
      for (const b of bubbles.children) {
        const side = Number(b.dataset.side);
        b.style.animation = "none";
        b.style.transition = "transform .58s cubic-bezier(.5,0,.82,.4), opacity .58s";
        b.style.transform = `translate(-50%,-50%) translateX(${side * 360}px)`;
        b.style.opacity = "0";
      }
      textEl.style.transition = "opacity .4s, transform .4s";
      textEl.style.opacity = "0";
      textEl.style.transform = "scale(1.3)";
    }, 2460);

    // --- 5) 後片付けして操作可能に戻す ---
    setTimeout(() => {
      el.classList.remove("closing", "opening");
      el.classList.add("hidden");
      textEl.style.transform = "";
      running = false;
      if (onDone) onDone();
    }, 3160);
  }

  return { play, isRunning: () => running };
})();
