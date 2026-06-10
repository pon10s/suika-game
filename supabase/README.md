# Supabase セットアップ手順(F5)

> 朱音さん向けの手順書。わからないところがあったらAIに聞いてください。

## 1. アカウントとプロジェクトを作る(朱音さんの操作)

1. https://supabase.com を開いて「Start your project」→ GitHubアカウントかメールで登録(無料・クレジットカード不要)
2. 「New project」でプロジェクトを作成
   - Name: `suika-game` など好きな名前
   - Database Password: 自動生成でOK(どこかにメモ)
   - Region: `Northeast Asia (Tokyo)` を選ぶ
3. 作成できたら、左メニュー「Project Settings → API」を開き、次の2つをAIに教える
   - **Project URL**(`https://xxxx.supabase.co`)
   - **anon public キー**(公開してよいキー。これは教えてOK)
   - ⚠️ **service_role キーは絶対に教えない・どこにも貼らない**(AIにもチャットにも)

## 2. テーブルを作る(朱音さんの操作)

1. 左メニュー「SQL Editor」→「New query」
2. このフォルダの `schema.sql` の中身を全部コピーして貼り付け、「Run」
3. エラーなく終わればOK

## 3. Edge Function を配置する(AIと一緒に)

`functions/submit-score/index.ts` をデプロイする。ダッシュボードから:

1. 左メニュー「Edge Functions」→「Deploy a new function」→ エディタで作成を選び、
   名前を `submit-score` にして index.ts の中身を貼り付けてデプロイ
2. 「Edge Functions → submit-score → Details」で「Verify JWT」を**オフ**にする
   (ログインなしで呼ぶため。検証は関数内のトークンで行う)
3. 「Project Settings → Edge Functions → Secrets」で環境変数を2つ追加:
   - `PLAY_TOKEN_SECRET`: 長いランダム文字列(AIが生成したものを使う)
   - `ALLOWED_ORIGIN`: 公開前は `*`、GitHub Pages公開後にそのURLへ変更(F7)

## 4. 動作確認(AIがやる)

- 正常なスコアが保存される/TOP20が取得できる
- 不正値(負数・巨大スコア・13文字以上の名前・トークンなし)が拒否される
- anon キーで直接 INSERT/DELETE できないことを確認
