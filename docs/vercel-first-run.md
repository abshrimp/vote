# 初回公開（Vercel / Cloudflare Workers / Turso）

一般投票は `/`、Google管理者ログインは `/admin` です。来場者にGoogleログインは要求しません。

## 1. 新規Tursoデータベースを作る

Tursoダッシュボードで**空のデータベース**を作成し、接続先と認証トークンを控えます。

ローカルの `.env.local`（Git管理対象外）に次を設定します。

```dotenv
TURSO_DATABASE_URL=libsql://YOUR-DATABASE.turso.io
TURSO_AUTH_TOKEN=YOUR_TURSO_TOKEN
```

Node.js 22以降でリポジトリのルートから実行します。

```sh
npm ci
node --env-file=.env.local scripts/setup-db.mjs
node --env-file=.env.local scripts/setup-db.mjs --check
```

`db/schema.sql` が唯一のDB定義で、10テーブル・用途別インデックス・票数集計/公開ID保護トリガーをまとめて作成します。初期化コマンドは**空ではないDBを拒否**します。既存DBの旧テーブルや投票履歴の移行は行いません。再実行で既存DBを壊さないようにしてありますが、投票開始前に必ず `--check` を実行してください。

## 2. TurnstileとGoogle OAuth

Cloudflare TurnstileでManagedウィジェットを作成し、実際の公開ホスト名を登録します。

Google Cloud ConsoleでOAuth 2.0ウェブクライアントを作成し、公開するドメインごとに
`https://YOUR-DOMAIN/api/admin/google/callback` を承認済みリダイレクトURIへ追加します。

VercelとCloudflareに次の環境変数を設定してください。

| 変数 | 説明 |
| --- | --- |
| `TURSO_DATABASE_URL` | Tursoの接続先 |
| `TURSO_AUTH_TOKEN` | Turso認証トークン（非公開） |
| `VOTE_HMAC_SECRET` | `openssl rand -hex 32` で生成した秘密鍵。デプロイ先で統一する |
| `GOOGLE_CLIENT_ID` | OAuthクライアントID |
| `GOOGLE_CLIENT_SECRET` | OAuthクライアントシークレット（非公開） |
| `GOOGLE_ADMIN_EMAILS` | 管理者のGoogleメールアドレス（カンマ区切り） |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile公開キー（ビルド時にも必要） |
| `TURNSTILE_SECRET_KEY` | Turnstile秘密キー |
| `TURNSTILE_ALLOWED_HOSTNAMES` | スキームなしの公開ホスト名（カンマ区切り） |
| `VOTE_MATCH_MODE` | `block`（既定）。誤判定が多ければ `monitor` |

シークレットはソースコードやGitHubへ登録しないでください。

## 3. デプロイ

- Vercel: Framework Preset = Next.js、Build = `npm run build`。
- Cloudflare Workers Builds: Build = `npm run cf:build`、Deploy = `npm run cf:deploy`。
- 両方から同じTurso DBを使う場合、`VOTE_HMAC_SECRET` は必ず同じ値にする。

## 4. 公開前テスト

1. `npm run check` でテスト・TypeScript・Next.jsビルドを確認する。
2. `/admin` へ許可済みGoogleアカウントでログインする。
3. 部門・候補・公開日時とTurnstile設定を確認する。
4. 一つの端末から、設定された票数を超えて投票できないことを検証する。
5. 同じIPの別端末で誤判定が起きないか実機確認する。
6. `/` の表示更新は共通データの30秒キャッシュ分だけ遅れる可能性がある。投票の受付条件はDB側で都度検証する。
7. テスト投票は別のテスト用DBで実施するか、公開前に管理画面で集計をリセットする。

匿名のブラウザ投票だけで厳密な1人1票を保証することはできません。
