-- スイカゲーム ランキングテーブル定義
-- Supabase の SQL Editor に貼り付けて実行する(手順は supabase/README.md)
-- セキュリティ方針は docs/SECURITY.md に従う

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  nickname text not null check (char_length(nickname) between 1 and 12),
  score integer not null check (score > 0 and score <= 100000),
  ip_hash text, -- レート制限用(IPのハッシュ。生IPは保存しない)
  created_at timestamptz not null default now()
);

-- ランキング取得用インデックス
create index scores_score_desc_idx on public.scores (score desc);

-- RLS: 読み取りのみ公開。INSERT/UPDATE/DELETE のポリシーは作らない
-- (= 匿名キーでは書き込めない。書き込みは Edge Function 内の service role のみ)
alter table public.scores enable row level security;

create policy "ranking_read_only"
  on public.scores for select
  to anon
  using (true);

-- anon に見せる列を制限(ip_hash は外部に出さない)
revoke select on public.scores from anon;
grant select (nickname, score, created_at) on public.scores to anon;
