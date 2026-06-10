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
async function submitScore(token, nickname, score) {
  if (!token) return { ok: false, message: "オフラインのため送信できません" };
  try {
    const res = await fetch(SUBMIT_SCORE_URL, {
      method: "POST",
      headers: API_HEADERS,
      body: JSON.stringify({ action: "submit", token, nickname, score }),
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    const messages = {
      "play time too short": "プレイ時間が短すぎるため送信できません",
      "too many submissions": "送信が続きすぎています。少し待ってからどうぞ",
      "score too high for play time": "スコアを確認できませんでした",
      "invalid nickname": "ニックネームは1〜12文字で入力してください",
    };
    return { ok: false, message: messages[data.error] ?? "送信に失敗しました" };
  } catch {
    return { ok: false, message: "通信エラーで送信できませんでした" };
  }
}

// 全期間TOP20を取得。失敗時は null
async function fetchTop20() {
  try {
    const res = await fetch(
      SUPABASE_URL + "/rest/v1/scores?select=nickname,score,created_at&order=score.desc&limit=20",
      { headers: API_HEADERS });
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
    listEl.appendChild(li);
  });
}
