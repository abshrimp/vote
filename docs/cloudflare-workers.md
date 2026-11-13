# Cloudflare Workers へのデプロイ

このリポジトリは Next.js の動的 API を使うため、`next build` の `.next` をそのまま `wrangler deploy` することはできません。OpenNext アダプターで Cloudflare Worker に変換します。

## Workers Builds の設定

Cloudflare Dashboard → Workers & Pages → `mf56-vote` → Settings → Builds にて次の値に変更してください。

- **Build command**: `npm run cf:build`
- **Deploy command**: `npm run cf:deploy`
- **Root directory**: `/`（リポジトリのルート）
- **Node.js**: 22以上（ビルドログの24.18.0で問題ありません）

`npm run build` と `npx wrangler deploy` の組み合わせは使用しないでください。前者は Next.js のビルドだけで、Worker のエントリーポイントを作成しません。後者は未設定時に対話式の自動移行を開始する場合があります。

`wrangler.jsonc` に `.open-next/worker.js` と `.open-next/assets` を設定済みです。`nodejs_compat` も有効にしています。

## 環境変数・シークレット

Cloudflare の実行時環境に次を設定してください。

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `VOTE_HMAC_SECRET`
- `TURNSTILE_SECRET_KEY`
- `TURNSTILE_ALLOWED_HOSTNAMES`
- `VOTE_MATCH_MODE`（既定は `block`。共有Wi-Fi環境で誤判定する場合は `monitor`）
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_ADMIN_EMAILS`

公開鍵 `NEXT_PUBLIC_TURNSTILE_SITE_KEY` は **ビルド時の環境変数** にも設定してください。Next.js がビルド時にブラウザ用JavaScriptへ埋め込むためです。シークレットはソースコードや `wrangler.jsonc` に書き込まないでください。

Turnstile の許可ホスト名には実際の `*.workers.dev` や独自ドメインを登録し、`TURNSTILE_ALLOWED_HOSTNAMES` にも同じホスト名を設定します。複数環境がある場合はホスト名の設定を確認してください。

## ローカルでの確認

```sh
npm ci
npm run check
npm run cf:build
npm run cf:preview
```

Cloudflare 側でデプロイ後は `/` と `/admin` を開き、新規Tursoデータベースへの接続・Google管理者ログイン・Turnstile認証・実際の投票を確認してください。

DBの初期化には、空のTursoデータベースに対して `node --env-file=.env.local scripts/setup-db.mjs` を実行します。`db/schema.sql` 以外のDB定義や移行処理はありません。OpenNext への変換が成功しても、Turso やシークレットの設定不足があればAPIは動きません。

## npm audit の警告

ログの脆弱性6件（criticalを含む）はデプロイ失敗とは別の問題です。`npm audit --omit=dev` と `npm audit` で該当パッケージと修正版を確認し、依存関係を更新して再テストしてください。`npm audit fix --force` を無条件で実行することは避けてください。
