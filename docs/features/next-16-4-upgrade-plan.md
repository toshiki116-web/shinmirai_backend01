# next 16.2 → 16.4 移行（残る critical/high の解消）— 実装指示書

作成: 2026-10-29 / 実装担当: CodeX / レビュー: Claude

> **実装者向け原則**: この指示書に書かれていない依存の追加・メジャー更新・コード変更を行わない。
> 迷ったら最小を選び、判断を指示書作成者に差し戻す。
> 起点: **`main` の commit 29cf382**。依存更新（9cdb99a）と API セキュリティ修正（650d938・466586c・93993df）のマージ済み。ここから作業ブランチを切る。
> 本番への反映順（§6）: 先に 29cf382 を api・web 両方デプロイし、本タスクはその後に web だけを出す。

## 0. 背景と目的

前タスクで `next` を 16.2.12 に上げたが、16.2 系の最終版であり、`pnpm audit --prod`（2026-10-29 実行）に **critical 5 / high 6** が残る（moderate 9 / low 2）。
本タスクは `apps/web` の `next` を **16.4.3**（調査時点の `latest`）へ上げ、next 由来の critical/high を全て解消する。

### 残っている next 関連の検出【確認済・`pnpm audit --prod --json`】

| 重大度 | advisory | 内容 | 修正版 |
|---|---|---|---|
| critical | GHSA-673q-mjm6-r5xr | `use cache` 関数（typed array 返却）の RCE | 16.4.1 |
| critical | GHSA-2464-fhr4-w9xw | 画像最適化 API の SVG 経由 RCE | 16.4.1 |
| critical | GHSA-vcvr-r3jv-pc5j | `next/og` ImageResponse の RCE | 16.3.6 |
| critical | GHSA-2xp9-vwfh-vxw4 | 画像最適化 API の AVIF 経由 RCE | 16.3.3 |
| critical | GHSA-p293-qw3h-jr36 | Windows ホストでの RCE | 16.3.3 |
| high | GHSA-p3m5-59mp-jv5r | Server Actions の DoS | 16.4.1 |
| high | GHSA-cjq9-62q9-8jv4 | 画像最適化の SSRF | 16.3.8 |
| high | `sharp`（next の optional）3件 | GHSA-f88m-g3jw-g9cj / rgj7-g3m4-5g8c / wq5f-xc86-pv6w | sharp 0.35.5 |
| high | `deepmerge-ts` | api 側（next と無関係） | 8.x（メジャー） |

→ **全 advisory の修正版の最大値は 16.4.1**。16.3.x 止まりでは GHSA-673q・2464・p3m5 が残るので、**目標は 16.4.1 以上（16.4.3 を指定）**。

### 調査で確認した事実【確認済】
- **試験結果（lockfile のみ更新して `pnpm audit --prod` を実行、作業ツリーは元に戻し済み）**: `next` と `eslint-config-next` を 16.4.3 にすると **critical 5→0、high 6→1、moderate 9→5、low 2→1**。残る high は `deepmerge-ts`（api の `@prisma/client` 経由）の1件だけで、前回指示書 §4 の許容リストにある既知のもの。
- `next@16.4.3` の依存は `postcss` **8.5.23 固定**（16.2.12 は 8.4.31 固定）、`sharp` は `^0.35.5`（16.2.12 は `^0.34.5`）。→ **sharp の advisory 3件は next 更新だけで解消**し、前回 §4 の `sharp` 許容は不要になる。
- 試験では `sharp@0.35.5`・`postcss@8.5.23`・`caniuse-lite`/`baseline-browser-mapping` の更新、`semver@7.8.5` の追加が lockfile に入った。`sharp` の engines は `node >=20.9.0`（runner の `node:22-alpine` で問題なし）。sharp の 0.34→0.35 は 0.x 系なので破壊的変更を含みうるが、`images.unoptimized: true` のため実行時には使われない。確認は Docker のビルドと起動（§3 の5b・5c）で足りる。`pnpm-workspace.yaml` の `allowBuilds.sharp: true` は既に設定済み。
- **override の要否（試験）**: `pnpm-workspace.yaml` の overrides のうち `postcss` / `nanoid` / `browserslist` / `source-map-js` は、外しても audit の結果が変わらなかった。→ ただし本タスクでは**外さず、7件すべて残す**。
  - 理由1: どれも同じメジャー内の下限指定なので、残しても害がない。
  - 理由2: 前タスクで、pnpm 11.5.0 は override の変更を `pnpm install` で lockfile に反映しなかった（`pnpm update -r <pkg>` で初めて反映された）。外すと lockfile の `overrides:` と `pnpm-workspace.yaml` が食い違い、Docker の `--frozen-lockfile` ビルドが失敗するおそれがある。
  - 外しても得はほとんどなく、検証の手間と事故の可能性だけが増えるため。
- `eslint-config-next@16.4.3` の peer は `eslint >=9.0.0`（16.4.0 から ESLint 10 にも対応）。現状 `eslint ^9` のままで問題ない。
- `react` / `react-dom` は現状 19.2.4 固定。next 16.4 は React 19.3 を同梱（App Router は next 内蔵の React を使う）が、`next@16.4.3` の peer は `react ^19.0.0` で 19.2.4 も許容。→ **React は上げない**（§2）。

## 1. 変更内容

### 1-1. web（`apps/web/package.json`）
| 変更 | 内容 |
|---|---|
| `next` | `16.2.12` → `16.4.3`（完全一致指定は維持） |
| `eslint-config-next`（dev） | `16.2.12` → `16.4.3`（next と揃える） |

### 1-2. `pnpm-workspace.yaml`
- **変更しない**。overrides の7件はすべて残す（理由は §0「override の要否」）。

### 1-3. lockfile 更新
1. `pnpm install` で lockfile を更新する。
2. `pnpm-lock.yaml` の差分を確認する。判定基準は次のとおり（一覧に載っているかではなく、**どの経路が動いたか**で判断する）。
   - **api から辿れる既存の依存グラフは、web と共有している依存も含めて一切変えない**。共有依存の例: `semver` は api の `jsonwebtoken` も使っている。
   - web 用に、共有依存の**別バージョンが追加される**のは許容する。例: web 側だけが `semver@7.8.5` を使い、api 側は従来の版のまま。
   - 変わってよいのは、`@sinmirai/web` からだけ辿れる部分。next・eslint-config-next・`@next/*`・sharp と `@img/sharp-*`・postcss・`@swc/helpers`・caniuse-lite・baseline-browser-mapping などがこれにあたる。
   - lockfile 先頭の `overrides:` が7件のまま残っていることを確認する。
3. api の依存グラフが変わっていないことを機械的に確認する。
   - 変更の**前**に `pnpm list -r --filter @sinmirai/api --depth Infinity --json > api-deps-before.json` を実行する（prod と dev の両方）。
   - 変更の**後**に、同じコマンドで `api-deps-after.json` を出力する。
   - 2つの JSON の差分が**空であること**を合格条件とする。1件でも差があれば、止めて差分を報告する。
   - 出力ファイルはワークツリーの外（一時ディレクトリ）に置き、コミットしない。

### 1-4. 変更しないもの（調査済み）
本プロジェクトのソースを 16.2→16.4 の変更点と突き合わせた結果、**コード変更は不要**という見立て。
| 項目 | 現状 | 判断 |
|---|---|---|
| `src/middleware.ts` | `middleware` 規約のまま | Next 16.0 で deprecated（`proxy` へ改名）だが、16.4 のリリースノート・アップグレードガイドに削除の記載なし。**今回は触らない**（`proxy` は nodejs ランタイム固定で挙動が変わるため別タスク）。ビルドログに deprecation の警告が出るかは確認して報告する |
| `next.config.ts` | `output: "standalone"`、`images: { unoptimized: true }` | 変更なし。`images.unoptimized` により `/_next/image` は 404 のまま（§3 の7で確認） |
| `next/image`・`next/legacy/image`・`next/amp`・`revalidateTag`・`unstable_*`・`use cache`・`cacheComponents` | ソース内で未使用（`src` を grep 済み） | 16.x の image 系の既定値変更・Cache Components は影響なし。**`cacheComponents` / `partialPrefetching` / React Compiler などの新機能は有効にしない** |
| `eslint.config.mjs` | flat config、`eslint-config-next/core-web-vitals` と `/typescript` | 16.4.3 でもそのまま使える想定。`pnpm lint` で確認する |
| `tsconfig.json` | `include` に `.next/dev/types/**/*.ts` 済み | 変更なし |
| Tailwind 4 / `@tailwindcss/postcss` | `postcss.config.mjs` で使用 | Turbopack ビルドで動く想定。ビルドで確認する |

### 1-5. 16.3・16.4 の変更点まとめ（影響調査）
出典: nextjs.org の公式ブログ（16.3: 2026-08-03、16.4: 2026-10-06）とアップグレードガイド（version-16）。

| 版 | 変更 | 本プロジェクトへの影響 |
|---|---|---|
| 16.3 | Turbopack のディスクキャッシュが `next build` でも既定で有効（`turbopackFileSystemCacheForBuild`） | `.next/cache` が増える。Docker のビルドは毎回クリーンなので影響小。**ビルドが不安定なら無効化を検討するが、まず既定のまま試す** |
| 16.3 | App Router の SSR が Node.js ネイティブストリームに変更 | コード変更不要。ログイン画面・ダッシュボードの表示で確認 |
| 16.3 | prefetch の束ね（prefetch inlining）、`catchError`、`import.meta.glob`、root params など追加 | 全て opt-in か内部最適化。影響なし |
| 16.3 | `next build` で TypeScript 7 を使える（opt-in） | `typescript ^5` のまま。**上げない** |
| 16.3 | Cache Components・`partialPrefetching`・Rust React Compiler・`useOffline` は opt-in | 有効にしない |
| 16.4 | Turbopack のランタイムを共有チャンク化、CSS Modules のクラス名短縮、export mangling | 出力が変わる。ビルド・画面表示で確認（CSS Modules は未使用の想定） |
| 16.4 | React 19.3 を同梱 | react/react-dom は 19.2.4 のまま（§2） |
| 16.4 | `ensureStatic`・`navigation()`/`prefetch()` API 追加 | 使わない |
| 16.4 | `experimental.agentUpgrade`（既定 `'security'`）が `next dev`/`next build` でアップグレード提案を出す | 副作用なし。ビルドログに出ても無視してよい。**テレメトリ等の設定は触らない** |
| 16.4 | `eslint-config-next@16.4.0` から ESLint 10 に対応 | ESLint は 9 のまま |
| 16.3 以降（第三者情報・未検証） | Turbopack のファイルトレースが 16.2 から変わり、standalone で必要ファイルが欠ける事例の報告あり | **§3 の Docker 起動で必ず検証**（standalone 出力で `/login` が 200 になること） |

> 公式のアップグレードガイドに、16.3・16.4 固有の破壊的変更（削除された API・変更された既定値）の節は見当たらなかった。実際に出る警告・エラーはビルドで確認し、**ソースで回避せず報告して止める**。

## 2. 不変条件（禁止事項）
- **メジャー更新をしない**: Next 17、React 19.3（`react` / `react-dom`）、TypeScript 7、ESLint 10、Tailwind の変更は対象外。
- **`src/` 配下のソースを変更しない**。ビルドや動作確認で問題が出たら、ソースで回避せずに報告して止める。
- `next.config.ts` に新しいオプション（`cacheComponents`・`partialPrefetching`・`reactCompiler`・`experimental.*`）を足さない。
- `middleware.ts` を `proxy.ts` に改名しない（別タスク）。
- `@next/codemod` / `next upgrade` コマンドを**実行しない**（コードを自動書換えするため）。`pnpm add` / 手動編集で指定バージョンにする。
- api 側の依存は触らない。対象外の依存（`shadcn`・`lucide-react` など）をついでに上げない。
- `pnpm audit --fix` を使わない。
- `pnpm-workspace.yaml`（overrides・allowBuilds）を変更しない。

## 3. 検証（完了条件）
すべて観測できる結果で判定する。環境手順は前回指示書 §3 に倣う。
- Windows Git Bash では、node を fnm の v22.23.4 に PATH 設定する（`cygpath -u` で POSIX 形式にしないと無視される）。pnpm は `corepack` 経由で呼ぶ。
- 新しいワークツリーでは `prisma generate` が未実行で、api のビルドが失敗することがある。本タスクの不具合ではない。
- `apps/web/public` は空なので git に入っていない。新しいワークツリーでは web の Dockerfile の `COPY apps/web/public` が失敗する。検証のときは空のディレクトリを手元で作り、**コミットはしない**（`.gitkeep` の追加は本タスクの対象外）。

| # | 確認 | 期待 |
|---|---|---|
| 1 | `pnpm audit --prod --json`（`pnpm install` 後） | **critical 0 / high 1**。残る high は `deepmerge-ts`（`@sinmirai/api` → `@prisma/client` → `prisma` → `@prisma/config`、および `@nestjs/terminus` → `@prisma/client` 経由）の**1件だけ**。表に無い high が1件でもあれば完了とせず報告 |
| 2 | `pnpm why -r next` / `pnpm why -r sharp` | next が `16.4.3` のみ、sharp が `0.35.5` のみ（古い版が残っていないこと） |
| 3 | `pnpm --filter @sinmirai/web build` | 成功。standalone 出力が生成される。**ビルドログの警告・deprecation を全文報告**（`middleware` 関連の警告が出るかを特に記載） |
| 4 | `pnpm --filter @sinmirai/web lint` | 更新前と同じ結果（新規エラーなし）。更新前の件数を先に記録して比較する |
| 5a | ワークツリーの直下で `pnpm install --frozen-lockfile` を実行する（Docker の前に行う） | 終了コード 0。lockfile と package.json・`pnpm-workspace.yaml` が一致していること |
| 5b | web の Docker イメージを `docker build --progress=plain --no-cache` でビルドし、ログを保存する | `RUN pnpm install --frozen-lockfile \|\| pnpm install` の段で、**最初の frozen install が成功していること**。そのログに `ERR_PNPM`（`ERR_PNPM_OUTDATED_LOCKFILE` など）が1行でも出ていたら、後ろの `pnpm install` へ**フォールバックしたものとみなし、合格でも止めて報告する**。その段のログの抜粋を報告に貼る。Dockerfile は変更しない |
| 5c | 5b のイメージをローカルで起動 | `/login` が **200** |
| 6 | 5c のコンテナで、未ログインのまま `/` にアクセス | `/login` へリダイレクト（middleware の回帰確認） |
| 7 | web コンテナ内で Node.js の fetch を使う（runner は curl なし）: `node -e "fetch('http://localhost:3000/_next/image?url=%2Ffavicon.ico&w=64&q=75').then(r=>{console.log(r.status)},e=>{console.error('FETCH_FAILED',e.message);process.exit(1)})"` | **`404`**（`images.unoptimized` が 16.4.3 でも効いていること。`FETCH_FAILED` は検証失敗として原因を報告。200/400 なら最適化が止まっていないので報告して止める） |
| 8 | web コンテナ内で `required-server-files.json` の `config.images.unoptimized` を確認（前回 §3 の 8a と同じ。パスが違う場合は探して報告） | `true` |
| 9 | 管理画面（ログイン後）の主要画面: ダッシュボード・拠点一覧・筐体一覧・コンテンツ詳細 | 画面が表示され、スタイル（Tailwind）が崩れない。サムネイル（`<img>`）が表示される。ブラウザのコンソールにエラーなし。**ログイン情報が無く確認できない場合は「未実施」と明記して報告**（デプロイ後に実施） |
| 10 | api は変更なし | `git diff --stat -- apps/api` が空。api のビルド・テストは実行不要 |

完了報告には、**更新前後の audit 件数（重大度別）**、**残存 high の一覧**、**lockfile の差分で動いた経路（§1-3 の判定結果）**、**api 依存グラフの前後比較の結果（§1-3 の3）**、**frozen install の成否とログの抜粋（§3 の5a・5b）**、**ビルドログの警告**、**lint の更新前後の件数**を含めること。

## 4. 残ってよいもの
許容するのは**次の1件だけ**（前回の `sharp` は本タスクで解消するので許容リストから外れる）。

| package | 経路 | 許容理由 | 条件 |
|---|---|---|---|
| `deepmerge-ts` | `@sinmirai/api` → `@prisma/client` → `prisma` → `@prisma/config`（および `@nestjs/terminus` → `@prisma/client`） | 修正版 8.x はメジャー更新。使われるのは Prisma CLI の設定ローダーだけで、リクエストの値は入らない | Prisma 7 移行（別タスク）で解消 |

- moderate / low（`qs`・`js-yaml`・`@babel/core` など、api 経路が中心）は本タスクの対象外。

## 5. スコープ外（やらないこと）
- `middleware.ts` → `proxy.ts` の移行（nodejs ランタイム固定になる。別タスク候補）。
- React 19.3 / TypeScript 7 / ESLint 10 への更新。
- Cache Components・Partial Prefetching・React Compiler など 16.3/16.4 の新機能の採用。
- Dockerfile の `pnpm@latest` 固定化と `--frozen-lockfile || pnpm install` のフォールバック撤去（前回と同じく別タスク）。
- api の依存更新・API 側のセキュリティ修正（`api-security-hardening-plan.md` で扱う）。

## 6. デプロイ
- **前提**: main の 29cf382（依存更新＋API セキュリティ修正）が、api・web とも本番にデプロイ済みであること。未デプロイなら、先にそちらを出す。本タスクの web と、未デプロイの api 変更を混ぜて出さない。
  - 理由: 29cf382 は、api のセキュリティ修正と、api・web 両方の依存更新を含む。next 16.4 とは独立に、早く本番へ出せる。
  - 一度に出すと、問題が起きたときにどちらが原因か切り分けられない。
- 本タスク自体は web のみ再ビルド・再デプロイが必要（api は変更なし）。手順は `docs/features/node-22.23.4-security-redeploy.md` を使い、前回指示書 `dependency-security-update-plan.md` §6 の**差し替え1・2**（検証済みコミットをビルドする／稼働中タスクの実ダイジェストをロールバック先として記録する）を適用する。対象は web だけなので `for S in api web` を `web` のみにする。
- **タスク定義のリビジョンを決め打ちしない**。デプロイ前に `describe-services` で稼働中のリビジョンを確認する。
- デプロイ後、`/login` が 200・未ログイン `/` が `/login` へリダイレクトされることを本番で確認し、ログイン後の画面確認（§3 の9）も行う。
- デプロイはネットワーク接続が許可された状態で行う（隔離セッションでは ECR への push が遮断される）。本指示書の実装担当は **push・本番デプロイ・main へのマージをしない**（別途ユーザーの指示を待つ）。
