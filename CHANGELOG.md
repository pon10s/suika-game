# CHANGELOG.md — 変更履歴

> 新しいものを上に追記する。

## 2026-06-11

- **F6完了**: オンラインランキングをゲームに統合。ranking.js 新規(トークン取得・送信・TOP20取得・textContent描画)、ゲームオーバー画面にニックネーム送信フォーム、「🏆ランキングを見る」ボタン+TOP20モーダル追加。検証:実送信→1位表示OK、悪意あるニックネーム(<img onerror>)がHTML注入されないことを実地確認、0点時はフォーム非表示。テストデータ削除済

- **F5完了**: 朱音さんのアクセストークンを借りてManagement APIでセットアップを実行 — ①schema.sql実行(テーブル+RLS) ②Edge Function submit-score デプロイ(verify_jwt=off) ③Secrets設定(PLAY_TOKEN_SECRET / ALLOWED_ORIGIN=*)。検証:anon読み取りOK・anon直接INSERT拒否(RLS)・不正値4種拒否・正常送信OK・レート制限(60秒3回)発動OK・日本語ニックネーム保存OK。テストデータは削除済み。⚠️F7完了後にアクセストークンをRevokeすること

- **F5進行**: Supabaseプロジェクト作成(朱音さん)。anonキー受領・REST接続確認OK(scoresテーブルは未作成で404=想定どおり)。src/js/config.js を新規作成(URL+anonキー。anonキーは公開前提)

- **F5準備**: Supabase側のコードを事前作成 — schema.sql(scoresテーブル+RLS読み取り専用+列制限)、Edge Function submit-score(プレイトークン発行/署名検証/スコア・ニックネーム検証/IPハッシュのレート制限)、朱音さん向けセットアップ手順書(supabase/README.md)。デプロイはアカウント作成後

- **表情の個性づけ**(朱音さん要望): 目を離し気味に調整し、7種類の表情(にっこり/元気に笑ってる/いたずらっこ/ちょっとおこ/ほんわか/すねてる/てれてれ)を11フルーツに割り当て(fruits.js: drawFace)。割当表は DESIGN.md
- **F4**: ベストスコアを localStorage に保存(storage.js 新規)。ベスト超過時に即保存、リロード後も保持されることを確認済み

- **F3**: UI仕上げ。①全フルーツに顔(目・口・ほっぺ・ハイライト、スイカは縞)を追加 — 描画は fruits.js の drawFruitShape() に共通化。②HUDに「つぎ」(ネクスト)表示。③箱の下に「しんかの順番」リスト。④ヘッダーをタイトル上段+カード下段に再構成(重なり解消)。⑤スマホ幅(375px)で表示確認。DESIGN.md を「顔つき」に更新(朱音さん要望)
- **バグ修正**: 落とした直後のフルーツ(箱の上に出現・初速ほぼ0)が上限ライン超えと誤判定されゲームオーバーが誤発動することがあった → 「一度何かに着地したフルーツのみ判定対象」に修正(game.js: hasLanded)

- **点数修正**: 朱音さん提供の本家点数表に合わせ、「合体でできたフルーツの作成時スコア」方式に変更(さくらんぼ0点〜スイカ55点)。REQUIREMENTS.md と fruits.js を更新
- **F2**: 合体・スコア加算・ゲームオーバー判定(上限ライン超え1.5秒)・ゲームオーバー画面とリスタートを実装(game.js / main.js / index.html / style.css)。プレビューで合体・点数・スイカ消滅ボーナス・ゲームオーバー・リスタートを検証済み
- 既知の課題: 狭い画面でヘッダーのタイトルとスコアカードが重なる → F3で対応

## 2026-06-10

- **F1**: ゲーム骨格を実装(src/index.html, css/style.css, js/fruits.js, js/game.js, js/main.js)。Matter.js 0.20.0 を src/lib/ に同梱。箱の描画・フルーツの左右移動・クリック/タップ落下・積み上がりまで動作確認済み(合体・スコアはF2)
- **F0**: プロジェクト基盤を作成(CLAUDE.md / REQUIREMENTS.md / docs/PHASES.md / docs/DESIGN.md / docs/SECURITY.md / CHANGELOG.md)
