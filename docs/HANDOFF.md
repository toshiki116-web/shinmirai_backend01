# 引き継ぎメモ（次セッション向け） — 2026-06-04 更新

> 新セッションはまず自動ロードされるメモリ（`prod-env-osaka.md` / `role-split-codex-implements.md` / `ecs-web-deploy-gotchas.md`）に目を通すこと。本ファイルは「現在地と次にやること」の要約。

## 1. 役割分担（厳守）
- **実装はCodeX**。Claudeは **プラン作成・CodeX向け指示書作成・完了報告の実コードレビュー**を担当（自分でコードは書かない）。
- 完了報告は鵜呑みにせず、必ず実リソース/実コード/実画面で検証する。

## 2. 現在地（正常基準）
- **本番＝大阪 ap-northeast-3**（アカウント 741448957802）。東京 ap-northeast-1 は**完全削除済み・課金停止**。
- 本番URL: **`https://fhwm.jp`**（HTTPS化済み）。ヘルス: `/api/health` → 200（DB up）、ECS `sinmirai-api`(=`:5`)/`sinmirai-web`(=`:1`) ともに running=1。
- **管理ログインはメール**: `kushida@artifice-inc.com`（マスター）。loginIdログインは廃止（400）。PWは Secret `sinmirai/prod/admin-initial-password` の現行値。
- ユーザー管理画面: `https://fhwm.jp/users`（masterのみ）。
- 構成・接続情報・SecretsのARN・管理者情報は **メモリ `prod-env-osaka.md` / `user-management-feature.md` に集約**。
- git: `main` はリモート同期済み（最新 `6177964`）。未push・未コミットなし。

## 3. 完了済み（2026-06-03）
1. サイドバー文字色修正（`--sidebar-background`→`--sidebar` に統一、濃紺背景復元）。コミット `ebb567e`、東京へデプロイ・実画面確認まで実施（その後東京は廃止）。
2. 東京→大阪のクリーン移行（CodeX実装、Claude検証）。自前ALB+Fargate方式。
3. 東京旧環境を全削除（ECS/ALB×2/EIP×5/RDS/S3/ECR/ログ/VPC）。OCR_scan資産は無傷確認。

## 4. 次にやる残課題（優先順）
### ① HTTPS化＋独自ドメイン ✅ 完了（2026-06-04）
- 本番URL = **`https://fhwm.jp`**（fhwm.jp + www.fhwm.jp、www→apex 301、HTTP→HTTPS 301）。
- ACM `...certificate/2987e3a7-...`（ISSUED）、ALB 443リスナー、Route53 `Z08172713JVKA857P1OSY` の A(Alias)、web再ビルド（`NEXT_PUBLIC_API_URL=https://fhwm.jp/api`）、api `CORS_ORIGIN=https://fhwm.jp`（sinmirai-api:2）まで実施・Claude検証済み。
- 指示書: `docs/migration/https-setup-plan.md`。実装=CodeX / 検証=Claude（全green）。

### ② 管理者初期パスワードの変更 ✅ 完了（2026-06-04）
- ランダム16文字PWを生成→Secret `sinmirai/prod/admin-initial-password` 上書き（AWSCURRENT更新、旧はAWSPREVIOUS）。
- DB `admins.password` をワンオフECSタスク（一時 `sinmirai-api:3`、現INACTIVE）＋Secret注入で更新。execution roleに admin Secret ARN を3 ARN限定で付与。
- 検証: 新PW→201/JWT→/sites 200、誤PW・旧PWとも401。live は `:2` 無停止。指示書: `docs/migration/admin-password-change-plan.md`。

### ③ APIタスク定義の seed 漏れ対策 ✅ 完了（2026-06-04）
- seed-prod.jsをSecret読取化（ハードコード廃止・末尾CRLF除去・cost10・冪等skip・boot非停止）。タスク定義 `sinmirai-api:4`（command=null＝Dockerfile CMDのseed込みを採用）＋`ADMIN_INITIAL_PASSWORD`注入。
- 検証: 起動ログ migrate→`seed: admin already exists; skipped`→Nest起動、稼働digest一致、health200/login201、TG healthy。コード変更は `apps/api/seed-prod.js` のみ。指示書: `docs/migration/seed-bootstrap-plan.md`。

### ④ ユーザー管理機能（RBAC・3ロール）✅ 本番反映・検証完了（2026-06-04）
- master/editor/viewer の3ロール、ユーザーCRUD・PWリセット・論理削除、メールログイン統一。実装 `b068f75`、デプロイ手順書 `docs/features/user-management-deploy.md`。
- 本番: `sinmirai-api:5`(env `ADMIN_INITIAL_EMAIL`)、マイグレーション `20260604090000_admin_users_rbac` 適用。検証: master email 201/role=master、editor/viewer 403、無効化401、自己保護400、`/users` masterのみ。
- 詳細はメモリ `user-management-feature.md`。

## 4b. 残・軽微な未処理
- RBACライブ検証で作った**無効テストユーザー2件**（`codex-viewer-*` / `codex-editor-*`、isActive=false）が `admins` に残存。無害だが完全削除はDBワンオフ要（アプリは論理削除のみ）。気になればワンオフ手順書を作成。
- 自己PW変更画面/API（ユーザー管理のスコープ外。要望あれば追加）。

## 5. 重要な落とし穴（再掲）
- web の TG ヘルスチェックパスは必ず **`/login`**（`/` は middleware が307で落ちる）。
- web は `NEXT_PUBLIC_API_URL` を**ビルド時に焼き込む** → APIオリジン確定後にビルド。
- `CORS_ORIGIN` 未設定/不一致だと web→api がブラウザでCORSエラー。
- AWS CLI 既定リージョンは **ap-northeast-3**。東京を触る時のみ `--region ap-northeast-1` を明示。
- Secrets値取得時は末尾改行に注意（`.Trim()`）。
- 本番DB/データ削除など不可逆操作は Claude は実行しない → ユーザーにコマンドを渡す。
- **管理ログインはメール**（loginId廃止）。フロント/DTO/JWT/seed が全てemail前提。
- **web Docker build**: `.dockerignore` で nested `.next`/`dist`/`*.tsbuildinfo`/`.codex-*` を除外済み（混入するとbuild不安定）。
- **検証環境の癖（bash側）**: 既定 `python3` はWindowsスタブで機能しない（`--version`が「Python」のみ）。`node` も非常に古く `let`/アロー不可。JSON生成は `node -e` のオブジェクトリテラル、抽出は `sed`/`grep` が安全。`/aws/...` で始まるログ名はGit Bashがパス変換するので **PowerShell** で扱う。
- AWS権限: この環境のClaudeは **root** で read/write 可（本番変更は役割分担に従いCodeXへ。検証はClaudeがread中心で実施）。

## 6. ドキュメント / git状態
- 指示書（すべてコミット済み）: `docs/migration/{osaka-migration-plan,https-setup-plan,admin-password-change-plan,seed-bootstrap-plan}.md`、`docs/features/{user-management-plan,user-management-deploy}.md`。
- `main` はリモート同期済み（最新 `6177964`）。未push・未コミットなし。

## 7. 再開手順
1. 自動ロードされるメモリ（`prod-env-osaka` / `user-management-feature` / `role-split-codex-implements` / `ecs-web-deploy-gotchas`）+ 本ファイルを確認。
2. `https://fhwm.jp/api/health` 200・ECS running=1（api=`:5`/web=`:1`）で正常確認。
3. 役割分担を厳守（実装=CodeX、Claude=プラン/指示書/検証）。新規依頼はプラン化→指示書→CodeX→Claude検証の流れ。
