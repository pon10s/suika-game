// Supabase 接続設定
// anon キーは「公開してよい」前提のキー(RLSで保護。docs/SECURITY.md 脅威3・5参照)
// ⚠️ service_role キーは絶対にここに書かない
const SUPABASE_URL = "https://aspdmvotqzjxfbilccyd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcGRtdm90cXpqeGZiaWxjY3lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDE1OTUsImV4cCI6MjA5NjY3NzU5NX0.GuYxF7CU8BZ3n_YRKi2JU1zvnLGhXP8QsQLOSlimGCA";
const SUBMIT_SCORE_URL = SUPABASE_URL + "/functions/v1/submit-score";
