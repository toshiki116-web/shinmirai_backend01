# 引き継ぎメモ（次セッション向け） — 2026-06-03 時点

> 新セッションはまず自動ロードされるメモリ（`prod-env-osaka.md` / `role-split-codex-implements.md` / `ecs-web-deploy-gotchas.md`）に目を通すこと。本ファイルは「現在地と次にやること」の要約。

## 1. 役割分担（厳守）
- **実装はCodeX**。Claudeは **プラン作成・CodeX向け指示書作成・完了報告の実コードレビュー**を担当（自分でコードは書かない）。
- 完了報告は鵜呑みにせず、必ず実リソース/実コード/実画面で検証する。

## 2. 現在地（正常基準）
- **本番＝大阪 ap-northeast-3**（アカウント 741448957802）。東京 ap-northeast-1 は**完全削除済み・課金停止**。
- 新環境URL: `http://sinmirai-alb-2133155730.ap-northeast-3.elb.amazonaws.com`
- ヘルス基準: `/api/health` → 200（DB up）、ECS `sinmirai-api`/`sinmirai-web` ともに running=1。
- 構成・接続情報・SecretsのARN・管理者情報は **メモリ `prod-env-osaka.md` に集約**。

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

## 5. 重要な落とし穴（再掲）
- web の TG ヘルスチェックパスは必ず **`/login`**（`/` は middleware が307で落ちる）。
- web は `NEXT_PUBLIC_API_URL` を**ビルド時に焼き込む** → APIオリジン確定後にビルド。
- `CORS_ORIGIN` 未設定/不一致だと web→api がブラウザでCORSエラー。
- AWS CLI 既定リージョンは **ap-northeast-3**。東京を触る時のみ `--region ap-northeast-1` を明示。
- Secrets値取得時は末尾改行に注意（`.Trim()`）。
- 本番DB/データ削除など不可逆操作は Claude は実行しない → ユーザーにコマンドを渡す。

## 6. 未コミット / 関連ファイル
- `docs/migration/osaka-migration-plan.md`（移行指示書、Phase7=東京削除まで完了）※未コミット
- `docs/migration/https-setup-plan.md`（HTTPS化指示書、全Phase完了・検証green）※未コミット
- `docs/migration/admin-password-change-plan.md`（残課題②指示書）※未コミット・CodeX実装待ち
- `docs/migration/seed-bootstrap-plan.md`（残課題③指示書）※未コミット・CodeX実装待ち
- `docs/HANDOFF.md`（本ファイル）※未コミット
- 直近コミット: `ebb567e [fix] サイドバー背景の変数名を修正し濃紺テーマを復元`

## 7. 再開手順
1. メモリ3点 + 本ファイルを確認。
2. `/api/health` 200 と ECS running=1 で新環境の正常を確認。
3. 残課題①〜③のうち着手するものをユーザーに確認 → プラン/CodeX指示書を作成。
