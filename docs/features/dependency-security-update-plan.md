# 依存パッケージのセキュリティ更新（critical/high 解消）— 実装指示書

作成: 2026-10-28 / 実装担当: CodeX / レビュー: Claude

> **実装者向け原則**: この指示書に書かれていない依存の追加・メジャー更新・コード変更を行わない。
> 迷ったら最小を選び、判断を指示書作成者に差し戻す。

## 0. 背景と目的

`pnpm audit --prod`（2026-10-28 実行）で本番依存に **critical 6 / high 47 / moderate 49 / low 9** を検出。
本タスクは **critical と、API 実行時に到達しうる high** を、**メジャー更新なし**で解消する。

### 主な検出（high/critical のみ・パッケージ単位）【確認済】

| 重大度 | パッケージ | 経路 | 修正版 |
|---|---|---|---|
| critical | `next` 16.2.6 | web 直接 | >=16.2.11（Middleware バイパス / Server Action DoS） |
| critical | `proxy-addr` | api: `@nestjs/core`・`platform-express`・`swagger`・`terminus` | >=2.0.8 |
| high | `multer`・`body-parser`・`path-to-regexp` | api: `@nestjs/*` | 各 patched |
| high | `lodash` | api: `@nestjs/config`・`@nestjs/swagger` | >=4.17.24 |
| high | `js-yaml` | api: `@nestjs/swagger`、web: `shadcn` | >=4.3.0 |
| high | `deepmerge-ts` | api: `@prisma/client`・`@nestjs/terminus` | >=8.0.0 |
| high | `postcss`・`nanoid`・`browserslist`・`source-map-js` | web: `next` | 各 patched |
| high | `sharp` | web: `next`（optional） | >=0.35.0 |
| high | `hono`・`@modelcontextprotocol/sdk`・`zod`・`fast-uri`・`ip-address`・`brace-expansion` 他 | web: **`shadcn` のみ** | — |

### 調査で確認した事実【確認済】
- `shadcn` は CLI。参照は `apps/web/components.json` の `$schema` だけで、`src` からの import も CSS の `@import` もない（`globals.css` は `tailwindcss` と `tw-animate-css` のみ）。→ **`devDependencies` へ移すだけで本番依存から消える**。
- web の Dockerfile は `pnpm install`（dev 込み）→ `next build` → **standalone 出力だけを runner にコピー**する構成。shadcn を dev に移してもビルドは壊れない。
- NestJS 11 系の最新は `@nestjs/core`/`common`/`platform-express` **11.2.8**、`@nestjs/swagger` **11.4.7**、`@nestjs/config` **4.0.4**、`@nestjs/terminus` **11.1.1**。`platform-express@11.2.8` の依存は `express 5.2.1`・`multer 2.4.0`・`path-to-regexp 8.4.2`（いずれも patched 以上）。
- `next@16.2.12` は 16.2 系の最新。依存は `postcss` を **8.4.31 固定**、`sharp` は `^0.34.5`。→ **next 更新だけでは postcss/sharp が残る**。
- `next/image` はソースで使われていない（サムネイルは素の `<img>`。`middleware.ts` の matcher に `_next/image` の文字列があるだけ）。
  ただし `next.config.ts` に `images` 設定が無いので、**画像最適化エンドポイント `/_next/image` は既定で有効**で、middleware の対象外でもある。`apps/web/public` は空。
  → 「使っていないから到達しない」とは言えない。§1-1 で最適化を無効にし、§3 で無効化を確認する。
- `deepmerge-ts`（7.1.5）の経路は `@prisma/client` → `prisma` → `@prisma/config` の1本だけ（`pnpm why` で確認）。Prisma CLI の設定ローダーで、本番では起動時の `prisma migrate deploy` が使う。入力はリポジトリ内の設定で、HTTP リクエストの値は入らない。
- pnpm は 11 系（Dockerfile は `pnpm@latest`）。pnpm 11 は `package.json` の `"pnpm"` フィールドを読まない（実行時に WARN が出る）。ビルド許可は `pnpm-workspace.yaml` の `allowBuilds` に設定済み。

## 1. 変更内容

### 1-1. web（`apps/web/package.json`）
| 変更 | 内容 |
|---|---|
| `next` | `16.2.6` → `16.2.12`（完全一致指定は維持） |
| `eslint-config-next`（dev） | `16.2.6` → `16.2.12`（next と揃える） |
| `shadcn` | `dependencies` から `devDependencies` へ移動（バージョンは `^4.8.3` のまま） |
| `apps/web/next.config.ts` | `images: { unoptimized: true }` を追加（使っていない画像最適化を止め、sharp に入力が渡る経路を断つ） |

### 1-2. api（`apps/api/package.json`）— 11 系の範囲内だけで上げる
| パッケージ | 変更後 |
|---|---|
| `@nestjs/common` / `@nestjs/core` / `@nestjs/platform-express` | `^11.2.8` |
| `@nestjs/testing`（dev） | `^11.2.8`（core と揃える） |
| `@nestjs/swagger` | `^11.4.7` |
| `@nestjs/config` | `^4.0.4` |
| `@nestjs/terminus` | `^11.1.1`（据置で可） |

### 1-3. lockfile 更新と残存確認
1. `pnpm install` で lockfile を更新する（上記の範囲指定に合わせて解決させる）。
2. `pnpm audit --prod` を再実行する。
3. **critical / high が残った場合だけ**、`pnpm-workspace.yaml` に `overrides:` を追加する。条件は次のとおり。
   - 追加してよいのは **同一メジャー内**の修正版へ上げるものだけ（例: `postcss` 8.4.31 → `^8.5.12`、`lodash` → `^4.17.24`、`proxy-addr` → `^2.0.8`）。
   - **メジャーが変わるもの（`deepmerge-ts` 7→8、`sharp` 0.34→0.35 など）は override しない**。§4 の残存として報告する。
   - `package.json` の `"pnpm"` フィールドには書かない（pnpm 11 は読まない）。
4. override を足した場合は、各行の上に「どの advisory への対策か」をコメントで1行残す。
5. override を足した場合は、**もう一度 `pnpm install` を実行して、lockfile とインストール済みの依存を更新する**。そのうえで `pnpm audit --prod --json` を再実行し、§3 の完了判定にはこの結果を使う（設定ファイルに書いただけでは、変更後の依存を検証したことにならない）。
   - `pnpm-lock.yaml` の差分に、override した package の新しい版が載っていることも確認する。
   - §3 のビルド・テスト・Docker の検証は、すべてこの再インストール後の状態で行う。

## 2. 不変条件（禁止事項）
- **メジャー更新をしない**: NestJS 12、Prisma 7、class-validator 0.15、React 19.3、next 16.3 以降は対象外。
- アプリのソースコード（`src/` 配下）を変更しない。ビルドやテストが通らなくなった場合は、ソースで回避せずに報告して止める。
- `pnpm audit --fix` による一括 override は使わない（メジャー跨ぎを含みうるため）。
- 対象外の依存（AWS SDK・lucide-react など）は、ついでに上げない。

## 3. 検証（完了条件）
すべて観測できる結果で判定する。

| # | 確認 | 期待 |
|---|---|---|
| 1 | `pnpm audit --prod --json` | **critical 0**。残った high が **§4 の表と package・経路まで完全に一致**すること。表に無い high が1件でもあれば完了とせず、報告して判定を保留する |
| 2 | `pnpm --filter @sinmirai/shared build && pnpm --filter @sinmirai/api build` | 成功 |
| 3 | `pnpm --filter @sinmirai/api test` | 既存テストが全件成功（件数は実行前後で同じ） |
| 4 | `pnpm --filter @sinmirai/web build` | 成功。standalone 出力が生成される |
| 5 | api の Docker イメージをビルドしてローカルで起動 | `/api/health` が 200。`/api/auth/login` が誤った認証情報で 401 を返す（multer/body-parser/express 更新の回帰確認） |
| 6 | web の Docker イメージをビルドしてローカルで起動 | `/login` が 200。未ログインで `/` にアクセスすると `/login` へリダイレクトされる（middleware の回帰確認） |
| 7 | `pnpm why -r shadcn --prod` | 何も出力されない |
| 8a | ビルド済みの設定: web コンテナ内で `node -e "console.log(require('/app/apps/web/.next/required-server-files.json').config.images.unoptimized)"` | `true` と出力される（パスが違う場合は standalone 出力の中の `required-server-files.json` を探して使い、そのパスを報告する） |
| 8b | web コンテナ内で Node.js の fetch を使う（runner は `node:22-alpine` で curl が入っていないため）: `node -e "fetch('http://localhost:3000/_next/image?url=%2Ffavicon.ico&w=64&q=75').then(r=>{console.log(r.status)},e=>{console.error('FETCH_FAILED',e.message);process.exit(1)})"` | **`404`** と出力される。`url` には実在する `/favicon.ico` を使う（存在しないパスだと、最適化が有効でも取得失敗で 200 以外になり、無効化の証明にならない） |
| 9 | 管理画面のコンテンツ詳細 | サムネイル（`<img>`）が今までどおり表示される |

8a・8b の判定ルール:
- 8a と 8b の**両方を満たしたときだけ合格**。
- 8b で `FETCH_FAILED` が出た場合（終了コードが 0 以外）は、通信失敗なので**検証失敗**として扱う。合格にも不合格にもせず、原因を報告する。
- 404 以外（200・400 など）が返ったら、最適化が止まっていない可能性がある。報告して止める。
- 根拠【確認済】: `next/dist/server/next-server.js`（16.2.6、197〜200行）では、`images.unoptimized` が true だとパラメータ検証より前に `render404` を返す。

完了報告には、**更新前後の audit 件数（重大度別）**、**残存 high の一覧と理由**、追加した override（あれば全行）を含めること。

## 4. 残ってよいもの（許容リスト・別タスク扱い）
許容するのは**次の表に挙げた2件だけ**。表に無い high が残った場合は、パッケージ名・advisory・経路・解消に必要なメジャーを報告し、override はせずに判定を指示書作成者へ差し戻す（完了扱いにしない）。

| package | 経路（これ以外の経路で出たら許容外） | 許容理由 | 条件 |
|---|---|---|---|
| `sharp` | `@sinmirai/web` → `next`（optional） | 修正版 0.35 は semver 上の破壊的変更。§1-1 で画像最適化を無効にし、入力経路を断つ | §3 の 8a・8b が両方合格した場合だけ許容 |
| `deepmerge-ts` | `@sinmirai/api` → `@prisma/client` → `prisma` → `@prisma/config` | 修正版 8.x はメジャー更新。使われるのは Prisma CLI の設定ローダーだけで、リクエストの値は入らない | Prisma 7 移行（別タスク）で解消 |

- moderate / low: 本タスクの対象外。

## 5. スコープ外（やらないこと）
- NestJS 12 / Prisma 7 などのメジャー移行。
- Dockerfile の `pnpm@latest` 固定化と、`--frozen-lockfile || pnpm install` のフォールバック撤去。
  lockfile と食い違ったまま黙ってインストールされる問題はあるが、本タスクでは触らない（別タスク候補）。
- ルート `package.json` に残っている `"pnpm".onlyBuiltDependencies` の整理（pnpm 11 では無視され、`allowBuilds` が効いている）。
- API のレート制限・リフレッシュトークン失効など、セキュリティチェックで見つかったコード側の指摘（別の指示書で扱う）。

## 6. デプロイ
- api・web とも再ビルドと再デプロイが必要。手順は `docs/features/node-22.23.4-security-redeploy.md` を使うが、**次の2箇所は差し替える**（旧手順は「コードは変えずにベースイメージだけ更新する」前提で書かれているため）。それ以外（`--pull` ビルド、ローカル検証、push、受け入れ確認）はそのまま使う。

**差し替え1: 旧 §1-5「作業ツリーを本番と同じコミットにする」**
→ **本タスクの変更をコミットし、§3 の検証が全件通ったコミットをビルドする**。旧コミットへ戻さないこと（戻すと依存更新が消える）。
```bash
git status --short -- apps packages pnpm-lock.yaml pnpm-workspace.yaml   # 何も出ないこと
git log -1 --oneline                                                      # 本タスクのコミットであること
```

**差し替え2: 旧 §2 のロールバック先ダイジェスト**
旧手順は ECR の `:latest` のダイジェストを記録するが、push 済みで未デプロイのイメージがあると稼働中のものと食い違う。**稼働中タスクの実ダイジェスト**を記録する。
```bash
for S in api web; do
  TASK=$(aws ecs list-tasks --region $REGION --cluster $CLUSTER --service-name sinmirai-$S \
    --desired-status RUNNING --query "taskArns[0]" --output text)
  DIGEST=$(aws ecs describe-tasks --region $REGION --cluster $CLUSTER --tasks "$TASK" \
    --query "tasks[0].containers[0].imageDigest" --output text)
  echo "$S running digest=$DIGEST"
  # ロールバック先が ECR に残っていること（消えていればエラーになる＝デプロイ前に止める）
  aws ecr describe-images --region $REGION --repository-name sinmirai/$S \
    --image-ids imageDigest=$DIGEST --query "imageDetails[0].imageDigest" --output text
done
```
- 稼働タスクが複数あるときは、全タスクのダイジェストが同じであることも確かめる（`taskArns[*]` を `describe-tasks` に渡す）。食い違っていれば、デプロイ途中の状態なので着手しない。
- ロールバックの操作（旧 §6）は、ここで記録したダイジェストを使えばそのまま流用できる。
- **タスク定義のリビジョンを決め打ちしない**。デプロイ前に `describe-services` で稼働中のリビジョンを確認する（過去に `:5` を決め打ちして本番を巻き戻した事故あり）。
- 順序: api → web。API の入出力仕様は変わらないので、どちらを先にしても互換性の問題はない。
- デプロイは、ネットワーク接続が許可された状態で行う（隔離セッションでは ECR への push が遮断される）。
