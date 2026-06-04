# sinmirai 初期管理者 seed 運用整理（再構築時の作成漏れ対策） — CodeX向け指示書

作成: 2026-06-04 / 作成者: Claude（プラン・指示書担当） / 実装担当: CodeX
対象環境: **大阪 ap-northeast-3 / アカウント 741448957802**
関連: [admin-password-change-plan.md](admin-password-change-plan.md)（残課題②）

---

## 0. 目的と背景

再構築（空DB）時にも `sinmirai-admin` が確実に作成され、かつ**パスワードがSecretと整合**するよう seed 運用を整理する。

### 調査結果（Claude・2026-06-04）
- **Dockerfile の CMD は既に seed を含む**: `sh -c "...prisma migrate deploy && node seed-prod.js && node dist/main"`（[apps/api/Dockerfile:22](apps/api/Dockerfile)）。seed-prod.js もイメージに同梱済み（`COPY --from=builder /app ./`）。
- **問題はECSタスク定義の command 上書き**: live の `sinmirai-api:2` は command を `sh -c "./node_modules/.bin/prisma migrate deploy && node dist/main"` に上書きしており、**seedステップが抜けている**。→ 空DB再構築で管理者が作られず**ログイン不可**になる。
- **seed-prod.js が旧ハッシュをハードコード**（[seed-prod.js:13](apps/api/seed-prod.js)）。実行されても旧PWで作成され、②で設定する新PWと矛盾する。
- bcrypt/@prisma/client は prod依存＝イメージ同梱済み。

### 確定方針（ユーザー合意済み）
- **ブート時に冪等 seed を自動実行**（再構築でも管理者が自動作成され作成漏れゼロ）。
- 共通前提: **seed-prod.js はハードコードを廃止し、Secret から初期PWを読む**。
- seed は冪等（管理者が存在すればスキップ）＝毎起動で安全。
- **Dockerfile は変更しない**（保護対象。既にCMDは正しい）。修正は seed-prod.js とタスク定義のみ。

---

## 1. 事前確認済みの実リソース（Claude調査・2026-06-04）

| 種別 | 値 |
|---|---|
| 現行 api タスク定義 | `sinmirai-api:2`（command上書きで seed を除外中） |
| Dockerfile CMD | `sh -c "./node_modules/.bin/prisma migrate deploy && node seed-prod.js && node dist/main"`（seed込み・正） |
| seed対象 | `apps/api/seed-prod.js`（旧ハッシュをハードコード） |
| admin Secret ARN | `arn:aws:secretsmanager:ap-northeast-3:741448957802:secret:sinmirai/prod/admin-initial-password-djOIpV` |
| execution role | `ecsTaskExecutionRole`（②で admin Secret 読み取りを付与済みなら再利用） |
| ECR | `741448957802.dkr.ecr.ap-northeast-3.amazonaws.com/sinmirai/api` |
| 管理者 | loginId `sinmirai-admin` |

> ⚠️ 実施順序: **②（admin-password-change）を先に完了**してから本③を行うことを推奨。②でSecretが現行PWに更新され、execution roleへのSecret読み取り付与も済むため。②③同時でも可だが、その場合は本書のPhase 1（権限）を必ず実施。

---

## 2. 実装手順（フェーズ別）

> 全コマンド **`--region ap-northeast-3`**。PW平文を echo/ログ/報告に出さない。

### Phase 1: execution role の Secret 読み取り権限（②未実施なら）
- `ecsTaskExecutionRole` が admin Secret ARN（`...admin-initial-password-djOIpV`）に対し `secretsmanager:GetSecretValue` を持つか確認。無ければ**ユーザー承認の上**、当該ARN限定で付与（`*` 不可）。
  ```bash
  aws iam list-role-policies --role-name ecsTaskExecutionRole
  aws iam list-attached-role-policies --role-name ecsTaskExecutionRole
  ```

### Phase 2: seed-prod.js の修正（ハードコード廃止 → Secretから読む）
- `apps/api/seed-prod.js` を以下方針で書き換え:
  - `ADMIN_INITIAL_PASSWORD`（env、Secret注入）を読む。
  - 管理者が存在すれば**スキップ**（冪等。既存ロジック維持）。
  - 未存在かつ env 未設定 → **エラーログのみ出力して return**（boot を止めない＝exit 0。`&&` チェーンで dist/main を起動させるため）。
  - 未存在かつ env 設定あり → `bcrypt.hash(pw, 10)`（**cost=10**、既存と整合）で `sinmirai-admin` を作成。
  - **末尾の改行/CRを除去**してからハッシュ（`pw.replace(/[\r\n]+$/, '')`）。Secret側も末尾改行なしを徹底（落とし穴①）。
  - ハードコードハッシュ `$2b$10$C4Aw...` は**削除**。
  - 例外時も**非ゼロ終了しない**（現行同様 `.catch` で握り、boot継続）。
  - PW平文・ハッシュは**ログに出さない**（出すのは「作成した/スキップした」程度）。
- 実装イメージ（CodeX裁量で同等に）:
  ```js
  const { PrismaClient } = require('@prisma/client');
  const bcrypt = require('bcrypt');
  const prisma = new PrismaClient();
  async function main() {
    const existing = await prisma.admin.findUnique({ where: { loginId: 'sinmirai-admin' } });
    if (existing) { console.log('シード: 管理者は既に存在します。スキップ。'); return; }
    const raw = process.env.ADMIN_INITIAL_PASSWORD;
    if (!raw) { console.error('シード: ADMIN_INITIAL_PASSWORD 未設定のため管理者を作成できません'); return; }
    const pw = raw.replace(/[\r\n]+$/, '');
    const hash = await bcrypt.hash(pw, 10);
    await prisma.admin.create({ data: { loginId: 'sinmirai-admin', password: hash, name: 'システム管理者' } });
    console.log('シード: 初期管理者を作成しました');
  }
  main().catch(e => { console.error('シードエラー:', e && e.message); }).finally(() => prisma.$disconnect());
  ```
- （任意）dev用 `prisma/seed.ts` にハードコードPWがあれば、規約に沿って同様に見直す（本番影響なし。スコープ外でも可）。

### Phase 3: api イメージ再ビルド → ECR push
- 修正後のコードで api イメージを再ビルド → `sinmirai/api` へ push（tag運用は既存に合わせる。`latest` 上書きなら旧digestを控える）。
- 受け入れ: ECR に新digestが push 済み。

### Phase 4: タスク定義の修正（command上書きを撤去 + Secret注入追加）
- `sinmirai-api:2` をベースに新リビジョン登録:
  1. **`command` を省略**（= Dockerfile CMD `...&& node seed-prod.js && node dist/main` を採用。単一の真実源にする）。
     - ※ command を明示したい場合は `sh -c "./node_modules/.bin/prisma migrate deploy && node seed-prod.js && node dist/main"` と**seed込み**にする。
  2. `secrets` に **`ADMIN_INITIAL_PASSWORD`**（valueFrom = admin Secret ARN）を追加（既存 DATABASE_URL/JWT_SECRET は維持）。
  3. env（NODE_ENV/JWT_ACCESS_EXPIRES_IN/CORS_ORIGIN=`https://fhwm.jp`）は維持。
- 登録結果のリビジョン番号を控える。

### Phase 5: サービス更新（デプロイ）
```bash
aws ecs update-service --region ap-northeast-3 --cluster sinmirai --service sinmirai-api \
  --task-definition <新リビジョン> --force-new-deployment
```
- 受け入れ: rollout COMPLETED、running=1/pending=0、api TG healthy、`/api/health` 200。
- ログ確認: 既存環境では admin が存在するため、起動ログに **「管理者は既に存在します。スキップ。」**（＝②で設定した新PWが**保持**されている／seedで上書きされていない）。

### Phase 6: 再構築シナリオの検証（任意・強く推奨）
> 本番DBは触らず、seed の冪等性と「空DB→自動作成」を**別系で**確認する。
- 手段例: ステージング用の空DB（or 一時RDS/ローカル）に対し、新タスク定義相当の command + `ADMIN_INITIAL_PASSWORD` でワンオフ実行し、`admins` に `sinmirai-admin` が1件作成されること、その後の再実行でスキップされることを確認。
- 受け入れ: 空DBで1件作成 → 再実行でスキップ（冪等）。
- ※ 本番DBへ二重に走らせない（本番には既に管理者が存在しスキップされるが、検証は別系で）。

---

## 3. 既知の落とし穴（必ず踏襲）
1. **Secret/PW値の末尾改行禁止**。seed側でも `[\r\n]+$` を除去。改行混入はログイン不可の原因（当環境で実績あり）。
2. **boot を止めない seed**。seed-prod は例外でも非ゼロ終了しない（`&&` チェーンで API 本体を起動させるため）。
3. **既存管理者は上書きしない**（findUnique スキップ）。②で設定した新PWを seed が潰さないこと。
4. **Dockerfile は変更しない**（保護対象。CMDは既に正しい）。修正は seed-prod.js とタスク定義のみ。
5. bcrypt **cost=10**。execution role の Secret 権限は **admin Secret ARN 限定**（`*`不可）。
6. live サービスへの反映は Phase 5 のデプロイ1回。command上書き撤去で seed が毎起動実行される点を認識（冪等なので安全）。

---

## 4. 完了報告フォーマット（CodeX → Claude）
- Phase 1: execution role の権限確認・付与有無
- Phase 2: seed-prod.js の差分（ハードコード削除・Secret読み取り・末尾改行除去・非ゼロ終了しない）
- Phase 3: 新 api イメージ digest
- Phase 4: 新タスク定義リビジョン番号、command（省略 or seed込み）、secrets に ADMIN_INITIAL_PASSWORD 追加
- Phase 5: rollout/running/health、起動ログの「スキップ」行（既存管理者保持の証跡）
- Phase 6: 空DBでの作成1件＋再実行スキップ（実施した場合）
- ※ PW平文は記載しない

## 5. Claude のレビュー観点
- seed-prod.js から旧ハッシュが消え、Secret(env)からPWを読む実装になっているか（実コードレビュー）
- 新タスク定義の command に **seedステップが含まれる**（or command省略でDockerfile CMD採用）か
- secrets に ADMIN_INITIAL_PASSWORD（admin Secret ARN）が追加されているか
- デプロイ後、稼働タスクが新digestで、起動ログに「スキップ」（②の新PW保持）／`/api/health` 200
- 実ブラウザで **②の新PWでログイン継続可**（seedが上書きしていない）
- execution role に広域権限（`*`）が付いていないか

## 6. 完了後の状態（あるべき姿）
- 通常デプロイ: migrate → seed（既存ありスキップ）→ API起動。副作用なし。
- 空DB再構築: migrate → seed（Secretの現行PWで `sinmirai-admin` 自動作成）→ API起動。**作成漏れゼロ・PW整合**。
- 管理者PWの真実源は Secret `sinmirai/prod/admin-initial-password`（②③で一貫）。
