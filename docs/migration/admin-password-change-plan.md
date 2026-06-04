# sinmirai 管理者パスワード変更 — CodeX向け指示書

作成: 2026-06-04 / 作成者: Claude（プラン・指示書担当） / 実装担当: CodeX
対象環境: **大阪 ap-northeast-3 / アカウント 741448957802**

---

## 0. 目的と背景

本番管理者 `sinmirai-admin` の初期パスワードを、新しいランダムパスワードへ変更する。

### コード調査結果（Claude・2026-06-04）
- **アプリにパスワード変更エンドポイントは存在しない**（`/api/admin/*` は contents/sites/units のみ、auth は login のみ）。よって「ログイン後にUIで変更」は不可。
- 管理者パスワードは **bcryptハッシュ**で `admins.password`（テーブル `admins`、列 `password`）に保存。ログインは `bcrypt.compare(入力, admin.password)` で検証（[auth.service.ts:25](apps/api/src/auth/auth.service.ts)）。
- `seed-prod.js` はハッシュをハードコードして作成（cost=10 / `$2b$10$...`）。
- → **DBの `admins.password` を新bcryptハッシュで直接更新する**のが唯一の方法。

### 確定方針（ユーザー合意済み）
- 新PW: **CodeXが12文字以上のランダム生成**（英大小・数字・記号を含む。プロジェクト名を含めない）。**平文はチャット/ログに出さない**。
- 保管先: **既存Secret `sinmirai/prod/admin-initial-password` の値を上書き**（現パスワードの保管場所として運用）。
- 実行方式: **ワンオフ ECSタスク**（api タスク定義を流用、command上書き）でVPC内からRDSを更新。RDS公開や `enableExecuteCommand` は不要。
- 秘密注入: task role が無いため runtime SDK取得は使わず、**execution role による Secret 注入**（task定義の `secrets`）で新PWをコンテナに渡す。

---

## 1. 事前確認済みの実リソース（Claude調査・2026-06-04）

| 種別 | 値 |
|---|---|
| admin Secret ARN | `arn:aws:secretsmanager:ap-northeast-3:741448957802:secret:sinmirai/prod/admin-initial-password-djOIpV` |
| 現行 api タスク定義 | `sinmirai-api:2`（live。container `Main`、image `.../sinmirai/api:latest`） |
| execution role | `arn:aws:iam::741448957802:role/service-role/ecsTaskExecutionRole`（DATABASE_URL/JWT_SECRET を注入中） |
| task role | **なし(null)** ← runtime SDKでSecret取得不可。注入方式必須 |
| DATABASE_URL Secret | `arn:aws:secretsmanager:ap-northeast-3:741448957802:secret:sinmirai/prod/database-url-rFzPWw`（タスク定義で注入済み） |
| ワンオフ用 subnets | `subnet-0e6037564593ab25b`, `subnet-0731ad007693389e1`（assignPublicIp=ENABLED） |
| ワンオフ用 SG（app-sg） | `sg-0ba9f0e11910ca5e4`（RDS 5432へ到達可。api serviceと同一） |
| 依存パッケージ（image内） | `bcrypt@^6`, `@prisma/client@^6.9`（prod依存＝image同梱、ネイティブビルド済み） |
| 管理者 | loginId `sinmirai-admin` |

---

## 2. 実装手順（フェーズ別）

> 全コマンドに **`--region ap-northeast-3`**。**新PWの平文を echo / ログ出力 / コマンド履歴に残さない**こと（環境変数経由で扱う）。

### Phase A: 新PW生成 → Secret上書き
1. 12文字以上・英大小数字記号を含むランダムPWを生成し、**環境変数に格納（画面出力しない）**。例（CodeXの裁量で同等の生成でよい）:
   ```bash
   # 例: 各クラスを1文字以上保証しつつ十分な長さに
   NEWPW="$(python3 - <<'PY'
import secrets,string
a=string.ascii_lowercase;b=string.ascii_uppercase;d=string.digits;s="!@#%^&*-_=+"
import random
pw=[secrets.choice(a),secrets.choice(b),secrets.choice(d),secrets.choice(s)]
pw+=[secrets.choice(a+b+d+s) for _ in range(12)]
random.SystemRandom().shuffle(pw)
print(''.join(pw),end='')   # 末尾改行なし
PY
)"
   ```
   - ⚠️ **末尾改行を付けない**（後述の落とし穴①）。
2. 既存Secretを上書き（CloudTrailは secret-string 値を記録しないが、`echo "$NEWPW"` は禁止）:
   ```bash
   aws secretsmanager put-secret-value --region ap-northeast-3 \
     --secret-id sinmirai/prod/admin-initial-password \
     --secret-string "$NEWPW" --query VersionId --output text
   ```
- **受け入れ**: 新 VersionId が返る。`describe-secret` の `LastChangedDate` が更新。**値は表示しない**（長さ確認のみ可: `printf %s "$NEWPW" | wc -c` が12以上）。

### Phase B: ワンオフ ECSタスクで `admins.password` を更新
**B-1. execution role の Secret 読み取り権限を確認**
```bash
aws iam list-role-policies --role-name ecsTaskExecutionRole
aws iam list-attached-role-policies --role-name ecsTaskExecutionRole
```
- admin Secret ARN（`...admin-initial-password-djOIpV`）が `secretsmanager:GetSecretValue` の Resource に含まれるか確認。
- 含まれない場合（database-url/jwt-secret の2 ARN限定の可能性大）、admin Secret ARN を許可するインラインポリシーを追加（既存ポリシーのResource配列に追加 or 新規 `sinmirai-admin-secret-read` を付与）。**この付与はユーザー承認の上で実施**。

**B-2. 一時タスク定義リビジョンを登録**（`sinmirai-api:2` を複製し `ADMIN_NEW_PASSWORD` 注入を追加）
- `describe-task-definition sinmirai-api:2` のJSONを取得 → `secrets` に以下を追加して `register-task-definition`:
  ```json
  { "name": "ADMIN_NEW_PASSWORD",
    "valueFrom": "arn:aws:secretsmanager:ap-northeast-3:741448957802:secret:sinmirai/prod/admin-initial-password-djOIpV" }
  ```
- 既存の DATABASE_URL/JWT_SECRET 注入・env・logConfiguration は維持。command はこのリビジョンでは変更不要（次のrun-taskで上書きする）。
- 登録結果のリビジョン番号（例 `sinmirai-api:3`）を控える。

**B-3. ワンオフ実行**（command上書きで更新スクリプトを実行）
更新スクリプト（**管理者idのみログ出力、PW/ハッシュは出さない**、cost=10で既存と整合）:
```bash
SCRIPT='const bcrypt=require("bcrypt");const{PrismaClient}=require("@prisma/client");const p=new PrismaClient();(async()=>{const pw=process.env.ADMIN_NEW_PASSWORD;if(!pw){throw new Error("ADMIN_NEW_PASSWORD empty")}const h=await bcrypt.hash(pw,10);const r=await p.admin.update({where:{loginId:"sinmirai-admin"},data:{password:h}});console.log("updated admin id:",r.id);await p.$disconnect();})().catch(e=>{console.error("ERR",e&&e.message);process.exit(1)});'

aws ecs run-task --region ap-northeast-3 --cluster sinmirai \
  --task-definition sinmirai-api:3 --launch-type FARGATE --count 1 \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-0e6037564593ab25b,subnet-0731ad007693389e1],securityGroups=[sg-0ba9f0e11910ca5e4],assignPublicIp=ENABLED}" \
  --overrides "{\"containerOverrides\":[{\"name\":\"Main\",\"command\":[\"node\",\"-e\",\"$SCRIPT\"]}]}" \
  --query "tasks[0].taskArn" --output text
```
**B-4. 完了確認**
```bash
aws ecs wait tasks-stopped --region ap-northeast-3 --cluster sinmirai --tasks <TASK_ARN>
aws ecs describe-tasks --region ap-northeast-3 --cluster sinmirai --tasks <TASK_ARN> \
  --query "tasks[0].containers[0].{exitCode:exitCode,reason:reason}" --output json
# ロググループ /aws/ecs/sinmirai/api で "updated admin id:" を確認
```
- **受け入れ**: `exitCode=0`、ログに `updated admin id: <uuid>`。

**B-5. 後片付け（任意）**: 一時リビジョン `sinmirai-api:3` を deregister（live サービスは `:2` のまま）。
```bash
aws ecs deregister-task-definition --region ap-northeast-3 --task-definition sinmirai-api:3
```

### Phase C: 動作確認（CodeX一次確認）
1. 新PWでログインAPI（**PWは表示しない**。Secretから読んでヘッダ/ボディに使う）:
   ```bash
   NEWPW="$(aws secretsmanager get-secret-value --region ap-northeast-3 --secret-id sinmirai/prod/admin-initial-password --query SecretString --output text)"
   curl -s -o /dev/null -w "login(new): %{http_code}\n" -X POST https://fhwm.jp/api/auth/login \
     -H 'Content-Type: application/json' \
     --data "$(python3 -c 'import json,os;print(json.dumps({"loginId":"sinmirai-admin","password":os.environ["NEWPW"]}))')"
   ```
   - **受け入れ**: `201`（JWT発行）。
2. （任意）旧PWでのログインが `401` になること。※旧値は上書き済みのため、事前に控えていれば確認。
- ⚠️ **新PWの値は完了報告にも貼らない**。HTTPコードのみ報告。

---

## 3. 既知の落とし穴（必ず踏襲）
1. **Secret値に末尾改行を入れない**。改行付きで保存するとハッシュが `PW\n` で計算され、ユーザーが `PW` を入力してもログイン不可になる（過去に当環境のSecretで末尾改行問題あり）。生成時 `end=''` / `printf %s` を徹底。
2. **execution role の Secret 読み取り範囲**。admin Secret ARN が未許可だと、ワンオフタスクが `ResourceInitializationError`（Secret取得不可）で起動失敗する → B-1で必ず確認・付与。
3. **task role は無い** → コンテナ内 runtime での `aws`/SDK 直接取得は使わない（注入方式のみ）。
4. **bcrypt cost=10**（既存 `$2b$10$` と整合）。
5. 全コマンド **`--region ap-northeast-3`**。新PW平文を **echo/ログ/コマンド履歴/完了報告に出さない**。
6. live サービス（`sinmirai-api:2`）は触らない。更新は一時リビジョンのワンオフのみ。

---

## 4. 完了報告フォーマット（CodeX → Claude）
- Phase A: put-secret-value の VersionId、PW長（文字数のみ）
- Phase B: execution roleの権限確認結果（付与有無）、一時リビジョン番号、TASK_ARN、exitCode、ログの `updated admin id` 行
- Phase C: login(new) のHTTPコード（201）
- ※ **新PWの平文は一切記載しない**

## 5. Claude のレビュー観点
- Secret の `LastChangedDate` が更新されている（値は取得しない）
- ワンオフタスク exitCode=0 / ログに updated admin id
- 実ブラウザで `https://fhwm.jp` に **新PWでログイン成功**（Secretから取得して入力、画面録には残さない）
- live サービスが `:2` のままで無停止（running=1, COMPLETED）
- execution role に余計な広域権限（`*`）を付けていないか（admin Secret ARN限定であること）

## 6. 残課題との関連（③へ申し送り）
- `seed-prod.js` は**旧ハッシュをハードコード**したまま。再構築時にDBが空だと旧PWで管理者が再作成される。
  → 残課題③（seed運用整理）で、seedを「環境のSecretから読んでハッシュ生成」または「初回のみ手動seed」に整理する。本手順とセットで指示書化する。
