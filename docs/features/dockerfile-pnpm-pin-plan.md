# Dockerfile の pnpm バージョン固定とフォールバック削除 — 実装指示書

> 作成日: 2026-10-29 ／ 作成: Claude（プラン・レビュー担当）／ 実装: CodeX
>
> **実装者向け原則**: この指示書に書かれていない抽象化・依存・ファイルを追加しない。迷ったら最小を選び、判断を指示書作成者に差し戻す。
>
> 起点: **実装時点の `main`**（2026-10-29 時点では eaee00a）から作業ブランチを切る。§2 の調査は c565f99 時点のものだが、それ以降の変更は web の next 更新と lockfile だけで、Dockerfile には影響しない。

## 1. 背景と目的

- 【確認済】`apps/api/Dockerfile` と `apps/web/Dockerfile` は、どちらも2行目で `corepack prepare pnpm@latest --activate`、9行目で `RUN pnpm install --frozen-lockfile || pnpm install` を使っている。
- 【確認済】2026-10-29 の next 16.4.3 更新時の Docker ビルドでは、`pnpm@latest` が **pnpm 12.16.1** を取ってきた。ローカル開発は **pnpm 11.5.0**（corepack キャッシュ `%LOCALAPPDATA%\node\corepack\v1\pnpm\11.5.0`、メインチェックアウトの `node_modules/.modules.yaml` に `"packageManager": "pnpm@11.5.0"`）。
- 問題は2つある。
  1. **本番ビルドが pnpm のメジャー更新に知らないうちについていく**。今回は frozen install がたまたま通っただけ。
  2. **`|| pnpm install` のフォールバック**があるので、frozen install が失敗しても lockfile を作り直してビルドが成功してしまう。その結果、レビュー済みの lockfile と違う依存でイメージが作られうる。
- これは 2026-10-28 のセキュリティチェックで出て未着手だった指摘（Dockerfile 関連）のうちの1件。

**目的**: 2つの Dockerfile で pnpm を **11.5.0 に固定**し、フォールバックを削除して **frozen install が失敗したらビルドも失敗する**ようにする。

## 2. pnpm バージョンに依存している箇所（調査結果）

リポジトリ全体を `packageManager|pnpm@|corepack|frozen-lockfile|lockfileVersion` で grep して確認した（2026-10-29、commit c565f99 時点）。

| # | 場所 | 現状 | pnpm バージョンとの関係 | 本タスクでの扱い |
|---|------|------|------------------------|------------------|
| 1 | `apps/api/Dockerfile:2` | `corepack prepare pnpm@latest --activate` | ビルド時の pnpm バージョンを決める。**固定されていない** | **変更**（`pnpm@11.5.0` に） |
| 2 | `apps/web/Dockerfile:2` | 同上 | 同上 | **変更**（`pnpm@11.5.0` に） |
| 3 | `apps/api/Dockerfile:9` | `pnpm install --frozen-lockfile \|\| pnpm install` | フォールバックで lockfile チェックを素通りできる | **変更**（`\|\| pnpm install` を削除） |
| 4 | `apps/web/Dockerfile:9` | 同上 | 同上 | **変更**（同上） |
| 5 | ルート `package.json` の `packageManager` | 【確認済】**このフィールドは無い**。`apps/*`・`packages/*` の `package.json` にも無い | あれば corepack が自動でそのバージョンを使う。無いので Dockerfile 側で明示する必要がある | 変更しない（§6 スコープ外） |
| 6 | ルート `package.json` の `engines.pnpm` | `">=10.0.0"` | 下限だけ。11.5.0 も 12.x も満たすので固定の役には立たない | 変更しない |
| 7 | ルート `package.json` の `"pnpm".onlyBuiltDependencies` | 5パッケージを列挙 | 【確認済・既存指示書の記録】pnpm 11 はこのフィールドを読まない（WARN が出る）。実際に効いているのは #8 の `allowBuilds` | 変更しない（`dependency-security-update-plan.md` で別タスク扱い済み） |
| 8 | `pnpm-workspace.yaml` | `packages` / `allowBuilds` / `overrides` | `allowBuilds` は pnpm 11 の書き方。【推定】pnpm 10 より前に戻すと効かない。11.5.0 に固定すれば、いまローカルで効いている設定がそのまま Docker でも効く | 変更しない |
| 9 | ルート `pnpm-lock.yaml:1` | `lockfileVersion: '9.0'` | pnpm 9〜11 で共通の形式。ローカル 11.5.0 で作られている。frozen install はこのファイルと各 `package.json` / `pnpm-workspace.yaml` の `overrides` が一致しないと失敗する | 変更しない |
| 10 | `apps/web/pnpm-lock.yaml:1` | `lockfileVersion: '9.0'`（6226行、commit 44d5389 で追加されて以降は更新なし） | 【確認済】`COPY apps/web/ apps/web/` でイメージに入る（`.dockerignore` で除外されていない）。【推定】ワークスペースのインストールはルートの lockfile だけを使うので、このファイルはビルドに影響しない | 変更しない（§6 スコープ外。不要なら別タスクで削除） |
| 11 | `.dockerignore` / `docker-compose.yml` / CI 設定 | pnpm の記述は無い。CI 設定（`.github/workflows` 等）は無い | 無し | 変更しない |

**結論**: pnpm のバージョンを決めているのは #1・#2 だけ。変更するファイルは2つの Dockerfile だけでよい。

## 3. 変更内容

### 3.1 `apps/api/Dockerfile`

```diff
 FROM node:22-alpine AS builder
-RUN corepack enable && corepack prepare pnpm@latest --activate
+RUN corepack enable && corepack prepare pnpm@11.5.0 --activate
 WORKDIR /app
 ...
-RUN pnpm install --frozen-lockfile || pnpm install
+RUN pnpm install --frozen-lockfile
```

### 3.2 `apps/web/Dockerfile`

上と同じ2行を同じように変える。

### 3.3 write-set

| ファイル | 変更 |
|----------|------|
| `apps/api/Dockerfile` | 2行目と9行目の2行だけ |
| `apps/web/Dockerfile` | 2行目と9行目の2行だけ |
| それ以外 | **変更しない**（`package.json`・`pnpm-workspace.yaml`・lockfile も含む） |

## 4. 守ること（不変条件）

- `pnpm install` の行は `--frozen-lockfile` だけにする。`||`・`; true`・`--no-frozen-lockfile`・`--fix-lockfile` などで**失敗を握りつぶす書き方を入れない**。
- バージョンは `11.5.0` と完全に書く。`pnpm@11`・`pnpm@^11`・`pnpm@latest-11` は使わない（マイナー更新にもついていってしまうため）。
- 2つの Dockerfile で**同じバージョン**にする。
- 検証が終わったら、§5 の No.5 でわざと変えたファイルを必ず元に戻す（`git status` が Dockerfile 2つの変更だけになっていること）。
- 開発用 DB（`sinmirai-postgres` コンテナ、5433）には接続しない。検証用のコンテナは終わったら消す（§5 の No.3）。
- Docker の `--no-cache` ビルドは C: の空きを使う。ビルドの前に空き容量を確認し、足りなければ `docker builder prune` で空ける（過去に C: が満杯になって Docker デーモンごと落ちたことがある）。

## 5. 検証

ビルドは必ず `--progress=plain --no-cache` で行い、ログをファイルに保存する（例: `docker build ... 2>&1 | tee build-api.log`）。ログは `.gitignore` に入っていない場所に作るとコミットに混ざるので、リポジトリの外かスクラッチ領域に置く。

| No | 内容 | 合格条件 |
|----|------|----------|
| 1 | api をビルド: リポジトリのルートで `docker build --progress=plain --no-cache -f apps/api/Dockerfile -t sinmirai-api:pnpm-pin .` | ビルドが成功し、ログで次の2点を確認する。① `corepack prepare` の段に `pnpm@11.5.0` が出ている ② `pnpm install --frozen-lockfile` の段に `ERR_PNPM` が1行も無く、**`Done in ... using pnpm v11.5.0` の行がある**（pnpm のバージョンはこの行で判定する。ほかのパッケージの版番号と紛れるので、`12.` などの文字列検索では判定しない）。①②の抜粋を報告に貼る |
| 2 | web をビルド: `docker build --progress=plain --no-cache -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=http://localhost:3000 -t sinmirai-web:pnpm-pin .` | No.1 の①②と同じ |
| 3 | No.1 のイメージを起動する。**接続先は検証専用の使い捨て PostgreSQL コンテナにする**。開発用 DB（`sinmirai-postgres`、5433）には繋がない（理由は下記）。<br>例: `docker run -d --name pnpm-pin-pg -e POSTGRES_PASSWORD=<その場で作った使い捨ての値> -p 5434:5432 postgres:15-alpine` で別ポートに立て、api コンテナには `-e DATABASE_URL=postgresql://postgres:<同じ値>@host.docker.internal:5434/postgres` と、起動に要る最小の環境変数（`JWT_SECRET` などのテスト用ダミー値）だけを渡す。`apps/api/.env` は渡さない。<br>終わったら api コンテナと `pnpm-pin-pg` を `docker rm -f` で消す | 起動ログに `prisma migrate deploy` と seed の成功が出て、`curl -i http://localhost:<公開ポート>/api/health` が **200** |
| 4 | No.2 のイメージを起動する | `curl -i http://localhost:<公開ポート>/login` が **200** |
| 5 | **lockfile が合わないとビルドが失敗すること**: `apps/api/package.json` の `dependencies` に、lockfile に無い依存を1つ足す（例: `"is-number": "7.0.0"`）。lockfile は**更新しない**。その状態で No.1 と同じコマンドで api をビルドする。終わったら `git restore apps/api/package.json` で元に戻す | ビルドが `pnpm install --frozen-lockfile` の段で**失敗して止まる**（`ERR_PNPM_OUTDATED_LOCKFILE` が出る）。その後の段（`prisma generate` など）に進んでいない。エラーの抜粋を報告に貼る |
| 6 | No.5 を元に戻したあとで `git status` と `git diff` | 変更は `apps/api/Dockerfile` と `apps/web/Dockerfile` の各2行だけ |

No.3 で使い捨ての DB にする理由:
- api イメージの CMD は、起動のたびに `prisma migrate deploy && node seed-prod.js` を実行する。
- 開発用 DB に繋ぐと、開発用 DB に本番用の初期データ（管理者など）が書き込まれてしまう。
- `.env` を渡すと実際の秘密値がコンテナに入る。環境変数の値は、ログにも報告にも出さない（`docker inspect` や `env` の出力を貼らない）。

No.1 で frozen install が失敗した場合の原因候補（参考）:
- api の Dockerfile は `apps/web/` をコピーしない。そのため、ルートの lockfile にある web 側の importer がイメージ内に存在しない。
- 2026-10-29 の確認では、web イメージ（`apps/api/` をコピーしない）の frozen install は成功しているので、同じ形なら通る見込み。
- ただし、これまでの api のビルドはフォールバックで通っていた可能性もある。失敗したら Dockerfile を直して通そうとせず、ログの抜粋を付けて止めて報告する。

No.5 は api だけでよい（2つの Dockerfile の install の行は同じなので）。web でも確かめる場合は `apps/web/package.json` で同じように行い、必ず元に戻す。

## 6. スコープ外（やらないこと）

- ルート `package.json` に `packageManager` を追加すること。ローカル開発にも影響する（corepack が強制する）ので別の判断になる。必要なら別タスク。
- pnpm 12 への更新。
- `package.json` の `"pnpm".onlyBuiltDependencies` の整理（既存の別タスク）。
- `apps/web/pnpm-lock.yaml`（使われていないと思われる lockfile）の削除。
- ベースイメージ `node:22-alpine` のタグや digest の固定、Dockerfile の他の行（`COPY pnpm-lock.yaml*` のワイルドカード、`npx prisma generate` など）の書き換え。
- Swagger・CORS など、セキュリティチェックで出た他の指摘。
- ECR への push・ECS へのデプロイ・git push。

## 7. 完了報告に含めるもの

- `git diff`（Dockerfile 2つ、各2行）
- §5 の No.1〜6 の結果と、No.1・No.2・No.5 のログ抜粋
- 合格しなかった項目があれば、その時点で止めて報告する（Dockerfile に上の範囲を超える手を入れて通そうとしない）

## 8. デプロイについて（参考・本タスクの対象外）

本番に出すのは、次に api か web を本番デプロイするときでよい。そのときは、デプロイ前に稼働中のタスク定義リビジョンを `describe` で確認する（リビジョンを決め打ちしない）。
