// スコア送信 Edge Function(docs/SECURITY.md の脅威2・4対策)
// - action: "start"  → プレイトークン(署名つき開始時刻)を発行。ゲーム開始時に呼ぶ
// - action: "submit" → トークン・ニックネーム・スコアを検証してDBに保存
//
// 必要な環境変数(SupabaseのSecretsに設定。手順は supabase/README.md):
//   PLAY_TOKEN_SECRET … トークン署名用のランダム文字列
//   ALLOWED_ORIGIN    … 許可するサイトのURL(GitHub PagesのURL)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY … Supabaseが自動設定

import { createClient } from "npm:@supabase/supabase-js@2";

const TOKEN_SECRET = Deno.env.get("PLAY_TOKEN_SECRET") ?? "";
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

const MAX_SCORE = 100000;          // スコア上限(理論値より十分大きい安全弁)
const MAX_SCORE_PER_SECOND = 15;   // プレイ1秒あたりに稼げる最大スコアの目安
const MIN_PLAY_SECONDS = 10;       // これより短いプレイの送信は拒否
const RATE_LIMIT_COUNT = 3;        // 同一IPからの送信は…
const RATE_LIMIT_WINDOW_SEC = 60;  // …60秒に3回まで

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hmacHex(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(TOKEN_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(message: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid json" });
  }

  // ---- ゲーム開始:プレイトークン発行 ----
  if (body.action === "start") {
    const t = Date.now();
    const sig = await hmacHex(String(t));
    return json(200, { token: `${t}.${sig}` });
  }

  // ---- スコア送信 ----
  if (body.action !== "submit") return json(400, { error: "unknown action" });

  // 1. 型・範囲チェック(docs/SECURITY.md 脅威2-①)
  const score = body.score;
  if (typeof score !== "number" || !Number.isInteger(score) || score <= 0 || score > MAX_SCORE) {
    return json(400, { error: "invalid score" });
  }

  // 2. ニックネーム検証:1〜12文字、制御文字禁止(脅威1)
  const nickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
  if (!/^[^\x00-\x1F\x7F]{1,12}$/u.test(nickname)) {
    return json(400, { error: "invalid nickname" });
  }

  // 3. プレイトークン検証:署名と経過時間の整合(脅威2-②)
  const token = typeof body.token === "string" ? body.token : "";
  const [tStr, sig] = token.split(".");
  if (!tStr || !sig || sig !== (await hmacHex(tStr))) {
    return json(403, { error: "invalid token" });
  }
  const elapsedSec = (Date.now() - Number(tStr)) / 1000;
  if (!Number.isFinite(elapsedSec) || elapsedSec < MIN_PLAY_SECONDS) {
    return json(403, { error: "play time too short" });
  }
  if (score > elapsedSec * MAX_SCORE_PER_SECOND) {
    return json(403, { error: "score too high for play time" });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 4. レート制限:同一IPは60秒に3回まで(脅威4)。生IPは保存せずハッシュのみ
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const ipHash = await sha256Hex(`${TOKEN_SECRET}:${ip}`);
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_SEC * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("scores")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);
  if (countError) return json(500, { error: "server error" });
  if ((count ?? 0) >= RATE_LIMIT_COUNT) {
    return json(429, { error: "too many submissions" });
  }

  // 5. 保存(service role のみ書き込み可能。RLSは schema.sql 参照)
  const { error } = await supabase.from("scores").insert({ nickname, score, ip_hash: ipHash });
  if (error) return json(500, { error: "server error" });

  return json(200, { ok: true });
});
