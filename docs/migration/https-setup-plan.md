# sinmirai HTTPS化 兼 独自ドメインつなぎこみ — CodeX向け指示書

作成: 2026-06-04 / 作成者: Claude（プラン・指示書担当） / 実装担当: CodeX
対象環境: **大阪 ap-northeast-3 / アカウント 741448957802**

---

## 0. 目的

本番（大阪）の sinmirai 管理画面を、独自ドメイン **fhwm.jp** で **HTTPS公開**する。
現状 ALB は HTTP(80) のみのため、ACM証明書を発行し ALB に 443 リスナーを追加、80 は 443 へ 301 リダイレクトする。
web/api は **単一ホスト fhwm.jp のパス振り分け**（`/api/*`→api、それ以外→web）。

### 確定方針（ユーザー合意済み）
- ドメイン: **fhwm.jp（apex）をメイン**、**www.fhwm.jp も証明書SANに含めて apex へ301リダイレクト**
- DNS: fhwm.jp は お名前.com 登録だが **NSはRoute 53に委任済み**。ホストゾーンは**同アカウントに存在**（ほぼ空）→ DNS検証・エイリアスとも**全自動化**
- TLSポリシー: `ELBSecurityPolicy-TLS13-1-2-2021-06`

---

## 1. 事前確認済みの実リソース（Claude調査・2026-06-04）

| 種別 | 値 |
|---|---|
| ALB ARN | `arn:aws:elasticloadbalancing:ap-northeast-3:741448957802:loadbalancer/app/sinmirai-alb/654bd5e283c55aea` |
| ALB DNS / ZoneId | `sinmirai-alb-2133155730.ap-northeast-3.elb.amazonaws.com` / `Z5LXEXXYW11ES` |
| 80リスナー ARN | `arn:aws:elasticloadbalancing:ap-northeast-3:741448957802:listener/app/sinmirai-alb/654bd5e283c55aea/cc28aa84ef49ab55` |
| api TG | `arn:aws:elasticloadbalancing:ap-northeast-3:741448957802:targetgroup/sinmirai-api-tg/a316bfa3bf08742f` |
| web TG | `arn:aws:elasticloadbalancing:ap-northeast-3:741448957802:targetgroup/sinmirai-web-tg/9c27c903003a94db` |
| ALB-SG | `sg-0bb7fb05ebdebc9b0`（**80/443 inbound 開放済み → 変更不要**） |
| Route 53 ゾーン | `Z08172713JVKA857P1OSY`（`fhwm.jp.`、レコードはNS/SOAのみ） |
| ECR | `741448957802.dkr.ecr.ap-northeast-3.amazonaws.com/sinmirai/api` ・ `.../sinmirai/web` |
| api タスク定義 | `sinmirai-api:1`（container `Main`、env: NODE_ENV/JWT_ACCESS_EXPIRES_IN/**CORS_ORIGIN**、secret: DATABASE_URL/JWT_SECRET） |
| web タスク定義 | `sinmirai-web:1`（container `Main`、env: PORT/NODE_ENV、command で `HOSTNAME=0.0.0.0 node apps/web/server.js`） |
| 現行 CORS_ORIGIN | `http://sinmirai-alb-2133155730.ap-northeast-3.elb.amazonaws.com`（→ 要変更） |

現行80リスナールール（443にも同じ振り分けを再現する）:
- priority 10: path `/api/*` → api TG（forward）
- default: → web TG（forward）

---

## 2. 実装手順（フェーズ別）

> 全コマンドに **`--region ap-northeast-3`** を付与。各フェーズ完了時に実行コマンドと実出力（ARN/ID/ステータス）を報告すること。

### Phase 1: ACM証明書の発行とDNS検証
1. 証明書をリクエスト（apex + www のSAN、DNS検証）:
   ```bash
   aws acm request-certificate --region ap-northeast-3 \
     --domain-name fhwm.jp \
     --subject-alternative-names www.fhwm.jp \
     --validation-method DNS \
     --query CertificateArn --output text
   ```
2. 検証用CNAMEを取得:
   ```bash
   aws acm describe-certificate --region ap-northeast-3 --certificate-arn <CERT_ARN> \
     --query "Certificate.DomainValidationOptions[].ResourceRecord" --output json
   ```
3. 取得したCNAME（fhwm.jp / www.fhwm.jp 用、同一値になる場合あり＝1件でよい）を **Route 53 `Z08172713JVKA857P1OSY` に UPSERT**。
4. 検証完了を待機:
   ```bash
   aws acm wait certificate-validated --region ap-northeast-3 --certificate-arn <CERT_ARN>
   ```
- **受け入れ**: `describe-certificate` の `Status` が **ISSUED**。

### Phase 2: ALB 443(HTTPS) リスナー作成
1. 443リスナーを作成（デフォルト=web TGへforward、証明書アタッチ、TLSポリシー指定）:
   ```bash
   aws elbv2 create-listener --region ap-northeast-3 \
     --load-balancer-arn arn:aws:elasticloadbalancing:ap-northeast-3:741448957802:loadbalancer/app/sinmirai-alb/654bd5e283c55aea \
     --protocol HTTPS --port 443 \
     --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06 \
     --certificates CertificateArn=<CERT_ARN> \
     --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:ap-northeast-3:741448957802:targetgroup/sinmirai-web-tg/9c27c903003a94db
   ```
2. 443リスナーに `/api/*` → api TG のルール（priority 10）を追加:
   ```bash
   aws elbv2 create-rule --region ap-northeast-3 \
     --listener-arn <443_LISTENER_ARN> --priority 10 \
     --conditions Field=path-pattern,Values='/api/*' \
     --actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:ap-northeast-3:741448957802:targetgroup/sinmirai-api-tg/a316bfa3bf08742f
   ```
- **受け入れ**: 443リスナーが存在し、ルールが80と同等（`/api/*`→api、default→web）。

### Phase 3: Route 53 エイリアスレコード作成
fhwm.jp / www.fhwm.jp を ALB へ A(Alias) で向ける（`Z5LXEXXYW11ES` はALBのCanonical Zone）:
```bash
aws route53 change-resource-record-sets --hosted-zone-id Z08172713JVKA857P1OSY --change-batch '{
  "Changes": [
    {"Action":"UPSERT","ResourceRecordSet":{"Name":"fhwm.jp","Type":"A","AliasTarget":{"HostedZoneId":"Z5LXEXXYW11ES","DNSName":"sinmirai-alb-2133155730.ap-northeast-3.elb.amazonaws.com","EvaluateTargetHealth":true}}},
    {"Action":"UPSERT","ResourceRecordSet":{"Name":"www.fhwm.jp","Type":"A","AliasTarget":{"HostedZoneId":"Z5LXEXXYW11ES","DNSName":"sinmirai-alb-2133155730.ap-northeast-3.elb.amazonaws.com","EvaluateTargetHealth":true}}}
  ]
}'
```
- **受け入れ**: `dig fhwm.jp` / `dig www.fhwm.jp` がALBのIPを返す。`https://fhwm.jp/api/health` が **200**（証明書エラーなし）。

### Phase 4: 80(HTTP) を 443 へ 301 リダイレクト
1. 80リスナーの既存 `/api/*` ルールを削除（リダイレクトで全パスを443へ送るため不要）:
   ```bash
   aws elbv2 describe-rules --region ap-northeast-3 --listener-arn arn:aws:elasticloadbalancing:ap-northeast-3:741448957802:listener/app/sinmirai-alb/654bd5e283c55aea/cc28aa84ef49ab55
   # priority 10 の RuleArn を取得して削除
   aws elbv2 delete-rule --region ap-northeast-3 --rule-arn <RULE_ARN>
   ```
2. 80リスナーのデフォルトアクションを **HTTPS 443 へ 301 リダイレクト**に変更:
   ```bash
   aws elbv2 modify-listener --region ap-northeast-3 \
     --listener-arn arn:aws:elasticloadbalancing:ap-northeast-3:741448957802:listener/app/sinmirai-alb/654bd5e283c55aea/cc28aa84ef49ab55 \
     --default-actions '[{"Type":"redirect","RedirectConfig":{"Protocol":"HTTPS","Port":"443","Host":"#{host}","Path":"/#{path}","Query":"#{query}","StatusCode":"HTTP_301"}}]'
   ```
   ※ `Path` は `/#{path}` ではなく `#{path}`（ALB変数仕様。CodeXは適用前に1件 `curl -I http://fhwm.jp/login` でLocationを確認）。
- **受け入れ**: `curl -I http://fhwm.jp/login` が `301` + `Location: https://fhwm.jp/login`。

### Phase 5: web 再ビルド（API URL焼き込み）→ デプロイ ★最重要
> ⚠️ web は `NEXT_PUBLIC_API_URL` を**ビルド時に焼き込む**。現行イメージは旧ALBのhttp URLが焼かれているため、**再ビルドしない限り https://fhwm.jp でmixed content/CORSエラーになりログイン不可**。
1. web を **`NEXT_PUBLIC_API_URL=https://fhwm.jp/api`** で再ビルド → 大阪ECR `sinmirai/web` へpush（タグは `latest` 上書き、もしくは新タグ）。
2. web タスク定義を新リビジョン登録（imageを新タグにする場合のみ。`latest` 上書きなら登録不要だがForce必須）。
3. サービス更新:
   ```bash
   aws ecs update-service --region ap-northeast-3 --cluster sinmirai --service sinmirai-web \
     --task-definition <新web TD（latest上書きなら現行TD）> --force-new-deployment
   ```
- **受け入れ**: web サービス steady state、web TG healthy（HCパスは `/login`）。

### Phase 6: api CORS_ORIGIN を https へ更新 → デプロイ
1. `sinmirai-api:1` をベースに、env `CORS_ORIGIN` を **`https://fhwm.jp`** に変更した新リビジョンを登録（他のenv/secret/commandは維持）。
   - ※ web と api は同一オリジン(fhwm.jp)のため厳密にはCORS不要だが、絶対URL運用のため正しい値に揃える。
2. サービス更新:
   ```bash
   aws ecs update-service --region ap-northeast-3 --cluster sinmirai --service sinmirai-api \
     --task-definition <新api TD> --force-new-deployment
   ```
- **受け入れ**: api サービス steady state、api TG healthy（HCパス `/api/health`）。

### Phase 7: 検証
- ① `https://fhwm.jp` へ実ブラウザでアクセス → ログイン成功（証明書バー正常）
- ② `/sites` 表示、サイドバー濃紺＋可読
- ③ `https://fhwm.jp/api/health` → 200
- ④ ブラウザDevToolsで web→api 呼び出しがmixed content/CORSエラー無し
- ⑤ `http://fhwm.jp/...` / `http://www.fhwm.jp/...` が `https://fhwm.jp/...` へ301
- ⑥ `https://www.fhwm.jp` が証明書エラー無くアクセス可（apexへ寄せる場合は別途redirectルール検討。最低限SANで証明書有効であること）

---

## 3. 既知の落とし穴（必ず踏襲）
1. **web TG の HCパスは `/login`**（`/` はmiddlewareが307で落ちる）。今回TGは既存流用のため変更不要だが、HC設定が `/login` のままか確認すること。
2. **web は NEXT_PUBLIC_API_URL をビルド時に焼き込む** → ドメイン確定後にビルド（今回 `https://fhwm.jp/api`）。Phase5を飛ばすとログイン不可。
3. **CORS_ORIGIN を https://fhwm.jp に更新**（旧http値のままだと将来の別オリジン運用で齟齬）。
4. **ACM証明書はALBと同じ ap-northeast-3 リージョン**で発行（CloudFrontではないのでus-east-1ではない）。
5. 全コマンドに **`--region ap-northeast-3`**。
6. ALB変数 `#{host}`/`#{path}`/`#{query}` のエスケープに注意（適用前に1回 `curl -I` で挙動確認）。
7. **OCR_scan 等他プロジェクトのリソースには一切触れない**（fhwm.jp ホストゾーンは sinmirai/共用の可能性 → レコードは UPSERT で追加のみ、既存NS/SOA/他レコードを削除しない）。

---

## 4. 完了報告フォーマット（CodeX → Claude）
各フェーズで以下を報告:
- 実行コマンドと**実際の出力**（CERT_ARN、443 LISTENER_ARN、作成したレコード、新タスク定義リビジョン番号、デプロイ結果）
- 受け入れ条件の判定（green/redの根拠）
- 想定外事象・スキップ項目

## 5. Claude のレビュー観点（報告を鵜呑みにしない）
- ACM `Status=ISSUED` を `describe-certificate` で実確認、SANに fhwm.jp + www.fhwm.jp
- 443リスナーの証明書ARN・TLSポリシー・ルール（`/api/*`→api、default→web）を実確認
- Route 53 に A(Alias) 2件が ALB(`Z5LXEXXYW11ES`) 向きで存在
- 80リスナーが301リダイレクト（`curl -I` 実測）
- web 新イメージに `https://fhwm.jp/api` が焼かれているか（実ブラウザのNetworkでAPI呼び先を確認）
- api 新TDの `CORS_ORIGIN=https://fhwm.jp`
- 実ブラウザで https ログイン〜/sites〜サイドバー濃紺を目視
- Route 53 既存レコード・OCR_scanリソースが無傷

## 6. ロールバック方針
- 問題時は 80リスナーを元のforward構成（`/api/*`→api、default→web）に戻せばHTTP公開へ即時復帰可能。
- 443リスナー削除・ACM削除・Route 53レコード削除で完全に元状態へ戻せる（既存運用に影響なし）。
- web再ビルドは旧イメージタグを残しておけばロールバック可（latest上書き運用なら旧digestを控える）。
