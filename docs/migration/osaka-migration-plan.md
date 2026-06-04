# sinmirai 本番移行プラン兼 CodeX 向け指示書 — 東京 → 大阪（クリーン再構築）

作成: 2026-06-03 / 作成者: Claude（プラン・指示書担当） / 実装担当: CodeX

---

## 0. 目的と方針

東京リージョン（ap-northeast-1）で稼働中の sinmirai 本番環境を停止・削除し、
**大阪リージョン（ap-northeast-3、同AWSアカウント `741448957802`、OCR_scan が稼働中の環境）へ、専用リソースでクリーンに再構築**して移行する。

### 確定した方針（ユーザー合意済み）
- 移行先: **ap-northeast-3（大阪）／同アカウント**
- ネットワーク: **sinmirai 専用VPCを新規作成**（OCR_scan のデフォルトVPCと完全分離）
- データ: **移行不要・クリーン再構築**（RDSは新規・seedのみ、S3は空で作成）
- 旧環境（東京）: **移行・検証が完了してから段階的に削除**（先に削除しない）

### 安全境界（絶対遵守）
以下の OCR_scan 本番リソースには **一切触れない・流用しない・削除しない**:
- RDS `ocr-scan-db`（大阪・デフォルトVPC `vpc-0f9dfaf7835ea194e`）
- S3 `ocr-scan-prod-documents`（ap-northeast-3）
- CloudFront `E1J5R9TRD8JFNJ`（オリジン= ocr-scan-prod-documents）
- 大阪のデフォルトVPC `vpc-0f9dfaf7835ea194e`（OCR_scan が使用）

> CodeX へ: 上記4リソースを変更・削除するコマンドは**実行禁止**。誤操作防止のため、削除系コマンドは必ず対象リージョン・対象IDを明示し、`ap-northeast-1`（旧環境削除フェーズ）と新規作成した sinmirai リソースのみを対象とすること。

---

## 1. 現行（東京 ap-northeast-1）構成スナップショット

| 種別 | 値 |
|---|---|
| ECSクラスタ | `default`（マネージドECS / `.on.aws`） |
| ECSサービス | `sinmirai-web`（desired 1）/ `sinmirai-api`（desired 1） |
| タスク定義 | `default-sinmirai-web:5` / `default-sinmirai-api:10`（Fargate, awsvpc, cpu256/mem512, container名 `Main`, port 3000/tcp） |
| ECR | `sinmirai/api` / `sinmirai/web` |
| RDS | `sinmirai-db`（PostgreSQL 15.10 / db.t4g.micro / 20GB / 単一AZ / 非公開） |
| S3 | `sinmirai-contents-7802` |
| ロググループ | `/aws/ecs/default/sinmirai-api-83e3` / `/aws/ecs/default/sinmirai-web-f9fb` |
| 実行ロール | `arn:aws:iam::741448957802:role/service-role/ecsTaskExecutionRole`（IAMはグローバル＝大阪でも流用可） |
| webドメイン | `si-b623b618ddca4a2ca3eaebceacb763e8.ecs.ap-northeast-1.on.aws` |
| apiドメイン | `si-e796b334305a40a2aac40f7568d4207e.ecs.ap-northeast-1.on.aws` |

### タスク定義の要点（新環境で再現すべき設定）
**api（`Main`コンテナ）**
- 起動コマンド: `sh -c "./node_modules/.bin/prisma migrate deploy && node dist/main"`
  - ⚠️ **現行は `seed-prod.js` を実行していない**。新環境では管理者を作る必要があるため、初回のみ seed を実行すること（後述 Phase 5）。
- 環境変数キー: `NODE_ENV`, `DATABASE_URL`, `JWT_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `CORS_ORIGIN`
  - 値はすべて**新環境用に再設定**（DATABASE_URL=新RDS、JWT_SECRET=新規生成、CORS_ORIGIN=新webオリジン）。旧値はコピーしない。

**web（`Main`コンテナ）**
- 起動コマンド: `entryPoint=["sh","-c"]` / `command=["HOSTNAME=0.0.0.0 node apps/web/server.js"]`
  - ⚠️ Fargate が HOSTNAME を内部ホスト名に上書きするため、この command 上書きは**必須**（環境変数での HOSTNAME 指定は効かない）。
- 環境変数キー: `PORT`, `NODE_ENV`
- ビルド引数: `NEXT_PUBLIC_API_URL=<新api オリジン>/api`（ビルド時に焼き込み。新APIのURL確定後にビルドすること）

---

## 2. 移行先（大阪 ap-northeast-3）ターゲット構成

新規作成するもの（すべて sinmirai 専用・命名は `sinmirai-*`）:

1. **VPC**: 新規 `sinmirai-vpc`（例 CIDR `10.20.0.0/16`。デフォルトVPCの 172.31.0.0/16 と重複しない値）
2. **サブネット**: パブリック×2（AZ `ap-northeast-3a` / `ap-northeast-3c`、ALB・Fargate用）。必要に応じプライベート×2（RDS用）。
3. **IGW / ルートテーブル**、必要なら NAT（コスト判断。パブリックサブネット+`assignPublicIp=ENABLED` でNAT回避も可）
4. **セキュリティグループ**:
   - `sinmirai-alb-sg`（443/80 inbound from 0.0.0.0/0）
   - `sinmirai-app-sg`（3000 inbound from alb-sg）
   - `sinmirai-rds-sg`（5432 inbound from app-sg のみ）
5. **RDS**: `sinmirai-db`（PostgreSQL 15.x / db.t4g.micro / 20GB / sinmirai-vpc 内 / 非公開 / 新規DBサブネットグループ）。**クリーン（空）**。
6. **ECR**: `sinmirai/api` / `sinmirai/web`（大阪）
7. **ECSクラスタ**: `sinmirai`（Fargate）
8. **ALB + ターゲットグループ**:
   - api用 TG（HCパス `/api/health`、matcher 200）
   - web用 TG（**HCパス `/login`**、matcher 200） ← ⚠️ 既知の落とし穴（後述）
   - リスナールールでパス振り分け（`/api/*`→api、それ以外→web）
9. **タスク定義 / サービス**: api・web（cpu256/mem512、awsvpc、上記command踏襲）
10. **S3**: `sinmirai-contents-<suffix>`（大阪・**空**）
11. **ロググループ**: `/aws/ecs/sinmirai/api` / `/aws/ecs/sinmirai/web`

> アーキテクチャ判断【確定 2026-06-03・ユーザー承認済み】: **新環境は自前ALB＋Fargate（明示制御）で構築する**。旧環境のマネージドECS（`.on.aws`＋ゲートウェイTG自動生成）は HCパスが `/` に戻る不具合があり運用が不安定だった（[ecs-web-deploy-gotchas メモリ参照]、東京で307ロールバックを実際に2回踏んだ）ため踏襲しない。CodeX はマネージドECS（`.on.aws`）方式を使わず、ACM証明書＋ALB＋ターゲットグループ＋リスナールールを明示的に作成・管理すること。

---

## 3. 実装手順（フェーズ別・CodeX実行）

> 各フェーズ完了ごとに、作成したリソースID・確認コマンド出力を完了報告に含めること。
> `--region ap-northeast-3` を全コマンドに付けること（既定リージョン誤りを防ぐ）。

### Phase 1: ネットワーク基盤（大阪）
- VPC / サブネット×2(or 4) / IGW / ルートテーブル / 3つのSG を作成。
- 受け入れ: `describe-vpcs` で sinmirai-vpc が存在、サブネットが2AZに分散。

### Phase 2: データストア
- DBサブネットグループ作成 → RDS `sinmirai-db` 作成（非公開、rds-sg 付与）。
- S3 `sinmirai-contents-<suffix>` を空で作成（パブリックアクセスブロック有効）。
- 受け入れ: RDS `available`、エンドポイント取得。

### Phase 3: コンテナイメージ
- 大阪に ECR `sinmirai/api`・`sinmirai/web` を作成。
- イメージ供給（いずれか）:
  - (a) 東京ECRからクロスリージョンコピー（`docker pull`→`tag`→`push`、または crane/skopeo）
  - (b) ローカルから再ビルド→大阪ECRへpush（web は **`NEXT_PUBLIC_API_URL=<新apiオリジン>/api` を確定後にビルド**）
- 注意: web は API URL を焼き込むため、**ALB/apiオリジン確定 → webビルド** の順。

### Phase 4: ECS基盤
- ECSクラスタ `sinmirai` 作成。
- ロググループ作成。
- ALB + api/web TG（**web TG の HCパスは必ず `/login`**）+ リスナールール作成。
- タスク定義登録（api / web、env を新値で設定）→ サービス作成（Fargate、awsvpc、app-sg、対象サブネット）。
- 受け入れ: 両サービス steady state、TGターゲットが healthy。

### Phase 5: マイグレーション & 初期データ（クリーン）
- api 初回起動で `prisma migrate deploy` が走る（タスク定義command）。
- **管理者の作成**: 一度だけ `node seed-prod.js`（または `prisma/seed.ts`）を実行（ワンオフECSタスクの command 上書き、または api タスク定義の初回 command に一時的に付与）。
  - seed-prod.js は `sinmirai-admin` を作成（パスワードはハッシュ固定）。**新環境では新しい初期パスワードを設定し直すことを推奨**（規約: 12文字以上ランダム、平文はユーザーへ安全に共有）。
- 受け入れ: `admins` に `sinmirai-admin` が1件。

### Phase 6: 検証（合格まで旧環境を消さない）
- 新web URL（大阪 ALB / `.on.aws`）へ実ブラウザでアクセス。
- ① ログイン成功（`sinmirai-admin` + 設定したパスワード）
- ② 拠点管理 `/sites` 表示、サイドバーが濃紺背景＋可読（今回の修正反映確認）
- ③ api 疎通（`/api/health` 200、ログインAPIでJWT発行）
- ④ CORS: web→api 呼び出しがブラウザでエラーにならない（`CORS_ORIGIN`=新webオリジンが正しいこと）
- ⑤ `getComputedStyle(documentElement).--sidebar` が定義されている / CSSチャンクが新ビルドである
- 受け入れ: ①〜⑤すべて green。

### Phase 7: 旧環境（東京 ap-northeast-1）削除 ★承認制・段階的
> このフェーズは**ユーザーの明示承認後**、1ステップずつ実施。各削除前に対象を提示し確認を取る。
> RDS・S3 の削除は**データ永久消失**のため、最終スナップショット要否をユーザーに確認すること。

削除順序（依存関係順）:
1. ECSサービス `sinmirai-web` / `sinmirai-api` を desired 0 → 削除
2. ECSタスク定義の無効化（任意・履歴は残してよい）
3. ALB / ゲートウェイTG（マネージドECS由来のもの。**他プロジェクト共有でないこと**を確認してから）
4. RDS `sinmirai-db` 削除（**最終スナップショット要否を確認**）
5. S3 `sinmirai-contents-7802` 空にして削除（中身不要を確認済み）
6. ECR `sinmirai/api`・`sinmirai/web`（東京）削除
7. ロググループ削除、関連IAM/SG等の後始末
8. VPC等ネットワーク（東京の sinmirai 専用分のみ）

> ⚠️ 削除は不可逆。Claude（レビュー担当）はこのフェーズの実行ログを実リソースと突き合わせ、OCR_scan・他プロジェクトのリソースが巻き込まれていないか検証する。

---

## 4. 既知の落とし穴（必ず踏襲）
1. **web TG の HCパスは `/login`**。`/` は middleware が `/login` へ 307 リダイレクトし `[307]` で unhealthy → デプロイ失敗・ロールバックになる（2026-06-03 に東京で再発済み）。
2. **HOSTNAME=0.0.0.0 を command で強制**（Fargate が上書きするため env では効かない）。
3. **web は NEXT_PUBLIC_API_URL をビルド時に焼き込む** → APIオリジン確定後にビルド。
4. **CORS_ORIGIN を新webオリジンに設定**（未設定だと `*`＋credentials 仕様違反）。
5. 全コマンドに **`--region ap-northeast-3`**（旧環境削除時のみ ap-northeast-1）。

---

## 5. 完了報告フォーマット（CodeX → Claude）
各フェーズで以下を報告:
- 実行したコマンドと**実際の出力**（リソースID・ARN・エンドポイント）
- 受け入れ条件の判定結果（green/red の根拠）
- 想定外の事象・スキップした項目

## 6. Claude のレビュー観点（報告を鵜呑みにしない）
- 報告のリソースIDを `describe-*` で実在確認
- web TG HCパスが実際に `/login` か（`describe-target-groups`）
- 新env値が正しいか（DATABASE_URL が新RDS、CORS_ORIGIN が新webオリジン）
- 実ブラウザでログイン〜/sites 表示〜サイドバー濃紺を目視
- 削除フェーズ: OCR_scan の4リソースが無傷であることを確認

## 7. ロールバック方針
- 検証（Phase 6）合格まで**東京を稼働させたまま**にする。新環境に問題があれば大阪リソースを破棄してやり直す（東京は無傷なので即時切り戻し可能）。
- DNS/参照の切替（もしあれば）は Phase 6 合格後に実施。
