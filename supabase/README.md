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

---

## 追加(証跡画像 ⑥):クリア画面スクショをランキングに表示

> すでに F5 でテーブル・関数を作成済みの場合の **差分手順**。これをやらないと画像は保存・表示されません。
> (この移行をする前に新コードを公開しても、ランキング一覧は今までどおり動きます=安全)

### A. テーブルに列を追加(朱音さんの操作)

1. 「SQL Editor」→「New query」
2. 次を貼り付けて Run(`schema.sql` の末尾「既存DBへの移行」と同じ内容):

   ```sql
   alter table public.scores add column if not exists shot text;
   revoke select on public.scores from anon;
   grant select (nickname, score, created_at, shot) on public.scores to anon;
   ```

### B. Edge Function を更新(朱音さんの操作)

1. 「Edge Functions → submit-score」を開き、`functions/submit-score/index.ts` の**最新の中身**で上書きデプロイ
   (証跡画像の検証＋保存が追加されている)

### C. 動作確認(AIがやる)

- 画像つきで送信→ TOP20 にサムネが出る/タップで拡大できる
- 画像なし・壊れた画像・巨大画像の送信が拒否される(invalid shot / shot too large)
- 画像が無い古いデータも一覧で普通に表示される(サムネ無しで崩れない)

### モデレーション(覚えておくこと)

- 画像はゲーム画面の**自動キャプチャ**なので通常は安全。ただしAPIに細工した画像を直接送られる残留リスクはゼロではない。
- 万一おかしな画像・記録が出たら、Supabaseダッシュボードの「Table Editor → scores」で該当行を削除すればOK。
