# 不具合発生時の自動メール通知機能 — 実装指示書

作成日: 2026-06-29
対象実装者: CodeX
役割: 本書はプラン／指示書。実装はCodeXが担当し、Claudeが完了後にレビューする。

---

## 1. 目的・概要

各拠点の筐体で不具合（error / critical アラート）が発生した際、通知を希望する管理ユーザーへ自動でメールを送信する。
ユーザー管理画面のメールアドレス欄の近くに「不具合発生時に自動メールを送る」トグル（ON/OFF）を追加し、全ロール共通で設定可能とする。

## 2. 確定仕様（ユーザー合意済み）

| 項目 | 決定内容 |
|---|---|
| トグルの対象ロール | **全ロール共通**（master/editor/viewer すべてで設定可能） |
| メール送信のトリガー | アラート `level` が **error または critical** のとき（既存の `Unit.status='warning'` 判定と同条件） |
| 宛先範囲 | **トグルON かつ `isActive=true` の全ユーザー**（拠点紐付けはしない） |
| 重複抑制 | **クールダウンあり**：同一筐体(unitId)について一定時間（既定60分）内は1通まで |
| メール実装 | **TypeScriptで自前実装**（NestJS内に `MailModule` 新設）。送信トランスポートは **Amazon SES**（既存AWS大阪環境を利用し外部SaaS非依存） |

## 3. 現状の関連実装（変更の起点）

- ユーザーモデル: `apps/api/prisma/schema.prisma:10-26`（`Admin` モデル）
- 不具合判定の起点: `apps/api/src/device/device.service.ts:144-171`（`sendAlert` 内、error/critical で `Unit.status='warning'`）
- ユーザーAPI: `apps/api/src/admin/users/users.controller.ts` / `users.service.ts:81-130`
- DTO: `apps/api/src/admin/users/dto/create-user.dto.ts` / `update-user.dto.ts`
- フロント編集モーダル: `apps/web/src/app/(dashboard)/users/page.tsx:303-389`
- ロール定義: `packages/shared/src/constants/enums.ts:121-130`
- メール基盤: **現状なし**（nodemailer / SES 依存ともに未導入）

---

## 4. 実装タスク

### 4-1. DBスキーマ変更（`prisma/schema.prisma`）

> ⚠️ schema.prisma は変更承認制ファイル。下記内容でユーザー承認の上、CodeXが反映する。

**(a) `Admin` モデルに通知希望フラグを追加**

```prisma
model Admin {
  // ...既存フィールド...
  isActive          Boolean  @default(true)  @map("is_active")
  notifyOnIncident  Boolean  @default(false) @map("notify_on_incident") // 不具合発生時の自動メール受信可否
  // ...
}
```

- 既定値は `false`（既存ユーザーは明示的にONにするまで送らない）。

**(b) `Unit` モデルにクールダウン判定用の最終通知時刻を追加**

```prisma
model Unit {
  // ...既存フィールド...
  lastIncidentNotifiedAt DateTime? @map("last_incident_notified_at") // 不具合メールを最後に送信した時刻（クールダウン判定用）
  // ...
}
```

**マイグレーション**: `prisma migrate dev --name add_incident_notification` を作成。
本番反映は既存の運用フロー（migrate deploy）に従う。カラム追加のみでデータ破壊なし。

### 4-2. メール送信基盤（新規 `MailModule`）

新規ディレクトリ: `apps/api/src/mail/`

- `mail.module.ts` — `MailService` を提供・export
- `mail.service.ts` — SES 送信の薄いラッパー
  - 依存追加: `@aws-sdk/client-ses`（※新規パッケージ追加につき**ユーザー承認必須**。既に `@aws-sdk/client-s3` 等を使用中なのでバージョン系統を合わせる）
  - メソッド例: `sendIncidentAlert(to: string[], payload: IncidentMailPayload): Promise<void>`
  - 宛先が複数のときは **BCC で送信**（受信者同士にアドレスを開示しない）。Toには送信元自身（no-reply）等を設定。
  - **⚠️ 必須: SES宛先数の上限対策（バッチ分割）**
    AWS SES の `SendEmail` は1リクエストの `Destination`（To+Cc+Bcc合計）に上限がある（実質50件目安）。通知ONユーザーが増える前提なので、**BCC宛先を50件単位でチャンク分割し、チャンクごとに送信**すること。1チャンク失敗が他チャンクを巻き込まないよう各送信を独立して try/catch しログする。
    - 参照: AWS SES `SendEmail` API / `Destination` の制限。
  - 件名・本文テンプレートは日本語。本文に含める情報: 拠点名・筐体名(unitId)・アラート種別(alertType)・レベル(level)・詳細(detail)・発生日時(occurredAt)・管理画面の該当筐体URL。
  - **管理画面URLの組み立て**: 筐体詳細ページは `/units/[unitId]`（確認済み: `apps/web/src/app/(dashboard)/units/[unitId]/page.tsx`）。本文リンクは **`${WEB_BASE_URL}/units/${unitId}`** とする。
  - 送信失敗は **例外を投げずログ出力に留める**（アラート受信処理を失敗させない）。`this.logger.error(...)`。

**環境変数（`.env` / Secrets）**:
- `MAIL_FROM_ADDRESS` — 送信元（SESで検証済みのアドレス。例: `no-reply@fhwm.jp`）
- `AWS_REGION` — SESのリージョン（既存の値を流用 or SES用に指定）
- `WEB_BASE_URL` — メール本文の管理画面リンク生成用（例: `https://fhwm.jp`）
- クールダウン分数 `INCIDENT_NOTIFY_COOLDOWN_MINUTES`（既定60。未設定時は定数の既定値を使う）

> マジックナンバー回避: クールダウン分数は定数化し、環境変数で上書き可能にする。

### 4-3. 不具合検知時の通知フック（`device.service.ts` の `sendAlert`）

`apps/api/src/device/device.service.ts:158-166` の error/critical ブロックに通知処理を追加する。

#### ⚠️ 必須: 原子的なクールダウン獲得（重複送信防止）

`findMany(判定) → send → update` の素朴な実装は、**同一筐体から同時に複数アラートが届くと競合し重複送信される**（read-then-write レース）。
これを避けるため、**`unit.updateMany` の WHERE 条件にクールダウン判定を畳み込み、更新できた（count===1）ときだけ送信する**「原子的クールダウン獲得」とすること。

```ts
// クールダウン分数（既定60分・env で上書き可）から cutoff を算出
const cutoff = new Date(Date.now() - cooldownMinutes * 60 * 1000);

// lastIncidentNotifiedAt が未送信 or cutoff 以前のときだけ now() に更新
const acquired = await this.prisma.unit.updateMany({
  where: {
    unitId: device.unitId,
    OR: [
      { lastIncidentNotifiedAt: null },
      { lastIncidentNotifiedAt: { lte: cutoff } },
    ],
  },
  data: { lastIncidentNotifiedAt: new Date() },
});

// 更新できた(=クールダウン枠を獲得した)プロセスだけが送信に進む
if (acquired.count === 1) {
  // 宛先取得 → MailService.sendIncidentAlert(...)
}
```

実装方針:
1. error/critical の場合のみ通知判定に入る（既存の `Unit.status='warning'` 更新と同じブロック）。
2. 上記 `updateMany` で**原子的にクールダウン枠を獲得**。`acquired.count !== 1` なら送信せず終了（クールダウン中）。
3. 枠を獲得したとき:
   - `Admin` から `notifyOnIncident = true AND isActive = true` のユーザーの `email` を取得。
   - 0件なら何もしない（枠は既に消費済みだが実害なし。気になるなら 0件時に `lastIncidentNotifiedAt` を元へ戻す手もあるが必須ではない）。
   - 1件以上なら `MailService.sendIncidentAlert(...)` を呼ぶ。
4. **クールダウン更新タイミングは「獲得時（=送信試行前）」**になる。連発抑制を最優先する方針。送信失敗時に枠を戻すかはオープン事項（§8）参照。
5. **メール送信は筐体APIのレスポンスをブロックしない**こと。
   - 最小実装: `await` せず fire-and-forget（`.catch()` でログ）。
   - もしくは `Unit.status` 更新と同一トランザクション外で非同期実行。
   - 筐体の `POST /device/alerts` のレスポンス遅延・失敗を招かないことが必須。
6. `DeviceModule` に `MailModule` を import する。

#### ⚠️ 必須: `UnitWithSite` 手書き型の更新

`apps/api/src/device/device.service.ts:14-25` の `UnitWithSite` は Prisma 生成型ではなく**手書き型**。`DeviceAuthGuard` が `include: { site: ... }` で実体は取得できるが、型に新フィールドが無いと参照時に型エラー/古い型のまま放置になる。
- 上記 `updateMany` 方式なら `device.lastIncidentNotifiedAt` を直接読まないため必須参照は無いが、整合のため `lastIncidentNotifiedAt: Date | null` を追加すること。本文生成で `alertMessage` を使う場合は `alertMessage: string | null` も追加。
- できれば手書き型をやめ Prisma payload 型（`Prisma.UnitGetPayload<{ include: { site: ... } }>`）へ寄せる方が将来の漏れを防げる（任意・推奨）。

### 4-4. ユーザーAPI（DTO・サービス）

- `CreateUserDto`（`create-user.dto.ts:8`）/ `UpdateUserDto` の**両方**に `notifyOnIncident?: boolean` を追加。
  - `@IsOptional()` `@IsBoolean()` + `update-user.dto.ts` の `isActive` と同じ `@Transform`（文字列 "true"/"false" → boolean）を**両DTOに**入れる。作成モーダルからも送るため `CreateUserDto` 側にも Transform を入れておく方が一貫して安全（現状 `CreateUserDto` には Transform が一切無い点に注意）。
  - **重要**: APIは `forbidNonWhitelisted` 有効。新フィールドをDTOに追加しないと 400 になるため、**web より先に API をデプロイ**すること（過去 BUG-002 と同じ注意点）。
- `users.service.ts` の `create()` / `update()` で `notifyOnIncident` を保存対象に含める。
- 一覧・詳細のレスポンスに `notifyOnIncident` を含める（フロントで初期表示に使う）。

### 4-5. フロントエンド（ユーザー編集／作成モーダル）

対象: `apps/web/src/app/(dashboard)/users/page.tsx`

- `form` state に `notifyOnIncident: boolean` を追加（既定 false、編集時はAPI値で初期化）。`users/page.tsx:33` 付近のフォームstate。
- **メールアドレス入力欄のすぐ近く**にトグルを配置。ラベル: 「不具合発生時に自動メールを送る」。作成・編集の両モーダルで表示（全ロール共通・ロール選択値に関わらず常時表示）。
- **⚠️ Switch コンポーネントの方針を明記**: `apps/web` には現状 `components/ui/switch.tsx` が**存在しない**。以下いずれかを選ぶ（指示書の既定は B）。
  - **A.** `@radix-ui/react-switch` を依存追加し `components/ui/switch.tsx`（shadcn/ui標準）を新設 → 見た目はトグルスイッチ。**新規パッケージ追加につきユーザー承認必須**。
  - **B.（既定・推奨）** 依存追加なしで、ネイティブ `<input type="checkbox">` をTailwindで体裁を整えて実装。承認不要・最小変更。トグルUIに強い要望があればAへ切替。
- 保存時に `notifyOnIncident` をリクエストボディに含める。
- 任意: 一覧テーブルに通知ON/OFFの状態を示す列やバッジを追加すると運用しやすい（必須ではない）。

### 4-5b. API クライアント型の更新（`apps/web/src/lib/api-client.ts`）

フロントの型にも `notifyOnIncident` を通すこと（漏れると保存値が送られない／表示できない）。
- `AdminUser` 型（`api-client.ts:25`）に `notifyOnIncident: boolean` を追加。
- `createUser` の引数型（`api-client.ts:208`）に `notifyOnIncident?: boolean` を追加。
- `updateUser` の `Partial<{...}>` 引数型（`api-client.ts:210`）に `notifyOnIncident: boolean` を追加。

### 4-6. shared（必要時のみ）

- フラグは真偽値のみで新Enum不要。型を共有したい場合は `packages/shared` にユーザー型を足してもよいが、必須ではない。

---

## 5. 運用準備（実装と並行で必要・インフラ作業）

- **Amazon SES のセットアップ**（大阪 ap-northeast-3 で利用可否を確認。未対応リージョンなら東京等に寄せる検討）
  - 送信元ドメイン/アドレスのドメイン認証（DKIM/SPF）
  - **サンドボックス解除申請**（未解除だと検証済みアドレス宛にしか送れない）
- Secrets Manager / タスク定義環境変数に上記 `MAIL_*` を追加。
- ECSタスクロールに SES 送信権限（`ses:SendEmail` / `ses:SendRawEmail`）を付与。
- **⚠️ リージョン整合性チェック**: SESクライアントのリージョン・IAMポリシーの `Resource`（SES ARN のリージョン）・検証済みアイデンティティのリージョンを**すべて一致**させる。大阪(ap-northeast-3)でSES不可で東京等に寄せる場合、Secrets/IAM/クライアント設定のリージョンがズレると送信失敗するため運用前に突合する。
- SES大阪リージョン可否は実装直前に AWS 公式「SES endpoints and quotas」で最終確認する。

---

## 6. テスト観点

- DTO: `notifyOnIncident` あり/なし/不正値のバリデーション。
- サービス: 作成・更新でフラグが保存・返却されること。
- 通知ロジック（ユニットテストで `MailService` をモック）:
  - error/critical で送信される / info・warning では送信されない
  - 宛先0件のとき送信されない
  - クールダウン中は再送されない / クールダウン経過後は送信される
  - メール送信失敗時もアラート記録・APIレスポンスが成功すること
- フロント: トグルの初期表示・切替・保存反映。

---

## 7. デプロイ順序・注意

1. SES準備・Secrets/タスクロール整備（先行）
2. DBマイグレーション
3. **API を先にデプロイ**（forbidNonWhitelisted のため）
4. web をデプロイ
5. E2E確認

---

## 8. オープン事項（実装前にユーザー確認推奨）

- **クールダウン更新タイミング**: §4-3の原子的獲得方式では「獲得時（送信試行前）」に更新する＝連発抑制優先。送信が全チャンク失敗したときに `lastIncidentNotifiedAt` を元へ戻して再送を許すか（＝実質「成功時のみ確定」）は要判断。戻す場合はレース再発に注意し、戻し処理も慎重に。
- **クールダウンの粒度**: 筐体(unitId)単位で十分か、alertType別にも分けるか。本書は unitId 単位。
- **SESのリージョン**: 大阪(ap-northeast-3)でSES利用可否。不可なら別リージョン運用。
- **件名・本文の文面**: 確定文面はユーザー確認の上で固定する。
