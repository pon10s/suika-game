// オンラインランキング連携(Supabase)
// セキュリティ:表示は必ず textContent(docs/SECURITY.md 脅威1)。送信はEdge Function経由のみ

const API_HEADERS = {
  "Content-Type": "application/json",
  apikey: SUPABASE_ANON_KEY,
  Authorization: "Bearer " + SUPABASE_ANON_KEY,
};

// ゲーム開始時に呼ぶ。プレイトークン(署名つき開始時刻)をもらう
async function fetchPlayToken() {
  try {
    const res = await fetch(SUBMIT_SCORE_URL, {
      method: "POST",
      headers: API_HEADERS,
      body: JSON.stringify({ action: "start" }),
    });
    const data = await res.json();
    return data.token ?? null;
  } catch {
    return null; // オフラインでもゲーム自体は遊べるようにする
  }
}

// スコア送信。戻り値: { ok: true } か { ok: false, message: "日本語の理由" }
// shot = クリア画面の証跡画像(dataURLのJPEG)。サーバー側で必須・形式/サイズ検証される
async function submitScore(token, nickname, score, shot) {
  if (!token) return { ok: false, message: "オフラインのため送信できません" };
  try {
    const res = await fetch(SUBMIT_SCORE_URL, {
      method: "POST",
      headers: API_HEADERS,
      body: JSON.stringify({ action: "submit", token, nickname, score, shot }),
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    const messages = {
      "play time too short": "プレイ時間が短すぎるため送信できません",
      "too many submissions": "送信が続きすぎています。少し待ってからどうぞ",
      "score too high for play time": "スコアを確認できませんでした",
      "invalid nickname": "ニックネームは1〜12文字で入力してください",
      "invalid shot": "証跡画像を確認できませんでした",
      "shot too large": "証跡画像が大きすぎます",
    };
    return { ok: false, message: messages[data.error] ?? "送信に失敗しました" };
  } catch {
    return { ok: false, message: "通信エラーで送信できませんでした" };
  }
}

// 全期間TOP20を取得。失敗時は null
// shot 列を含めて取得を試み、まだ列が無い(=移行前)なら shot 無しで再取得する。
// これで「DB移行前に新コードを公開しても一覧が壊れない」ようにする。
async function fetchTop20() {
  const base = SUPABASE_URL + "/rest/v1/scores?order=score.desc&limit=20&select=";
  try {
    let res = await fetch(base + "nickname,score,created_at,shot", { headers: API_HEADERS });
    if (!res.ok) {
      // shot 列がまだ無い等で失敗 → 従来の列だけで取り直す
      res = await fetch(base + "nickname,score,created_at", { headers: API_HEADERS });
    }
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ランキングをリストに描画(XSS対策のため textContent のみ使用)
function renderRanking(listEl, rows) {
  listEl.replaceChildren();
  if (!rows || rows.length === 0) {
    const li = document.createElement("li");
    li.className = "rank-empty";
    li.textContent = rows ? "まだ記録がありません。一番乗りのチャンス!" : "ランキングを取得できませんでした";
    listEl.appendChild(li);
    return;
  }
  rows.forEach((row, i) => {
    const li = document.createElement("li");
    const rank = document.createElement("span");
    rank.className = "rank-no";
    rank.textContent = (i + 1) + "位";
    const name = document.createElement("span");
    name.className = "rank-name";
    name.textContent = row.nickname;
    const score = document.createElement("span");
    score.className = "rank-score";
    score.textContent = String(row.score);
    const date = document.createElement("span");
    date.className = "rank-date";
    date.textContent = new Date(row.created_at).toLocaleDateString("ja-JP");
    li.append(rank, name, score, date);
    // 証跡サムネ:正しい画像dataURLならサムネ(タップで拡大)、無ければ NODATA 表示
    if (isImageDataUrl(row.shot)) {
      const thumb = document.createElement("img");
      thumb.className = "rank-shot";
      thumb.src = row.shot;
      thumb.alt = "クリア画面";
      thumb.loading = "lazy";
      thumb.addEventListener("click", () => openShotViewer(row.shot));
      li.appendChild(thumb);
    } else {
      // 証跡を必須化する前の古い記録など(画像なし)
      const noshot = document.createElement("span");
      noshot.className = "rank-noshot";
      noshot.textContent = "NO DATA";
      li.appendChild(noshot);
    }
    listEl.appendChild(li);
  });
}

// shot が安全な画像dataURLか(javascript: 等を弾く)。表示・拡大の前に必ず通す
function isImageDataUrl(s) {
  return typeof s === "string" && /^data:image\/(jpeg|png);base64,/.test(s);
}

// 証跡画像を拡大表示(ライトボックス)
function openShotViewer(dataUrl) {
  if (!isImageDataUrl(dataUrl)) return;
  const viewer = document.getElementById("shot-viewer");
  const img = document.getElementById("shot-viewer-img");
  img.src = dataUrl;
  viewer.classList.remove("hidden");
}
