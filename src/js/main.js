// 入力(マウス/タッチ)とゲームの起動、UIとの接続
const canvas = document.getElementById("game");
const game = new Game(canvas);

const scoreEl = document.getElementById("score");
const gameoverEl = document.getElementById("gameover");
const finalScoreEl = document.getElementById("final-score");

// ベストスコア(localStorage)。スコアがベストを超えたら即保存
const bestEl = document.getElementById("best");
let best = loadBest();
bestEl.textContent = String(best);

game.onScoreChange = (score) => {
  scoreEl.textContent = String(score);
  if (score > best) {
    best = score;
    bestEl.textContent = String(best);
    saveBest(best);
  }
};

// ネクスト表示(HUDの「つぎ」カード)
const nextCanvas = document.getElementById("next");
const nextCtx = nextCanvas.getContext("2d");

function renderNext(index) {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const fruit = FRUITS[index];
  const r = Math.min(24, 10 + fruit.radius * 0.3);
  drawFruitShape(nextCtx, nextCanvas.width / 2, nextCanvas.height / 2, fruit, 0, r);
}

game.onNextChange = renderNext;
renderNext(game.nextIndex);

// 進化リスト(小→大の順にミニフルーツを並べる)
const evoList = document.getElementById("evo-list");
FRUITS.forEach((fruit, i) => {
  if (i > 0) {
    const arrow = document.createElement("span");
    arrow.className = "evo-arrow";
    arrow.textContent = "▶";
    evoList.appendChild(arrow);
  }
  const r = Math.round(12 + i * 3);
  const c = document.createElement("canvas");
  c.width = c.height = r * 2 + 4;
  c.title = fruit.name;
  c.style.width = c.width / 2 + "px"; // 高解像度で描いて半分サイズ表示
  c.style.height = c.height / 2 + "px";
  drawFruitShape(c.getContext("2d"), r + 2, r + 2, fruit, 0, r);
  evoList.appendChild(c);
});

// ---- オンラインランキング ----
const nicknameEl = document.getElementById("nickname");
const submitBtn = document.getElementById("submit-score");
const submitMsgEl = document.getElementById("submit-msg");
const rankingEl = document.getElementById("ranking");
const rankingListEl = document.getElementById("ranking-list");

// プレイトークン:ゲーム開始(ページ表示・リスタート)のたびに取り直す
let playToken = null;
async function refreshPlayToken() {
  playToken = await fetchPlayToken();
}
refreshPlayToken();

// クリア画面の証跡画像(ゲームオーバーの静止画キャンバスを小さいJPEGにする)
let lastShot = null;
function captureShot() {
  const W = 360, H = 480; // キャンバス(480x640)と同じ3:4で縮小
  const off = document.createElement("canvas");
  off.width = W; off.height = H;
  const octx = off.getContext("2d");
  // キャンバスは透明背景なので、背景に近い色を下に敷く(JPEGは透明非対応)
  octx.fillStyle = "#ecd5b0";
  octx.fillRect(0, 0, W, H);
  octx.drawImage(canvas, 0, 0, W, H);
  return off.toDataURL("image/jpeg", 0.62);
}

game.onGameOver = (score) => {
  // 震え後・通常の顔で静止した「裏のフルーツたち」をこの瞬間に撮る(0点は送れないので撮らない)
  lastShot = score > 0 ? captureShot() : null;
  finalScoreEl.textContent = String(score);
  // 送信フォームを初期状態に戻す(0点は送れないので非表示)
  submitMsgEl.textContent = "";
  nicknameEl.disabled = false;
  submitBtn.disabled = false;
  document.getElementById("submit-area").style.display = score > 0 ? "" : "none";
  gameoverEl.classList.remove("hidden");
};

submitBtn.addEventListener("click", async () => {
  const nickname = nicknameEl.value.trim();
  if (nickname.length < 1 || nickname.length > 12) {
    submitMsgEl.textContent = "ニックネームは1〜12文字で入力してください";
    return;
  }
  submitBtn.disabled = true;
  submitMsgEl.textContent = "送信中…";
  const result = await submitScore(playToken, nickname, game.score, lastShot);
  if (result.ok) {
    nicknameEl.disabled = true;
    submitMsgEl.textContent = "送信しました!";
    openRanking();
  } else {
    submitBtn.disabled = false;
    submitMsgEl.textContent = result.message;
  }
});

async function openRanking() {
  renderRanking(rankingListEl, []); // いったん空で開いてから読み込み
  rankingListEl.replaceChildren();
  const loading = document.createElement("li");
  loading.className = "rank-empty";
  loading.textContent = "読み込み中…";
  rankingListEl.appendChild(loading);
  rankingEl.classList.remove("hidden");
  renderRanking(rankingListEl, await fetchTop20());
}

document.getElementById("open-ranking").addEventListener("click", openRanking);
document.getElementById("close-ranking").addEventListener("click", () => {
  rankingEl.classList.add("hidden");
});

// 証跡画像の拡大表示:どこをタップしても閉じる
document.getElementById("shot-viewer").addEventListener("click", () => {
  document.getElementById("shot-viewer").classList.add("hidden");
});


document.getElementById("restart").addEventListener("click", () => {
  gameoverEl.classList.add("hidden");
  game.restart();
  refreshPlayToken();
});

// プレイ中のやりなおし:確認ダイアログ →「はい」で開始演出を挟んでリセット
// busy = 確認ダイアログ表示中 or 演出中。落下などの操作を止め、二重起動も防ぐ。
let busy = false;
const retryConfirm = document.getElementById("retry-confirm");

document.getElementById("reset-btn").addEventListener("click", () => {
  if (busy) return;             // 演出中・ダイアログ中は無視(連打対策)
  busy = true;
  retryConfirm.classList.remove("hidden");
});

// 「いいえ」:ダイアログを閉じて元の画面へ。ゲーム状態は一切変更しない。
document.getElementById("retry-no").addEventListener("click", () => {
  retryConfirm.classList.add("hidden");
  busy = false;
});

// 「はい」:開始演出を再生。カーテンで隠れた瞬間に裏でリセットする。
document.getElementById("retry-yes").addEventListener("click", () => {
  retryConfirm.classList.add("hidden");
  ResetIntro.play({
    onCovered: () => {
      gameoverEl.classList.add("hidden");
      game.restart();
      refreshPlayToken();
    },
    onDone: () => { busy = false; },   // 演出完了後に操作可能へ
  });
});

// サウンド:最初の操作でBGM開始(ブラウザの自動再生制限のため)
function startAudioOnce() {
  GameAudio.start();
  window.removeEventListener("pointerdown", startAudioOnce);
  window.removeEventListener("keydown", startAudioOnce);
}
window.addEventListener("pointerdown", startAudioOnce);
window.addEventListener("keydown", startAudioOnce);

// サウンドON/OFFボタン(BGMと効果音を別々に)
const bgmBtn = document.getElementById("bgm-btn");
const sfxBtn = document.getElementById("sfx-btn");
bgmBtn.addEventListener("click", () => {
  GameAudio.start();
  bgmBtn.classList.toggle("off", !GameAudio.toggleBgm());
});
sfxBtn.addEventListener("click", () => {
  GameAudio.start();
  sfxBtn.classList.toggle("off", !GameAudio.toggleSfx());
});

// 画面上の座標 → キャンバス内部座標(CSSで拡縮されるため変換が必要)
function toCanvasX(clientX) {
  const rect = canvas.getBoundingClientRect();
  return ((clientX - rect.left) / rect.width) * canvas.width;
}

canvas.addEventListener("mousemove", (e) => {
  game.moveTo(toCanvasX(e.clientX));
});

canvas.addEventListener("click", () => {
  if (busy) return;            // 確認ダイアログ・開始演出の最中は落とさない
  game.drop();
});

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  if (busy) return;
  game.moveTo(toCanvasX(e.touches[0].clientX));
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
  e.preventDefault();
  if (busy) return;
  game.drop();
}, { passive: false });
