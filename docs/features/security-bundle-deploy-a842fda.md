# セキュリティ対応一式（a842fda）— 大阪 ECS 本番デプロイ手順

作成: 2026-10-29 ／ 実施: Claude（ネットワーク接続を許可したモード）／ 承認: ユーザー

> 基本の流れは `docs/features/node-22.23.4-security-redeploy.md`（以下「旧手順」）と同じ。
> 本書は、そこから**変える点と足す点だけでなく、実行するコマンドをすべて**載せる。旧手順と食い違うときは本書を優先する。

## 0. 概要

| 項目 | 内容 |
|---|---|
| デプロイするコミット | **main の `a842fda`**（api・web を1回でまとめて出す。2026-10-29 にユーザーが決定） |
| 本番で稼働中のコミット | `5be7b44`（2026-10-23 の Node 22.23.4 再デプロイ） |
| 含まれる変更 | ① `9cdb99a` 依存パッケージのセキュリティ更新（NestJS 11.2.8 系、overrides 7件、web の画像最適化を無効化）<br>② `29cf382` API セキュリティ修正（login の回数制限、パスワードリセット時のリフレッシュトークン失効と直列化、completeUpload の検証）<br>③ `eaee00a` next 16.4.3<br>④ `a842fda` Dockerfile の pnpm を 11.5.0 に固定し、フォールバックを削除 |
| DB マイグレーション | **なし**（`5be7b44..a842fda` で `apps/api/prisma` と `seed-prod.js` に差分なし【確認済】）。そのため、イメージを戻すだけでロールバックできる |
| タスク定義 | 新しいリビジョンは登録しない。image は `:latest` を参照しているので、**稼働中のリビジョン**と `--force-new-deployment` で反映する |
| 順序 | api → web。1サービスずつ、受け入れ確認が済んでから次へ進む |

### 本番で変わる挙動（利用者への影響）
| 変更 | 影響 |
|---|---|
| login の回数制限（1分あたり1IPにつき10回、タスクごとに数える） | 同じ IP から連続で失敗すると 429 になり、日本語のメッセージが出る。refresh は制限しない |
| パスワードリセットでリフレッシュトークンを失効 | リセットされた本人は、最長15分後（アクセストークンが切れた時点）に再ログインが必要になる |
| completeUpload の検証 | 正規の流れ（upload URL を発行してからアップロードする）には影響しない。動画以外の物や上限を超えた物は FAILED になる |
| web の画像最適化を停止 | `/_next/image` が 404 になる。`next/image` は使っていないので、画面への影響はない |

### 本番環境（大阪 ap-northeast-3 / アカウント 741448957802）
旧手順 §0 の表と同じ（クラスタ `sinmirai`、サービス `sinmirai-api`・`sinmirai-web`、ECR `sinmirai/api`・`sinmirai/web`、HC は api=`/api/health`・web=`/login`、URL `https://fhwm.jp`）。

---

## 1. 事前準備

1. **ネットワーク隔離の無いモードで実行する**。隔離されていると、ECR への push とビルド中のダウンロードが失敗する。
2. Docker のデーモンが応答することと、空き容量を確認する。
   ```bash
   docker version
   df -h /c /e     # 足りなければ docker builder prune -af
   ```
3. AWS の認証と ECR へのログイン。
   ```bash
   aws sts get-caller-identity --query Account --output text   # 741448957802
   aws ecr get-login-password --region ap-northeast-3 \
     | docker login --username AWS --password-stdin 741448957802.dkr.ecr.ap-northeast-3.amazonaws.com
   ```
4. **作業ツリーを a842fda にする**（旧手順 §1-5 の差し替え。本番のコミットには戻さない）。
   ```bash
   cd /e/nagano_projects/shinmirai_backend01
   git log -1 --format=%h                                                    # a842fda
   git status --short -- apps packages pnpm-lock.yaml pnpm-workspace.yaml   # 何も出ないこと
   ls -d apps/web/public                                                     # 存在すること（git に無い空ディレクトリ。無いと web のビルドが失敗する）
   ```

## 2. 稼働状態の記録（ロールバック用）

旧手順 §2 の差し替え。**ECR の `:latest` ではなく、稼働中タスクの実ダイジェスト**を記録する。リビジョンは決め打ちしない。

```bash
REGION=ap-northeast-3
CLUSTER=sinmirai
ECR=741448957802.dkr.ecr.ap-northeast-3.amazonaws.com

for S in api web; do
  echo "== $S"
  aws ecs describe-services --region $REGION --cluster $CLUSTER --services sinmirai-$S \
    --query "services[0].{td:taskDefinition,running:runningCount,deployments:length(deployments)}"
  TASKS=$(aws ecs list-tasks --region $REGION --cluster $CLUSTER --service-name sinmirai-$S \
    --desired-status RUNNING --query "taskArns" --output text)
  aws ecs describe-tasks --region $REGION --cluster $CLUSTER --tasks $TASKS \
    --query "tasks[].containers[0].imageDigest" --output text
done
```

合格条件（1つでも外れたら着手しない）:
- 各サービスの `deployments` が **1**（デプロイ途中ではない）。
- 各サービスの全タスクのダイジェストが**同じ**。
- そのダイジェストが ECR に残っている:
  ```bash
  aws ecr describe-images --region $REGION --repository-name sinmirai/<api|web> \
    --image-ids imageDigest=<記録した値> --query "imageDetails[0].imageDigest" --output text
  ```

記録するもの: api と web それぞれの **リビジョン・タスク数 N・稼働ダイジェスト**。

## 3. デプロイ前の本番構成の確認（api の回数制限の前提）

`api-security-hardening-plan.md` §5 による。**満たさなければデプロイしない**。

```bash
# ① ALB の X-Forwarded-For の扱いが append であること
ALB_ARN=$(aws elbv2 describe-load-balancers --region $REGION --names sinmirai-alb \
  --query "LoadBalancers[0].LoadBalancerArn" --output text)
aws elbv2 describe-load-balancer-attributes --region $REGION --load-balancer-arn $ALB_ARN \
  --query "Attributes[?Key=='routing.http.xff_header_processing.mode'].Value" --output text
#   → append（何も出ない場合は既定値の append）

# ② api タスクの SG のインバウンドが、ALB の SG からだけ許可されていること
API_SG=$(aws ecs describe-services --region $REGION --cluster $CLUSTER --services sinmirai-api \
  --query "services[0].networkConfiguration.awsvpcConfiguration.securityGroups" --output text)
ALB_SG=$(aws elbv2 describe-load-balancers --region $REGION --names sinmirai-alb \
  --query "LoadBalancers[0].SecurityGroups" --output text)
echo "api_sg=$API_SG alb_sg=$ALB_SG"
aws ec2 describe-security-groups --region $REGION --group-ids $API_SG \
  --query "SecurityGroups[].IpPermissions[].{port:FromPort,cidr:IpRanges[].CidrIp,sg:UserIdGroupPairs[].GroupId}"
#   → cidr が空、sg が ALB_SG だけ
```

## 4. api のビルド・デプロイ

### 4-1. ビルド
```bash
docker build --pull --progress=plain -t sinmirai/api -f apps/api/Dockerfile . 2>&1 | tee "$TEMP/deploy-api.log"
grep -E "using pnpm v|ERR_PNPM" "$TEMP/deploy-api.log"
```
合格条件: `Done in ... using pnpm v11.5.0` の行があり、`ERR_PNPM` が0行。ビルドが成功している。

### 4-2. ローカル検証（push の前）
```bash
docker run --rm sinmirai/api node -v                                   # v22.23.4 以上
MSYS_NO_PATHCONV=1 docker run --rm --entrypoint sh sinmirai/api \
  -c 'node -e "require(\"@sinmirai/shared\")" && echo shared-ok'       # shared-ok
MSYS_NO_PATHCONV=1 docker run --rm --entrypoint sh sinmirai/api \
  -c 'node -e "console.log(require(\"@nestjs/core/package.json\").version, require(\"@nestjs/throttler/package.json\").version)"'
#   → 11.2.x と 6.7.x
```
どれかが期待と違えば**ここで中止**する（本番には何も影響していない）。

### 4-3. push とデプロイ
```bash
docker tag sinmirai/api $ECR/sinmirai/api:latest
docker push $ECR/sinmirai/api:latest          # 表示された digest を記録

aws ecs update-service --region $REGION --cluster $CLUSTER --service sinmirai-api \
  --task-definition "<§2で記録した api のリビジョン>" --force-new-deployment \
  --query "service.deployments[0].{td:taskDefinition,state:rolloutState}"
aws ecs wait services-stable --region $REGION --cluster $CLUSTER --services sinmirai-api
```

### 4-4. api の受け入れ確認
旧手順 §3-4 の ①〜④ を行う（ロールアウトが COMPLETED でリビジョンが記録値のまま、稼働ダイジェストが push した値と一致、`/api/health` が 200、events に rolling back / failed が無い）。加えて次を行う。

**回数制限の確認**（実在するアカウントは使わない）:
```bash
N=<§2で記録した api のタスク数>
for i in $(seq 1 $((10*N+1))); do
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST https://fhwm.jp/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"throttle-check-nonexistent@example.invalid","password":"wrong-password"}')
  echo "$i $code"
  [ "$code" = "429" ] && break
done
```
- 合格条件: 10×N+1 回以内に **429** が出る（何回目かは振り分け次第なので、記録だけする）。
- 429 を確認したら **1分待ち**、同じ要求が **401** に戻ることを確認する。
- この確認で、作業端末の IP は最大1分間ロックされる。§7 の人手のログインは、1分以上空けてから行う。

## 5. web のビルド・デプロイ

### 5-1. ビルド
```bash
docker build --pull --progress=plain -t sinmirai/web -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://fhwm.jp/api . 2>&1 | tee "$TEMP/deploy-web.log"
grep -E "using pnpm v|ERR_PNPM" "$TEMP/deploy-web.log"
```
合格条件は §4-1 と同じ。`NEXT_PUBLIC_API_URL` の値を間違えると、管理画面が API に繋がらなくなる。

### 5-2. ローカル検証（push の前）
```bash
docker run --rm sinmirai/web node -v                                   # v22.23.4 以上
docker run --rm sinmirai/web node -e "console.log(require('next/package.json').version)"   # 16.4.3
docker run --rm sinmirai/web node -e "console.log(require('./apps/web/.next/required-server-files.json').config.images.unoptimized)"   # true
docker run -d --name web-predeploy -p 3999:3000 sinmirai/web
# 数秒待ってから
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3999/login                                       # 200
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3999/_next/image?url=%2Ffavicon.ico&w=64&q=75"  # 404
docker rm -f web-predeploy
```
`required-server-files.json` のパスが違うときや、`require('next/package.json')` が解決できないとき（standalone では `apps/web/node_modules/next` 側にあることがある）は、探して確認し、そのパスを記録する。これは版の確認方法の問題なので、中止の理由にはしない。どれかが期待と違えば**ここで中止**する（api は新しいまま動いていてよい。web の変更は api に依存しない）。

### 5-3. push とデプロイ
```bash
docker tag sinmirai/web $ECR/sinmirai/web:latest
docker push $ECR/sinmirai/web:latest          # digest を記録

aws ecs update-service --region $REGION --cluster $CLUSTER --service sinmirai-web \
  --task-definition "<§2で記録した web のリビジョン>" --force-new-deployment \
  --query "service.deployments[0].{td:taskDefinition,state:rolloutState}"
aws ecs wait services-stable --region $REGION --cluster $CLUSTER --services sinmirai-web
```

### 5-4. web の受け入れ確認
旧手順 §3-4 の ①②④ を `sinmirai-web` に置き換えて行う。加えて:
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://fhwm.jp/login                                       # 200
curl -s -o /dev/null -w "%{http_code}\n" https://fhwm.jp/                                            # 307
curl -s -o /dev/null -w "%{http_code}\n" "https://fhwm.jp/_next/image?url=%2Ffavicon.ico&w=64&q=75"  # 404
```

## 6. ロールバック

旧手順 §6 の操作を、**§2 で記録した稼働ダイジェストとリビジョン**で行う。DB マイグレーションが無いので、イメージを戻すだけで元に戻る。

| 症状 | 戻す対象 |
|---|---|
| api の起動失敗、`/api/health` が 200 でない、ログインやアップロードの不具合 | api だけ |
| 画面が出ない、スタイルが崩れる、`/login` が 200 でない | web だけ |
| 判断がつかない | api と web の両方 |

- ECS のデプロイサーキットブレーカーが自動でロールバックした場合（events に rolling back）は、それ以上手を出さず、状態を記録して報告する。
- ロールバックすると脆弱な依存に戻る。原因を潰して早めに再実施する。

## 7. 機能確認（人手・ユーザー本人がログインする）

§4-4 の回数制限の確認から1分以上空け、ブラウザで `https://fhwm.jp` にログインする。
- [ ] ログインできる（回数制限の誤作動が無い）
- [ ] ダッシュボード・拠点一覧・筐体一覧が表示され、スタイルが崩れていない（next 16.4.3）
- [ ] コンテンツ詳細で、動画とサムネイルが表示・再生できる（CloudFront 署名 URL）
- [ ] 筐体詳細の最終通信時刻が更新されている（heartbeat が届いている）
- [ ] 15分以上操作を続けても、ログアウトされない（refresh が正常）
- [ ] （任意）動画を1本アップロードし、READY になる（completeUpload の検証）

パスワードリセットのトークン失効は、e2e テストで確認済みのため、本番では行わない（実在する管理者のセッションを切るため）。

## 8. 完了チェック

- [ ] §2: リビジョン・タスク数・稼働ダイジェスト（api・web）を記録した。ECR に残っていることを確認した
- [ ] §3: ALB の XFF が append、api の SG が ALB の SG からだけ
- [ ] api: pnpm 11.5.0 / ERR_PNPM なし / node と依存の版 / push / COMPLETED / ダイジェスト一致 / `/api/health` 200 / 10×N+1 回以内に 429 / 1分後に 401
- [ ] web: pnpm 11.5.0 / ERR_PNPM なし / next 16.4.3 / unoptimized true / push / COMPLETED / ダイジェスト一致 / `/login` 200 / `/` 307 / `/_next/image` 404
- [ ] タスク定義のリビジョンが §2 の記録値から変わっていない
- [ ] §7 の機能確認（ユーザー）
- [ ] 実施日・新しいダイジェストをプロジェクトメモに記録した。`git push origin main` はユーザーの指示があってから行う
