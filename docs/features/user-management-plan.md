# sinmirai ユーザー管理機能（ロール/RBAC）— CodeX向け指示書

作成: 2026-06-04 / 作成者: Claude（プラン・指示書担当） / 実装担当: CodeX
対象: バックエンド(NestJS+Prisma) + フロント(Next.js) + 本番(大阪 ap-northeast-3)反映

---

## 0. 目的と確定方針

管理画面に「ユーザー管理」機能を追加し、3ロールによる権限制御（RBAC）を導入する。

### 確定方針（ユーザー合意済み・2026-06-04）
1. **ロール3種**: `master`（マスター）/ `editor`（編集者）/ `viewer`（閲覧者）
2. **入力項目**: メールアドレス / 名前 / パスワード（登録時設定）/ 備考
3. **ログイン識別子をメールアドレスに統一**（現状の loginId ベースから移行）。既存 `sinmirai-admin` にメールを付与し `master` に昇格。
4. **権限マトリクス（推奨採用）**:
   | 機能 | master | editor | viewer |
   |---|---|---|---|
   | 拠点/筐体/コンテンツ **参照(GET)** | ✓ | ✓ | ✓ |
   | 拠点/筐体/コンテンツ **作成・編集・削除** | ✓ | ✓ | ✗ |
   | アラート/監視/分析 **参照** | ✓ | ✓ | ✓ |
   | **ユーザー管理（参照・作成・編集・無効化・PWリセット）** | ✓ | ✗ | ✗ |
5. **パスワード運用**: マスターがユーザー作成・PWリセット・無効化を行う。**各自の自己PW変更画面は今回スコープ外**（後日追加可）。
6. **削除方式**: **論理削除（`isActive` 無効化）**。無効ユーザーはログイン不可・即時失効（既存の拠点/筐体の論理削除方針と一貫）。

### 用語整理
- DBの認証主体は既存 `Admin` モデル/`admins` テーブル。UI上の呼称は「ユーザー」。**モデル名・テーブル名は据え置き**（影響最小化）。

---

## 1. 現状（Claude調査・2026-06-04）

- `Admin` モデル: `id / loginId(unique) / password / name / createdAt / updatedAt`。**email・role・備考・有効フラグ無し**（[schema.prisma:11](apps/api/prisma/schema.prisma)）。
- 認証: グローバル `JwtAuthGuard`（APP_GUARD、`@Public()` で除外）。**RBAC無し**（[app.module.ts:27](apps/api/src/app.module.ts)）。
- ログイン: `loginId` で検索→bcrypt照合→JWT発行（payload=`{sub, loginId}`）（[auth.service.ts:16](apps/api/src/auth/auth.service.ts)）。
- `JwtStrategy.validate`: `id`で再取得し `{id, loginId, name}` を返す（roleなし）（[jwt.strategy.ts:29](apps/api/src/auth/strategies/jwt.strategy.ts)）。
- フロント: `apps/web`（App Router）。`(dashboard)/` 配下に sites/units/contents/alerts/analytics/monitoring。`login/`、`components/layout/app-sidebar.tsx`、`lib/auth-context.tsx`（localStorageに admin保持・`login(loginId,password)`）、`lib/api-client.ts`。
- 共通: `packages/shared/src/constants/enums.ts`（`as const` + type のパターン）。
- 本番: `https://fhwm.jp`、api=`sinmirai-api:4`（command=null→Dockerfile CMDで migrate→seed→main）、seedは `ADMIN_INITIAL_PASSWORD`(Secret)からPW読取。

---

## 2. 設計

### 2-1. スキーマ（`prisma/schema.prisma`）※保護対象・本指示書で承認
`Admin` に項目追加:
```prisma
model Admin {
  id        String   @id @default(uuid())
  loginId   String?  @unique @map("login_id")   // 後方互換のため残す（nullable化）。新規はnull、ログインはemail
  email     String   @unique                     // ★ログイン識別子
  password  String
  name      String
  role      String   @default("viewer")          // 'master' | 'editor' | 'viewer'
  note      String?                               // 備考
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("admins")
}
```
- ⚠️ **既存行があるため email NOT NULL + unique を一発追加不可**。マイグレーションは多段で（後述 §4）。

### 2-2. ロール定義（`packages/shared/src/constants/enums.ts`）
```ts
/** 管理ユーザーのロール */
export const AdminRole = {
  /** マスター（全機能＋ユーザー管理） */
  MASTER: 'master',
  /** 編集者（拠点・筐体・コンテンツのCRUD） */
  EDITOR: 'editor',
  /** 閲覧者（参照のみ） */
  VIEWER: 'viewer',
} as const;
export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];
```

### 2-3. RBAC（NestJS）
- **`@Roles(...roles)` デコレータ**（`SetMetadata('roles', roles)`）を新設。
- **`RolesGuard`**（APP_GUARDでグローバル登録、`JwtAuthGuard` の後段）:
  - メタデータの required roles を取得。未指定なら認証済み全員許可（=viewer以上）。
  - `request.user.role` が required に含まれれば許可、なければ `ForbiddenException`(403)。
  - `@Public()` ルートは素通し（roles未指定扱い）。
- **JWT拡張**: payload に `role` を追加。`auth.service.login` は email検索・`isActive`確認・`role`を payload/レスポンスに含める。`JwtStrategy.validate` は `select` に `email, role, isActive` を追加し、**`isActive=false` なら `UnauthorizedException`**（無効化を即時反映）。
- **既存コントローラへの付与（マトリクス反映）**:
  - sites/units/contents の **POST/PATCH/DELETE** に `@Roles('master','editor')`。
  - GET系は無指定（=全ロール参照可）。
  - device系(`/api/device/*`)・health・auth は対象外（device認証/Public）。

### 2-4. ユーザー管理API（新モジュール `src/admin/users`）
すべて `@Controller('admin/users')` + クラスに `@Roles('master')`:
| メソッド | パス | 内容 |
|---|---|---|
| GET | `/admin/users` | 一覧（ページネーション・キーワード・role/isActive絞り込み）。**passwordは返さない** |
| GET | `/admin/users/:id` | 詳細（password除外） |
| POST | `/admin/users` | 作成（email/name/password/role/note）。bcrypt(cost10)でハッシュ |
| PATCH | `/admin/users/:id` | 更新（name/role/note/isActive、email変更可）。passwordは含めない |
| PATCH | `/admin/users/:id/password` | PWリセット（master）。新PWをハッシュ保存 |
| DELETE | `/admin/users/:id` | 論理削除（`isActive=false`） |

**サービスのガードレール（重要）**:
- email 重複は 409（unique制約 + 事前チェック）。
- **最後の有効masterを無効化/降格/削除できない**（`isActive=false` masterが0件になる操作は 400）。
- **自分自身の無効化・ロール降格・削除を禁止**（誤操作防止、400）。
- パスワードポリシー: **12文字以上、英大小/数字/記号のうち3種以上**（フロント規約に整合。DTOでバリデーション）。
- レスポンス・ログに **password/ハッシュを絶対に含めない**（select除外、DTO変換）。

**DTO**（class-validator、メッセージは日本語）:
- `CreateUserDto`: `@IsEmail` email / `@IsString @IsNotEmpty` name / password(ポリシー) / `@IsIn(['master','editor','viewer'])` role / `@IsOptional @IsString` note
- `UpdateUserDto`: name/role/note/isActive/email（すべて optional）
- `ResetPasswordDto`: password（ポリシー）
- `UserQueryDto`: extends PaginationDto + keyword/role/isActive

### 2-5. フロント（Next.js）
- **ログインのメール化**:
  - `login/` フォームを email入力に変更。フロント規約遵守: `id`/`name` に `sinmirai-` プレフィックス（`sinmirai-email` / `sinmirai-password`）、`autocomplete="username"`/`"current-password"`、`<form id="sinmirai-login-form">`、パスワード表示/非表示トグル（SVGインライン）。
  - `lib/auth-context.tsx`: `Admin` 型に `email`・`role` 追加。`login(email, password)` に変更。
  - `lib/api-client.ts`: `login(email, password)`、users CRUD メソッド追加。
- **ユーザー管理画面** `app/(dashboard)/users/page.tsx`（sites画面のパターン踏襲）:
  - 一覧（メール/名前/ロール/状態/備考）、作成・編集ダイアログ（`components/dialogs/`）、PWリセット、有効/無効トグル。
  - パスワード入力欄は表示/非表示トグル付き（規約）。
- **ロールによるUI制御**:
  - `app-sidebar.tsx`: 「ユーザー管理」項目を **master のみ**表示。
  - sites/units/contents 画面: 作成・編集・削除ボタンを **viewer では非表示/無効**（`role` で分岐。`canEdit = role===master||editor`）。
  - `/users` ルートは **master以外はリダイレクト**（layoutかページガードで）。
  - ※フロントのガードはUX用。**権限の正は必ずサーバ側RBAC**で担保。

---

## 3. 実装手順（フェーズ別）

### Phase 1: 共通・スキーマ
- `packages/shared` に `AdminRole` 追加・export。
- `schema.prisma` を §2-1 に更新。

### Phase 2: マイグレーション（多段・既存データ保持）
手書きSQLを含むマイグレーションを作成（`prisma migrate dev` で生成後、SQLを多段に調整）:
1. `email` を **nullable** で追加、`role`(default 'viewer')・`note`・`is_active`(default true) 追加、`login_id` を nullable 化。
2. **既存 `sinmirai-admin` をバックフィル**: `email = 'kushida@artifice-inc.com'`（=`ADMIN_INITIAL_EMAIL`）、`role='master'`、`is_active=true`。
   - `ADMIN_INITIAL_EMAIL` は新規env（後述）。マイグレーション内で固定値にせず、**バックフィルは seed/ワンオフで実施**してもよい（NOT NULL化の前に email を全行へ入れる必要がある点に注意）。
3. email を **NOT NULL + UNIQUE** に変更。
- ⚠️ 本番反映は `prisma migrate deploy`（コンテナ起動時）。**email NOT NULL化の前に全行のemailが埋まっていること**を保証する順序にする（埋まっていないとマイグレーション失敗）。最も安全な順序: 「nullable追加 → バックフィルSQL（同一マイグレーション内で `UPDATE admins SET email=... WHERE email IS NULL`）→ NOT NULL/UNIQUE化」を**1マイグレーションにまとめる**。バックフィル用のマスターemailはマイグレーションSQLに直書きせず、`ADMIN_INITIAL_EMAIL` を使う運用にするため、**初回は「email nullable追加」までをマイグレーションで行い、バックフィル＋NOT NULL化は次段**に分ける方式でも可（CodeXが安全な順序を選択し、報告すること）。

### Phase 3: 認証・RBAC
- `@Roles` デコレータ / `RolesGuard`（APP_GUARD登録）。
- `login.dto.ts` を email化（`@IsEmail`）。`auth.service.login` を email検索・isActive確認・role付与。`jwt.strategy.ts` を email/role/isActive対応（無効ユーザー拒否）。
- 既存 sites/units/contents コントローラのmutationに `@Roles('master','editor')`。

### Phase 4: ユーザー管理モジュール
- `src/admin/users`（controller/service/module/dto）を §2-4 で実装。`app.module.ts` に `UsersModule` 追加。
- Swagger（`@ApiTags('ユーザー管理')` 等）も付与。

### Phase 5: seed・env拡張
- `seed-prod.js`: マスター作成を **email + role='master'** 対応に。email は `ADMIN_INITIAL_EMAIL`（env）、PWは既存どおり `ADMIN_INITIAL_PASSWORD`。既存ありスキップは維持。
- 本番タスク定義に **`ADMIN_INITIAL_EMAIL=kushida@artifice-inc.com`** を追加（emailは秘密ではないため**通常env**でよい。Secret化は任意）。
- ローカル `prisma/seed.ts`（dev）も整合させる。

### Phase 6: フロント
- ログインのメール化、auth-context/api-client 拡張、ユーザー管理画面、サイドバー・各画面のロール制御（§2-5）。

### Phase 7: 本番反映
- api: イメージ再ビルド→ECR push→新タスク定義（`ADMIN_INITIAL_EMAIL` 追加）→デプロイ。起動時 `migrate deploy` で新マイグレーション適用。
- web: 再ビルド（`NEXT_PUBLIC_API_URL=https://fhwm.jp/api` 据置）→ECR push→デプロイ。
- 既存 `sinmirai-admin` の email/role が設定済みであること（Phase2/5）を確認。

### Phase 8: 検証
- DB: `admins` に email/role/is_active 列、`sinmirai-admin` が master・isActive=true・email設定済み。
- ログイン: master のメール＋PWで `/api/auth/login` 201（JWTに role=master）。
- RBAC:
  - viewer で sites POST → 403、GET → 200。
  - editor で sites POST → 201、`/admin/users` → 403。
  - master で `/admin/users` CRUD 各200/201。
  - 無効化ユーザーでログイン/既存トークン利用 → 401。
- ガードレール: 最後のmaster無効化/降格/自己削除 → 400。
- フロント: master のみサイドバーに「ユーザー管理」、viewerで編集ボタン非表示、`/users` 直アクセスがmaster以外でリダイレクト。
- 実ブラウザで `https://fhwm.jp` ログイン〜ユーザー作成〜ロール別動作を目視。

---

## 4. 既知の落とし穴（必ず踏襲）
1. **email NOT NULL+UNIQUE の多段マイグレーション**。既存行へバックフィルしてから制約付与。順序を誤ると本番起動時 `migrate deploy` が失敗しコンテナが起動しない（boot停止）。CodeXは適用順を明示・検証。
2. **ログイン識別子の切替（loginId→email）は破壊的**。フロント・DTO・JWT・seed をすべて email 前提に揃える。既存JWT(24h)は失効まで有効だが、ログインフォームは即email化。
3. **無効化の即時反映**は `JwtStrategy.validate` の `isActive` チェックで担保（DB都度参照）。
4. **最後のmaster保護・自己無効化禁止**を必ず実装（ロックアウト防止）。
5. **password/ハッシュを返さない・ログに出さない**（select除外）。PWポリシー12文字以上。
6. **権限の正はサーバ側RBAC**。フロントの出し分けはUXのみ。
7. **web はビルド時に API URL 焼き込み**。新画面追加でも再ビルド必須。web TG HCパスは `/login` 据置。
8. `prisma/schema.prisma` は保護対象。変更は本指示書の承認範囲のみ。`turbo.json`/`Dockerfile` は変更不要。

## 5. 完了報告フォーマット（CodeX → Claude）
- 各Phaseの差分要点（新規/変更ファイル一覧）
- マイグレーションSQLと適用順、本番 `migrate deploy` の結果
- 新 api/web イメージ digest、タスク定義リビジョン、デプロイ結果
- Phase8 の検証結果（HTTPコード・実画面）。**PW平文は記載しない**

## 6. Claude のレビュー観点
- スキーマ/マイグレーションが多段で安全か（既存データ保持・本番起動を壊さない）
- `RolesGuard` が全mutation・ユーザー管理に正しく適用（viewer 403 / editor のユーザー管理 403 を実測）
- `isActive=false` で即ログイン/トークン拒否
- 最後のmaster保護・自己無効化禁止が効くか
- password がレスポンス/ログに出ていないか（実コードレビュー）
- ログインのメール化が全層整合（フロント/DTO/JWT/seed）
- 実ブラウザでロール別UI・`/users`ガードを目視
- `sinmirai-admin` が master・email設定済み・ログイン継続可

## 7. マスターのメールアドレス（確定済み）
- **`ADMIN_INITIAL_EMAIL = kushida@artifice-inc.com`**（2026-06-04 ユーザー確定）。
- これが既存 `sinmirai-admin` のメール＝**今後のマスターのログインID**になる。Phase2（バックフィル）/ Phase5（seed・env）でこの値を使用。
- パスワードは既存どおり Secret `sinmirai/prod/admin-initial-password` の現行値（②で設定済み）を継続使用。

## 8. スコープ外（今回やらない）
- ログインユーザー自身のパスワード変更画面/API（後日）
- メール通知・招待メール（メール送信基盤なし）
- 監査ログ・2要素認証
