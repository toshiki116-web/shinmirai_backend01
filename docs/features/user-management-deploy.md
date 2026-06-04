# ユーザー管理機能 本番反映（Phase 7）— CodeX向けデプロイ手順書

作成: 2026-06-04 / 作成者: Claude（プラン・指示書担当） / 実装担当: CodeX
対象: **大阪 ap-northeast-3 / アカウント 741448957802** / 実装コミット `b068f75`

---

## 0. 目的と前提

ローカル実装・検証済み（コミット `b068f75`、Claudeコードレビューgreen）のユーザー管理機能(RBAC)を本番へ反映する。

### ⚠️ 反映による変化（事前周知）
- **マスターのログインIDがメール `kushida@artifice-inc.com` に切り替わる**（`sinmirai-admin` では不可に）。パスワードは現行Secret値（②で設定済み）を継続。
- ログイン画面がメール入力に変わる。

### 実施順序の鉄則
**api を先 → web を後**。web は新APIの形（emailログイン）に依存するため、api未反映の状態でwebだけ出すとログイン不整合になる。

---

## 1. 対象リソース（既知）

| 種別 | 値 |
|---|---|
| ECR(api/web) | `741448957802.dkr.ecr.ap-northeast-3.amazonaws.com/sinmirai/api` ・ `.../sinmirai/web` |
| ECSクラスタ | `sinmirai` / サービス `sinmirai-api`・`sinmirai-web` |
| 現行 api タスク定義 | `sinmirai-api:4`（command=null=Dockerfile CMD、secrets: DATABASE_URL/JWT_SECRET/ADMIN_INITIAL_PASSWORD、env: NODE_ENV/JWT_ACCESS_EXPIRES_IN/CORS_ORIGIN=https://fhwm.jp）|
| 現行 web タスク定義 | `sinmirai-web:1`（latest運用、command で HOSTNAME=0.0.0.0）|
| ロググループ | `/aws/ecs/sinmirai/api`・`/aws/ecs/sinmirai/web` |
| URL | `https://fhwm.jp` / web TG HC=`/login` / api TG HC=`/api/health` |
| 新マイグレーション | `20260604090000_admin_users_rbac`（起動時 `prisma migrate deploy` で適用）|

---

## 2. 手順（フェーズ別）

> 全コマンド **`--region ap-northeast-3`**。PW平文は出さない。

### Phase A: api 反映（マイグレーション＋RBAC）
1. **api イメージ再ビルド → ECR push**（`sinmirai/api:latest`、新digestを控える）。
2. **タスク定義 `sinmirai-api:5` を登録**（`:4` をベースに env へ追加）:
   ```json
   { "name": "ADMIN_INITIAL_EMAIL", "value": "kushida@artifice-inc.com" }
   ```
   - 他（command=null / secrets / 既存env / logConfiguration）は維持。
   - ※ env未設定でも `seed-prod.js` は同値をデフォルトにするが、明示推奨。
3. **サービス更新**:
   ```bash
   aws ecs update-service --region ap-northeast-3 --cluster sinmirai --service sinmirai-api \
     --task-definition sinmirai-api:5 --force-new-deployment
   ```
4. 起動時の自動処理（Dockerfile CMD）: `prisma migrate deploy`（新マイグレーション適用＝email/role/is_active追加＋sinmirai-adminをkushida/masterにバックフィル）→ `seed-prod.js`（masterロール保証）→ `node dist/main`。
- **受け入れ**: rollout COMPLETED / running=1・pending=0 / `/api/health` 200。起動ログにマイグレーション適用と `seed: admin already exists; ensured master role`。

### Phase B: web 反映
1. **web イメージ再ビルド**（`NEXT_PUBLIC_API_URL=https://fhwm.jp/api` 据置）→ ECR push（`sinmirai/web:latest`、新digest控える）。
2. **サービス更新**（latest上書き運用なら force で十分）:
   ```bash
   aws ecs update-service --region ap-northeast-3 --cluster sinmirai --service sinmirai-web \
     --task-definition sinmirai-web:1 --force-new-deployment
   ```
- **受け入れ**: rollout COMPLETED、web TG healthy（HC=`/login`）。

### Phase C: 検証
1. **マイグレーション反映**: `admins` に email/role/is_active 列。`sinmirai-admin` 行が email=`kushida@artifice-inc.com`・role=`master`・is_active=true（SELECTで確認。**PWは見ない**）。
2. **マスターログイン**: `kushida@artifice-inc.com` ＋ 現行PW（Secretから取得）で `/api/auth/login` → 201、JWTに role=master。
3. **RBAC（live）**:
   - editor作成 → editorで `/api/admin/sites` POST 201 / `/api/admin/users` 403。
   - viewer作成 → viewerで sites POST 403 / GET 200。
   - master で `/api/admin/users` CRUD 各成功。
   - editor/viewer を無効化 → そのユーザーでログイン/既存トークン利用が 401。
   - 最後のmaster無効化/降格/自己削除 → 400。
4. **フロント実ブラウザ**: master のみサイドバーに「ユーザー管理」、`/users` 直アクセスは非masterでリダイレクト、viewerで編集ボタン非表示。`https://fhwm.jp` でログイン〜ユーザー作成。
- ※検証用に作成した editor/viewer テストユーザーは後始末（無効化 or 削除）。

---

## 3. 既知の落とし穴
1. **api を先、web を後**（順序厳守）。
2. **マイグレーションは起動時1回**。失敗するとコンテナ起動不可 → ログ確認。バックフィルはマイグレーション内で完結するため安全。
3. **既存JWT(24h)は失効まで有効**。`JwtStrategy.validate` はDBからroleを取得するため、role未claimの旧トークンでもRBACは機能（移行は無停止）。
4. **マスターのログインはメールに変更**。利用者へ周知。
5. web はビルド時にAPI URL焼き込み。新画面反映に再ビルド必須。HC=`/login` 据置。
6. ロールバック: 問題時は api/web を旧イメージ・旧タスク定義（`:4`/`:1`）へ戻す。**ただしマイグレーションはDB側に残る**（列追加は後方互換で旧コードでも動くが、email NOT NULL制約に注意）。旧コードへ戻す場合の影響をユーザーと確認。

## 4. 完了報告（CodeX → Claude）
- 新 api/web イメージ digest、タスク定義 `sinmirai-api:5` のenv、デプロイ結果
- マイグレーション適用ログ、`admins` の sinmirai-admin 行（email/role/is_active、**PW除く**）
- Phase C のHTTPコード一覧・実画面確認
- ※ PW平文は記載しない

## 5. Claude レビュー観点
- `describe-task-definition sinmirai-api:5` に ADMIN_INITIAL_EMAIL、稼働タスクが新digest
- DBの sinmirai-admin が master・email設定済み・isActive
- email でマスターログイン 201、RBACの 403/401/400 を実測
- 実ブラウザでロール別UI・/usersガード
- 旧 sinmirai-admin（loginId）ではログイン不可になっていること
