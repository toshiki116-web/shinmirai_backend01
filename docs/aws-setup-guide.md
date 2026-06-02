# AWS環境構築手順書 — シン・ミライ人間洗濯機

## 構成概要

| サービス | 用途 | スペック |
|---------|------|---------|
| App Runner (API) | NestJS APIサーバー | 0.25 vCPU / 0.5GB |
| App Runner (Web) | Next.js 管理画面 | 0.25 vCPU / 0.5GB |
| RDS PostgreSQL | データベース | db.t4g.micro / 20GB |
| ECR | Dockerイメージ保管 | API用 + Web用 |
| S3 | 動画コンテンツ保管 | 標準ストレージ |
| Route 53 | DNS（任意） | ホストゾーン1つ |

## 前提条件

- AWSアカウントを持っていること
- AWS CLIがインストール済み（デプロイ時に使用）
- リージョン: **ap-northeast-1**（東京）

---

## Step 1: VPC・ネットワーク設定

### 1.1 VPCを作成

1. **VPC** コンソール → 「VPCを作成」
2. 設定:
   - 名前: `sinmirai-vpc`
   - IPv4 CIDR: `10.0.0.0/16`
   - 「VPCなど」を選択（サブネット等を一括作成）
   - アベイラビリティゾーン: **2**
   - パブリックサブネット: **2**
   - プライベートサブネット: **2**
   - NATゲートウェイ: **なし**（コスト削減。App Runnerはパブリックサブネット不要）
   - VPCエンドポイント: **なし**
3. 「VPCを作成」をクリック

### 1.2 セキュリティグループ作成（RDS用）

1. **VPC** → セキュリティグループ → 「セキュリティグループを作成」
2. 設定:
   - 名前: `sinmirai-rds-sg`
   - VPC: `sinmirai-vpc`
   - インバウンドルール:
     - タイプ: PostgreSQL (5432)
     - ソース: `10.0.0.0/16`（VPC内からのみ）
3. 作成

---

## Step 2: RDS（PostgreSQL）

### 2.1 サブネットグループ作成

1. **RDS** コンソール → サブネットグループ → 「DBサブネットグループを作成」
2. 設定:
   - 名前: `sinmirai-db-subnet`
   - VPC: `sinmirai-vpc`
   - アベイラビリティゾーン: 2つ選択
   - サブネット: **プライベートサブネット2つ**を選択
3. 作成

### 2.2 RDSインスタンス作成

1. **RDS** → 「データベースの作成」
2. 設定:
   - エンジン: **PostgreSQL 15**
   - テンプレート: **無料利用枠**（Free Tier対象）
   - DBインスタンス識別子: `sinmirai-db`
   - マスターユーザー名: `postgres`
   - マスターパスワード: **安全なパスワードを設定**（メモしておくこと）
   - インスタンスクラス: `db.t4g.micro`
   - ストレージ: gp3 / 20GB / 自動スケーリング無効
   - VPC: `sinmirai-vpc`
   - サブネットグループ: `sinmirai-db-subnet`
   - パブリックアクセス: **いいえ**
   - セキュリティグループ: `sinmirai-rds-sg`
   - 初期データベース名: `sinmirai_db`
   - バックアップ保持期間: 7日
   - 暗号化: 有効
   - パフォーマンスインサイト: 無効（コスト削減）
3. 「データベースの作成」

> **メモ**: 作成後に表示される**エンドポイント**（例: `sinmirai-db.xxxx.ap-northeast-1.rds.amazonaws.com`）を控えてください。

---

## Step 3: S3バケット

1. **S3** コンソール → 「バケットを作成」
2. 設定:
   - バケット名: `sinmirai-contents-{アカウントID下4桁}`（グローバルで一意）
   - リージョン: `ap-northeast-1`
   - パブリックアクセス: **すべてブロック**
   - バージョニング: 無効
   - 暗号化: SSE-S3
3. 作成

---

## Step 4: ECR（コンテナレジストリ）

### 4.1 APIリポジトリ

1. **ECR** コンソール → 「リポジトリを作成」
2. 設定:
   - リポジトリ名: `sinmirai/api`
   - イメージタグの変更可能性: 可変
   - 暗号化: AES-256
3. 作成

### 4.2 Webリポジトリ

1. 同様に作成:
   - リポジトリ名: `sinmirai/web`

---

## Step 5: Dockerイメージをビルド & プッシュ

### 5.1 AWS CLIでECRにログイン

```bash
aws ecr get-login-password --region ap-northeast-1 | docker login --username AWS --password-stdin {アカウントID}.dkr.ecr.ap-northeast-1.amazonaws.com
```

### 5.2 APIイメージをビルド & プッシュ

```bash
cd E:\nagano_projects\shinmirai_backend01

# ビルド
docker build -t sinmirai/api -f apps/api/Dockerfile .

# タグ付け
docker tag sinmirai/api:latest {アカウントID}.dkr.ecr.ap-northeast-1.amazonaws.com/sinmirai/api:latest

# プッシュ
docker push {アカウントID}.dkr.ecr.ap-northeast-1.amazonaws.com/sinmirai/api:latest
```

### 5.3 Webイメージをビルド & プッシュ

> Web用のDockerfileは Step 6 で作成します。

---

## Step 6: Next.js用Dockerfile作成

プロジェクトルートで以下を実行（※ファイルはこの手順書とは別にClaude Codeで作成済み）:

```dockerfile
# apps/web/Dockerfile に配置
```

---

## Step 7: App Runner（APIサーバー）

### 7.1 VPCコネクタ作成

1. **App Runner** コンソール → VPCコネクタ → 「作成」
2. 設定:
   - 名前: `sinmirai-vpc-connector`
   - VPC: `sinmirai-vpc`
   - サブネット: プライベートサブネット2つ
   - セキュリティグループ: `sinmirai-rds-sg`（RDSへのアクセス許可）
3. 作成

### 7.2 APIサービス作成

1. **App Runner** → 「サービスを作成」
2. ソースとデプロイ:
   - リポジトリタイプ: **コンテナレジストリ**
   - プロバイダ: **Amazon ECR**
   - コンテナイメージURI: `{アカウントID}.dkr.ecr.ap-northeast-1.amazonaws.com/sinmirai/api:latest`
   - デプロイトリガー: **自動**（ECRプッシュ時に自動デプロイ）
   - ECRアクセスロール: 新規作成
3. サービスの設定:
   - サービス名: `sinmirai-api`
   - CPU: **0.25 vCPU**
   - メモリ: **0.5 GB**
   - ポート: **3000**
   - 環境変数:

     | キー | 値 |
     |------|-----|
     | `DATABASE_URL` | `postgresql://postgres:{パスワード}@{RDSエンドポイント}:5432/sinmirai_db?schema=public` |
     | `JWT_SECRET` | （安全なランダム文字列。`openssl rand -base64 32` で生成） |
     | `JWT_ACCESS_EXPIRES_IN` | `24h` |
     | `NODE_ENV` | `production` |
     | `CORS_ORIGIN` | `https://{Web側のApp Runnerドメインまたはカスタムドメイン}` |

   - ヘルスチェック:
     - プロトコル: HTTP
     - パス: `/api/health`
4. ネットワーク:
   - 受信: パブリック
   - 送信: **カスタムVPC** → `sinmirai-vpc-connector` を選択
5. 「作成とデプロイ」

### 7.3 初回マイグレーション実行

App Runner上のAPIが起動した後、DBマイグレーションを実行する必要があります。
一時的にEC2インスタンスまたはCloudShellからマイグレーションを実行します:

```bash
# CloudShell または VPC内のEC2から実行
# Prisma CLIでマイグレーション
npx prisma migrate deploy

# シードデータ投入
npx ts-node prisma/seed.ts
```

> **代替方法**: App Runnerの起動コマンドをマイグレーション込みに変更:
> `npx prisma migrate deploy && node dist/main`

---

## Step 8: App Runner（管理画面）

1. **App Runner** → 「サービスを作成」
2. 設定:
   - サービス名: `sinmirai-web`
   - コンテナイメージ: `{アカウントID}.dkr.ecr.ap-northeast-1.amazonaws.com/sinmirai/web:latest`
   - CPU: **0.25 vCPU** / メモリ: **0.5 GB**
   - ポート: **3000**
   - 環境変数:

     | キー | 値 |
     |------|-----|
     | `NEXT_PUBLIC_API_URL` | `https://{API側のApp Runnerドメイン}/api` |

   - ネットワーク: パブリック（VPCコネクタ不要）
3. 「作成とデプロイ」

---

## Step 9: 動作確認

1. App Runnerのコンソールで各サービスのステータスが「Running」になるのを確認
2. APIサービスのデフォルトドメインにアクセス:
   - `https://{api-domain}.ap-northeast-1.awsapprunner.com/api/health`
   - `{"result":"ok","data":{"status":"ok",...}}` が返ればOK
3. Webサービスのデフォルトドメインにアクセス:
   - `https://{web-domain}.ap-northeast-1.awsapprunner.com`
   - ログイン画面が表示されればOK

---

## Step 10: カスタムドメイン設定（任意）

1. App Runnerの各サービス → 「カスタムドメイン」
   - API: `api.your-domain.com`
   - Web: `admin.your-domain.com`
2. 表示されるCNAMEレコードをDNSに設定
3. SSL証明書は自動発行・管理

---

## デプロイ手順（以降の更新時）

```bash
# APIを更新
docker build -t sinmirai/api -f apps/api/Dockerfile .
docker tag sinmirai/api:latest {アカウントID}.dkr.ecr.ap-northeast-1.amazonaws.com/sinmirai/api:latest
docker push {アカウントID}.dkr.ecr.ap-northeast-1.amazonaws.com/sinmirai/api:latest
# → App Runnerが自動デプロイ

# Webを更新
docker build -t sinmirai/web -f apps/web/Dockerfile .
docker tag sinmirai/web:latest {アカウントID}.dkr.ecr.ap-northeast-1.amazonaws.com/sinmirai/web:latest
docker push {アカウントID}.dkr.ecr.ap-northeast-1.amazonaws.com/sinmirai/web:latest
# → App Runnerが自動デプロイ
```

---

## コスト見積もり（月額）

| サービス | 金額 (USD) | 備考 |
|---------|-----------|------|
| App Runner (API) | $7.20 | 0.25 vCPU × $0.007/時 × 720時 + 0.5GB × $0.007/時 × 720時 |
| App Runner (Web) | $7.20 | 同上 |
| RDS db.t4g.micro | $0 〜 $12.41 | Free Tier対象（12ヶ月間無料） |
| S3 (10GB) | $0.25 | $0.025/GB |
| ECR (2GB) | $0.20 | $0.10/GB |
| データ転送 | $1〜2 | 小規模のため最小限 |
| **合計** | **$16〜30/月** | Free Tier期間中は約$16 |

---

## セキュリティチェックリスト

- [ ] RDSのパブリックアクセスが「いいえ」になっていること
- [ ] S3のパブリックアクセスがブロックされていること
- [ ] JWT_SECRETが十分に長いランダム文字列であること
- [ ] RDSのパスワードが強力であること
- [ ] App Runnerの環境変数にシークレットが平文で保存されている点に注意（将来的にSecrets Managerに移行推奨）
- [ ] CORS_ORIGINがワイルドカード（*）でないこと
