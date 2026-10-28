# API セキュリティ修正（ログイン制限・PWリセット時のトークン失効・動画アップロード完了の堅牢化）— 実装指示書

作成: 2026-10-28 / 実装担当: CodeX / レビュー: Claude

> **実装者向け原則**: この指示書に書かれていない抽象化・依存・ファイルを追加しない。
> 迷ったら最小を選び、判断を指示書作成者に差し戻す。

## 0. 前提と着手順
- **`docs/features/dependency-security-update-plan.md`（依存更新）の実装後に着手すること**。
  §1 で `trust proxy` を有効にするが、`proxy-addr` の critical 脆弱性（IPv4-mapped IPv6 による IP 偽装）は依存更新で解消される。更新前に有効にすると、偽装された IP で制限をすり抜けられる。
- 3 件は互いに独立している。コミットは 1 件ずつ分けること（`[fix] ...` × 3）。

---

## 1. ログイン試行回数の制限

### 現状【確認済】
- `POST /api/auth/login`（`apps/api/src/auth/auth.controller.ts`）は `@Public()` で、回数制限がない。総当たりを止める仕組みがどこにもない。
- 本番は `ALB → Fargate`。`main.ts` に `trust proxy` の設定がないため、`req.ip` は **ALB のアドレス**になる。
  → そのまま IP 単位で制限すると、**全ユーザーが1つの枠を共有し、誰か1人の失敗で全員がログインできなくなる**。
- web は `/auth/refresh` が `res.ok` 以外を返すと、無条件にログイン画面へ戻す（`apps/web/src/lib/api-client.ts` の `performRefresh` → `redirectToLogin`）。
  → refresh を 429 にすると、正規ユーザーがログアウトされる。

### 方針【方針】
- **`@nestjs/throttler` を新規に導入する**（新規依存。ユーザー承認済みの前提で進める。未承認なら着手前に止めること）。
  - 不採用案: DB にアカウント単位のロック列を追加する案。マイグレーションが必要なうえ、メールアドレスを知っている第三者が他人を意図的にロックできるため採らない。
  - 不採用案: AWS WAF のレート制限ルール。ALB への WAF 追加はインフラ変更とコスト増を伴うため、本タスクでは採らない。
- **制限するのは `login` だけ**。`refresh`・`logout`・device API・管理 API は対象外。
  - refresh は推測不可能なランダムトークン（48 バイト）なので総当たりは成立しない。制限するとログアウト事故を起こす。
- キーはクライアント IP。保存先は throttler 既定のインメモリ（タスクごとに別カウント）。
  `// TODO(2026-10-28): 簡易実装 — タスク数N台なら実効上限はN倍。厳密化はRedis等の共有ストア`

### 変更
| ファイル | 変更 |
|---|---|
| `apps/api/package.json` | `@nestjs/throttler` を追加（NestJS 11 対応の最新 6.x） |
| `apps/api/src/main.ts` | `NestFactory.create<NestExpressApplication>` に変え、`app.set('trust proxy', 1)` を追加（ALB 1段だけを信頼する） |
| `apps/api/src/app.module.ts` | `ThrottlerModule.forRoot([{ name: 'login', ttl: 60_000, limit: 10 }])` を import する。**`APP_GUARD` には登録しない**（全体にかけない） |
| `apps/api/src/auth/auth.controller.ts` | `login` メソッドだけに `@UseGuards(ThrottlerGuard)` を付ける |

- 上限（1分あたり10回/IP）は `auth.controller.ts` か `app.module.ts` に名前付き定数として置く。環境変数による設定化はしない。
- 429 のレスポンスは既存の `GlobalHttpExceptionFilter` が `TOO_MANY_REQUESTS` に変換する（`statusToErrorCode` に 429 は定義済み【確認済】）。メッセージは日本語の「ログイン試行回数が上限に達しました。しばらくしてから再度お試しください」とする。ThrottlerGuard の既定の英語メッセージをそのまま返さないこと（`ThrottlerModule` の `errorMessage` オプションで設定する）。

### 不変条件
- `trust proxy` は **`1`**（数値）にする。`true` にすると `X-Forwarded-For` の先頭、つまりクライアントが自由に書ける値を信頼することになり、制限を回避される。
- `RolesGuard`・`JwtAuthGuard` の `APP_GUARD` 登録順を変えない。

---

## 2. パスワードリセット時にリフレッシュトークンを失効させる

### 現状【確認済】
- `UsersService.resetPassword`（`apps/api/src/admin/users/users.service.ts:136`）は `admin.password` を更新するだけ。`refresh_tokens` の行は残る。
  → 漏えいしたリフレッシュトークンが、リセット後も最大7日間（`REFRESH_TOKEN_TTL_DAYS`）使える。
- 無効化（`update` で `isActive=false`、`remove`）は、`AuthService.refresh` と `JwtStrategy.validate` の両方が `isActive` を見るため、すでに遮断されている。**本タスクでは触らない**。

- `AuthService.refresh` は、トークンの有効性確認（`findUnique`）を**トランザクションの外**で行い、その後の配列 `$transaction` で旧トークンの失効と新トークンの作成をしている。`login` も、bcrypt で照合してから、トランザクションを使わずに新トークンを作成している。
  → リセット側だけを transaction にしても、次の順序で実行されるとリセット後も使えるトークンが残る。
  - refresh: 「有効と判定 → リセットが全件失効 → 新トークンを作成」
  - login: 「旧パスワードで照合 → リセット → トークンを作成」

### 方針【方針】
**同じ管理者についての「トークンの発行」と「パスワードリセット」を、`admins` 行のロックで直列化する**。
- PostgreSQL の行ロック（`SELECT ... FOR UPDATE`）を、Prisma の対話型トランザクション（`$transaction(async (tx) => ...)`）の中で取る。
- 有効性の確認は、**ロックを取った後に**同じトランザクション内でやり直す。PostgreSQL の既定の分離レベル（READ COMMITTED）では、ロック取得後の文はコミット済みの最新状態を読むため、先に終わったリセットの結果が見える。
- 不採用案: `admins` に `passwordChangedAt` 列を追加し、トークン発行時刻と比べる案。マイグレーションが必要で、比較を入れ忘れた経路から漏れるため採らない。
- 不採用案: 分離レベル SERIALIZABLE。失敗時のリトライ処理が別途必要になるため採らない。

共通の処理を `AuthService` に置くこと（private で可。`UsersService` から呼ぶ必要はない）。
ロックを取る SQL は1つに決める: `SELECT id FROM admins WHERE id = $1 FOR UPDATE`（`tx.$queryRaw` のタグ付きテンプレートで値を渡す。文字列連結で組み立てない）。

### 変更
**(a) `UsersService.resetPassword`** — 対話型トランザクションで、次の順に実行する。

| 順 | テーブル | 操作 | 条件 |
|---|---|---|---|
| 1 | `admins` | `FOR UPDATE` でロック | `id = :id` |
| 2 | `admins` | update `password` | `id = :id` |
| 3 | `refresh_tokens` | updateMany `revokedAt = now` | `adminId = :id AND revokedAt IS NULL` |

- bcrypt のハッシュ計算はトランザクションの**前**に行う（ロックを持ったまま時間のかかる計算をしない）。

**(b) `AuthService.refresh`** — 対話型トランザクションで、次の順に実行する。

| 順 | 操作 |
|---|---|
| 1 | `tokenHash` でトークン行を引き、`adminId` を得る（無ければ 401） |
| 2 | その `adminId` の `admins` 行を `FOR UPDATE` でロック |
| 3 | 旧トークンの条件付き失効: `updateMany where { id, revokedAt: null, expiresAt: { gt: now } }` → `{ revokedAt: now }`。**更新件数が1でなければ 401**（リセットで失効済み、または同じトークンの二重使用） |
| 4 | `admins` を読み直し、`isActive` が false なら 401 |
| 5 | 新トークンを作成 |

- 手順3の条件付き更新で、同じリフレッシュトークンの同時二重使用も1回だけに絞られる。

**(c) `AuthService.login`** — bcrypt の照合はトランザクションの**外**で行い（重いため）、トークンを作る部分だけを対話型トランザクションにする。

| 順 | 操作 |
|---|---|
| 1 | `admins` 行を `FOR UPDATE` でロック |
| 2 | `admins` を読み直し、**`password` のハッシュ文字列が照合に使ったものと一致し、かつ `isActive` が true** であることを確認する。違えば 401（照合している間にリセットされた） |
| 3 | リフレッシュトークンを作成 |

- 401 のメッセージは、既存と同じ「メールアドレスまたはパスワードが正しくありません」にする（リセットと競合したことを外部に知らせない）。

共通:
- 物理削除はしない（`AuthService.logout` と同じく `revokedAt` で失効させる方式に揃える）。
- 戻り値の形（login・refresh のレスポンス、resetPassword の `userSelect`）は変えない。
- `logout` は変えない（失効させる方向の操作なので、競合しても安全側に倒れる）。

### 仕様として明記すること（挙動の変化）
- 発行済みのアクセストークン（JWT、最長15分）は失効しない。リセット後も最大15分は旧セッションで操作できる。本タスクでは許容する。
- master が**自分自身**のパスワードをリセットすると、自分のリフレッシュトークンも失効する。15分以内に再ログインが必要になる。これは正しい挙動とし、フロント側で特別な対応はしない。

---

## 3. 動画アップロード完了（`completeUpload`）の堅牢化

### 現状【確認済】
`ContentsService.completeUpload`（`apps/api/src/admin/contents/contents.service.ts:216`）について:
1. `content.filePath` が null だと、**どの `objectKey` でも受け付ける**。バケット内の他コンテンツの動画や、サムネイルのキーを登録できてしまう。
2. `headObject` の後に **MIME もサイズも再検証しない**。presign URL にサイズの制約がないため、上限（`MAX_UPLOAD_SIZE_BYTES`、5GB）を超える物や動画以外の物が READY になる。
3. オブジェクトキーの拡張子を**ユーザーが付けたファイル名から取っている**（`StorageService.getExtension`）。`x.html` を送ると `contents/<id>/<uuid>.html` が作られる。

参考として、同じ形の `completeThumbnailUpload` は、キーの接頭辞の確認・head 後の `validateImageUpload`・失敗時に FAILED にする処理がすでに実装済み。**これに揃える**。

`filePath` を書き込むのは `createUploadUrl`（205行）と `completeUpload` → `updateFileMetadata` だけ【確認済、grep 済み】。
つまり正規の流れでは、`completeUpload` の時点で必ず `filePath` が入っている。

### 変更
| # | 場所 | 変更 |
|---|---|---|
| 3-1 | `completeUpload` | `content.filePath` が null の場合、または `dto.objectKey` と一致しない場合は 400（`アップロード対象のファイルキーが一致しません`）。現在の `content.filePath && ...` の条件を「null なら拒否」に変える。 |
| 3-2 | `completeUpload` | `headObject` の後で `storageService.validateUpload(normalizeContentType(head.contentType ?? ''), Number(head.fileSize))` を呼ぶ。失敗したら既存の catch で `uploadStatus=FAILED` にして 400。 |
| 3-3 | `StorageService.getExtension` | ファイル名を見ず、**MIME だけで拡張子を決める**（`video/mp4`→`mp4`、`video/quicktime`→`mov`）。`imageExtFromMime` と同じ形にし、該当しない MIME は 400。`fileName` 引数が不要になれば、`createObjectKey` のシグネチャから外してよい。 |

- 3-2 の `validateUpload` は `allowedVideoMime.has(contentType)` の完全一致で判定している。`head.contentType` に `; charset` などが付く可能性に備え、`normalizeContentType` を通してから渡す。
- S3 上のオブジェクトは、検証に失敗しても**削除しない**（サムネイル側と揃える。ログ側は削除しているが、本タスクでは合わせない）。

### 保証できる範囲と残るリスク
- 本タスクで保証するのは、**完了処理を実行した時点で、S3 上のオブジェクトのメタデータ（種類・サイズ）が条件を満たすこと**だけ。
- 残るリスク: 署名付き PUT URL は期限内（`UPLOAD_URL_EXPIRES_IN`、既定900秒）なら何度でも使え、同じキーを上書きできる。完了処理の後に再び PUT されると、READY のまま、S3 上の実体と DB のサイズ・チェックサムが食い違う。
  - URL を受け取れるのは、認証済みの master/editor だけ。
  - サムネイルにも同じ経路がある（既存）。
  - 上書き防止は §6 で別タスクにした。

### 不変条件
- 既存の READY のコンテンツ（拡張子がファイル名由来のキー）には触れない。データの移行はしない。`signContentUrl` は既存キーのまま配信できる。
- `CreateUploadUrlDto` の `fileName` は削除しない（web が送っているため。forbidNonWhitelisted で 400 になる）。

---

## 4. テスト（失敗系を厚く）
### 4-1. 単体テスト（モック）
既存の `apps/api/src/admin/contents/contents.service.spec.ts`（サムネイルのテスト）の書き方に倣い、Prisma と StorageService はモックする。

| 対象 | ケース | 期待 |
|---|---|---|
| completeUpload | `filePath=null` で任意キー | 400。`headObject` を呼ばない |
| completeUpload | `filePath` と異なるキー | 400 |
| completeUpload | head が `text/html` | 400。`uploadStatus=FAILED` |
| completeUpload | head のサイズが上限超過 | 400。`uploadStatus=FAILED` |
| completeUpload | 正常（`video/mp4`、上限内） | READY。`filePath` は不変 |
| StorageService | `fileName='x.html'`、`video/mp4` | キーが `.mp4` で終わる |
| resetPassword | 実行後 | 同じトランザクションの中で、ロック → password 更新 → `refreshToken.updateMany({adminId, revokedAt: null})` の順に呼ばれる |
| refresh | 条件付き失効の更新件数が0 | 401。新トークンを作らない |
| login | 照合後に読み直した hash が異なる | 401。トークンを作らない |

### 4-2. 実 DB を使う結合テスト（同時実行）
モックでは行ロックの効果を確認できないため、**ローカルの PostgreSQL（`docker compose up -d postgres`、5433番）に対する e2e テスト**を新規に作る。
- ファイルは `apps/api/test/auth-reset-race.e2e-spec.ts`。既存の `test/jest-e2e.json` で実行する（e2e のテストファイルはまだ1つも無い）。
- テスト用の管理者は、テストの中で作って後始末する。seed の管理者は使わない。

| ケース | 手順 | 期待 |
|---|---|---|
| refresh × reset | 有効なリフレッシュトークンを用意し、`refresh` と `resetPassword` を `Promise.all` で同時に実行する。これを **50回** 繰り返す | どの回も、両方が終わった時点で `refresh_tokens` に `adminId` が一致し `revokedAt IS NULL` の行が **0件** |
| login × reset | 旧パスワードでの `login` と `resetPassword` を同時に実行する。これを50回繰り返す | 同上（0件）。login は成功か 401 のどちらか |
| 二重 refresh | 同じリフレッシュトークンで `refresh` を2つ同時に実行する | 成功は1つだけ。もう1つは 401 |
| 直列の基本確認 | resetPassword の後に、旧リフレッシュトークンで refresh する | 401 |

- 同時実行のテストは、修正前のコードで実行すると「0件」が崩れる回があることを1度確認し、報告に書くこと（テストが競合を検出できる証拠として）。崩れなかった場合は、繰り返し回数を増やしたことと、その結果を書く。

### 4-3. ログイン制限の結合テスト（単一インスタンス）
`supertest` で Nest アプリを1つ立ち上げ、`trust proxy=1` を設定した状態で行う。supertest は直接接続なので、`X-Forwarded-For` の値がそのままクライアント IP として扱われる。これを ALB が付ける末尾の値の代わりに使う。

| ケース | 期待 |
|---|---|
| 同じ XFF（例 `203.0.113.10`）で login を11回 | 1〜10回目は 401、**11回目は 429**。`error_code=TOO_MANY_REQUESTS`、日本語メッセージ |
| 10回失敗した後、別の XFF（`203.0.113.11`）で login | 401（カウンターが IP ごとに分かれている） |
| 同じ XFF で refresh を30回 | 429 にならない（制限の対象外） |

「11回目で 429」を保証するのは、**この単一インスタンスのテスト**とする。本番は複数タスクに振り分けられるので、§5 では別の基準で判定する。

## 5. 完了条件
- §4 の全テストが成功し、既存テストの件数が減っていない。
- `pnpm --filter @sinmirai/api build` が成功する。
- **デプロイ前の本番構成の確認**（`trust proxy=1` が正しく働く前提条件。満たさなければデプロイしない）:
  - ALB `sinmirai-alb` の属性 `routing.http.xff_header_processing.mode` が `append` であること（`aws elbv2 describe-load-balancer-attributes` で確認。既定値は append）。
  - api タスクのセキュリティグループのインバウンドが、ALB のセキュリティグループからだけ許可されていること。インターネットからタスクに直接届くと、XFF の末尾を偽装されて制限を回避されるため。
- **本番デプロイ後**:
  - 稼働中の api タスク数 N を `describe-services` の `runningCount` で確認する。
  - 存在しないメールアドレスで、誤ったログインを最大 **10×N+1 回**続け、その間に 429 が返ることを確認する。実在するアカウントは使わない。
  - 何回目で 429 になったかは、タスクへの振り分け次第なので判定に使わない。記録だけする。
  - 429 を確認したら1分待ち、401 に戻ることを確認する。
  - 正しいパスワードでのログイン（別の接続元から）と、筐体の heartbeat に影響が無いことも確認する。

## 6. スコープ外（やらないこと）
- `refresh`・`logout`・device API・管理 API への回数制限。
- アカウントロック、CAPTCHA、ログイン失敗の監査ログ。
- アクセストークン（JWT）の即時失効（パスワード変更時刻と `iat` の比較など）。
- 無効化・ロール変更時のリフレッシュトークン失効（`isActive` の判定で遮断済み）。
- presign URL への `ContentLength` 署名、上書き防止（`If-None-Match` の条件付き書き込み）。どちらも web 側の変更が必要になるため、別タスクにする。
- ログアップロード（device）の挙動変更。既存の動画オブジェクトの移行。
- セキュリティチェックで見つかった他の指摘: 本番の Swagger 公開、CORS が未設定時に `*` になる件、Dockerfile の `pnpm@latest`。

## 7. デプロイ
- api だけ。web の変更はない。
- 手順は `docs/features/node-22.23.4-security-redeploy.md` の api の節に従う。ただし「本番と同じコミットにする」（旧 §1-5）と「`:latest` のダイジェストを記録する」（旧 §2）の2箇所は、`dependency-security-update-plan.md` §6 の差し替え1・2を使う。具体的には、本タスクのコミットをビルドし、ロールバック先には稼働中タスクの `imageDigest` を記録する。
- タスク定義のリビジョンは決め打ちせず、デプロイ前に `describe-services` で稼働中のものを確認する。
- 依存更新タスクのデプロイ後に行うこと（§0）。
