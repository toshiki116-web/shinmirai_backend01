# 筐体ログを「行配列」から「ログファイル丸ごと」送信へ変更 — CodeX向け指示書

> 対象: CodeX（実装担当）
> 作成: 2026-06-23 / 作成者: Claude（プラン担当）
> 改訂: 2026-06-23（レビュー指摘を反映。§2-5 セキュリティ要件を追加、§2-2/§2-3/§3/§5 を更新）
> レビュー: Claude（実装完了後にコードレビュー）
> 本番反映状況: 未着手

---

## 0. 目的と確定方針（ユーザー合意済み・2026-06-23）

筐体ログの送信方式を、現状の「JSON化したログ行の配列（最大100件）をDBに構造化保存」から、**ローテ済みログファイルをまるごとS3にアップロードし、DBにはメタデータのみを保存**する方式へ変更する。

筐体側がログをJSONエントリにパースして組み立てる処理が不要になり、実装が単純・堅牢になることが狙い。スキーマに合わない行の取りこぼしや100件バッチ上限の悩みも解消する。

### 確定方針（ユーザー合意済み）

| 論点 | 決定 |
|---|---|
| 送信単位 | **ローテ済みファイル単位**（筐体が日次/サイズでローテーションした確定ファイルを送る。サイズ有界・重複最小） |
| 保存先 | **S3 ＋ DBにメタデータのみ**（既存の署名付きURL基盤を流用） |
| 管理画面の閲覧 | **ファイル一覧 ＋ ダウンロード**（署名付きGET URLで取得） |
| ファイル構成 | **種別ごとに別ファイル**（例: `app.log` / `error.log` / `event.log`）。種別はファイル名で表現する |
| `logType` フィールド | **削除**（種別はファイル名で表現できるため独立フィールドは冗長） |

### 重要な前提
- ログは構造化検索（`level=ERROR` でのSQL絞り込み等）の要件は**今回は不要**との合意。将来必要になればファイル内検索ビューアを別途検討する。
- ログファイルは公開コンテンツ（CloudFront配信）ではない。**動画用バケットとは分け、専用バケット or 専用プレフィックス＋非公開**で扱う。

---

## 1. 現状（Claude調査・2026-06-23）

### 受信API
`POST /api/device/logs`（[device.controller.ts:85](../../apps/api/src/device/device.controller.ts)）
リクエストDTO（[send-logs.dto.ts](../../apps/api/src/device/dto/send-logs.dto.ts)）:
```ts
class SendLogsDto {
  logType: string;          // 'application' | 'error' | 'event'
  logs: LogEntryDto[];      // 最大100件。各 {timestamp, level, message}
}
```
保存処理（[device.service.ts:213](../../apps/api/src/device/device.service.ts)）は `prisma.deviceLog.createMany()` で1行=1ログをDBへ。

### DBスキーマ
`DeviceLog` モデル（[schema.prisma:121](../../apps/api/prisma/schema.prisma)）→ `device_logs` テーブル。`logType / level / message / occurredAt` を保持、`@@index([unitId, occurredAt])`。

### 閲覧API
専用APIは無く、筐体詳細 `GET /api/admin/units/:unitId`（[units.service.ts:56](../../apps/api/src/admin/units/units.service.ts)）が `include: { deviceLogs: { take: 20 } }` で直近20件を同梱して返す。

### 流用できる既存基盤
- **S3署名付きURL基盤**: [storage.service.ts](../../apps/api/src/storage/storage.service.ts)。`createUploadUrl()`（Presigned PUT）/ `headObject()`（アップロード後の検証）/ `signContentUrl()`（CloudFront署名GET、※これは公開配信用なのでログには使わない）。
- **2段階アップロードフロー**: 動画コンテンツが `upload-url`（PUT URL発行＋DBを `uploading`）→ S3へPUT → `upload-complete`（`headObject` で検証＋DB確定）の2段階（[contents.service.ts:193-241](../../apps/api/src/admin/contents/contents.service.ts)）。本指示書はこのパターンを踏襲する。
- **device認証**: `DeviceAuthGuard`（[device-auth.guard.ts](../../apps/api/src/common/guards/device-auth.guard.ts)）＋ `@CurrentDevice()`（[current-device.decorator.ts](../../apps/api/src/common/decorators/current-device.decorator.ts)）。

---

## 2. 設計

### 2-0. アップロード方式（2段階・Presigned PUT）

動画コンテンツと同じ2段階方式を採用する。理由: 既存 `StorageService` をそのまま流用でき、大きなファイルをAPI（Fargate）経由でストリームせずS3へ直接送れる。

```
Step1: POST /api/device/logs/upload-url
   req : { fileName, contentType, fileSize }
   res : { uploadUrl, objectKey, expiresIn }
   処理: StorageService で Presigned PUT URL 発行（DBへの仮レコードは作らない）

Step2: 筐体が uploadUrl へ PUT（ファイル本体をS3へ）

Step3: POST /api/device/logs/upload-complete
   req : { objectKey, fileName, contentType, checksum? }
   res : { logFileId, receivedAt }
   処理: StorageService.headObject(objectKey) で実在・サイズ検証
        → DeviceLogFile メタデータを1件 INSERT
```

> 補足: 旧 `POST /api/device/logs`（行配列受信）は**廃止**する。筐体アプリが新フローへ移行するまでの並行稼働が必要かは筐体チームと要確認（→ §6 リスク）。

### 2-1. オブジェクトキー設計
```
logs/{unitId}/{sanitizedFileName}
```
- `{unitId}` は **`@CurrentDevice()` のトークンから解決した device.unitId** を必ず使う。**筐体から受け取った値を信用しない**（後述 §2-5 の所有検証）。
- 種別はファイル名で表現（`app-20260623.log` 等、筐体側がローテ時に日付等を付与して一意化する想定）。
- 同名再PUT時はS3が上書き。`upload-complete` は **s3Key 一致で upsert**（既存メタがあれば `fileSize/checksum/contentType/uploadedAt` を更新）し、重複行を作らない。
  - ⚠️ `uploadedAt` は `@default(now())` のため **create 時しか入らない**。upsert の `update` 側で **明示的に `uploadedAt: new Date()` を指定**すること（再送時刻が反映されない不具合防止）。

### 2-2. 環境変数（新規）
[storage.service.ts](../../apps/api/src/storage/storage.service.ts) の constructor で `ConfigService.get()` 経由で追加読み込み。サンプルは **リポジトリルートの [`.env.example`](../../.env.example)** に追記する（`apps/api/.env.example` は存在しない。`apps/api/.env` は実環境ファイルなので触らない）。値はダミー/コメントで（秘密値は書かない）。

| 環境変数 | デフォルト | 用途 |
|---|---|---|
| `S3_LOGS_BUCKET` | （必須・デフォルトなし） | ログ専用の非公開バケット名。動画用 `S3_CONTENTS_BUCKET` とは**必ず分ける** |
| `LOG_UPLOAD_URL_EXPIRES_IN` | `900`（秒） | ログ用 Presigned PUT URL 有効期限 |
| `MAX_LOG_SIZE_BYTES` | `52428800`（50MB） | ログファイルサイズ上限（ローテ済み想定で十分。要調整） |
| `ALLOWED_LOG_MIME` | `text/plain,application/gzip` | 許可MIME（gzip圧縮ログも許容する場合） |
| `LOG_DOWNLOAD_URL_EXPIRES_IN` | `300`（秒） | 管理画面ダウンロード用 Presigned GET URL 有効期限 |

> インフラ作業（CodeX範囲外・ユーザー/インフラ担当へ申し送り）:
> - `S3_LOGS_BUCKET` を**非公開（ブロックパブリックアクセス全ON）**で新規作成。
> - **ライフサイクルポリシー**でログの保持期間（例: 90日で失効）を設定し、無制限肥大化を防ぐ。
> - Fargate **タスクロール**に当該バケットへの `s3:PutObject`（Presigned発行はSDK署名なので実体はタスクロール権限）／`s3:GetObject`／`s3:HeadObject` を付与。
> - `deleteLogObject(s3Key)` によるオーファン即時削除を実装する場合は、追加で `s3:DeleteObject` も付与する。

### 2-3. スキーマ変更（prisma/schema.prisma）

`prisma/schema.prisma` はユーザー承認が必要なファイル。本指示書の内容で承認済みとして進めてよいが、**migrate実行前に差分をユーザーへ提示**すること。

**(a) 新規モデル追加**
```prisma
/// デバイスログファイル（S3アップロード済みメタデータ）
model DeviceLogFile {
  logFileId   String   @id @default(uuid()) @map("log_file_id")
  unitId      String   @map("unit_id")
  fileName    String   @map("file_name")
  s3Key       String   @unique @map("s3_key")
  fileSize    Int      @map("file_size")
  contentType String?  @map("content_type")
  checksum    String?
  uploadedAt  DateTime @default(now()) @map("uploaded_at")

  unit        Unit     @relation(fields: [unitId], references: [unitId])

  @@index([unitId, uploadedAt])
  @@map("device_log_files")
}
```

**(b) 旧 `DeviceLog` モデルを削除**し、`Unit` モデルのリレーション `deviceLogs DeviceLog[]` を `deviceLogFiles DeviceLogFile[]` に差し替える。

**(c) マイグレーション**: `device_logs` テーブルは DROP される。既存ログデータの保全要否をユーザーに確認（運用ログのため破棄可の想定だが要確認）。`prisma migrate dev`（ローカル）→ 本番は `prisma migrate deploy`。

### 2-4. logType の完全削除
- `send-logs.dto.ts` の旧DTOごと廃止（新DTOに `logType` を持たせない）。
- `device.service.ts` の旧 `sendLogs()` 内 `logType` 参照を除去（メソッド自体を新フローに置換）。
- スキーマからも除去済み（§2-3）。`logType` の文字列が他に残っていないか全文検索で確認。

### 2-5. セキュリティ・バリデーション要件（レビュー反映・必須）

Presigned PUT は「URL発行時の宣言」と「実際にPUTされた実体」が一致する保証がない。**`upload-complete` を信頼境界**とし、以下を厳格に行う。違反時は **メタデータを作らず 400/422 で拒否**する。

**(1) objectKey の所有検証（最重要）**
- 筐体が送る `objectKey` をそのまま信用しない。**`objectKey` が `logs/{device.unitId}/` で始まること**を必ず検証する（`device.unitId` は `@CurrentDevice()` 由来）。
- さらに `objectKey` 末尾のファイル名部分が、送られた `fileName` をサニタイズした結果と一致することを確認（key とメタの不整合防止）。
- これが無いと、他筐体のキーや任意キーをDBに紐付けられる。

**(2) fileName バリデーション（厳しめ）**
S3キーが `logs/{unitId}/{fileName}` 直結のため、以下を全て拒否:
- `..`（パストラバーサル）、先頭 `/`、`/` や `\` を含むもの（サブパス禁止）
- 制御文字（`\x00`〜`\x1F`）、空文字・空白のみ
- 極端に長い名前（例: 255バイト超）
- 推奨: `^[A-Za-z0-9._-]+$` 程度のホワイトリスト方式（許可文字だけ通す）。`upload-url` と `upload-complete` の両方で同じサニタイズ関数を使う。

**(3) headObject 後の再検証（明文化）**
`upload-complete` で `headObject(objectKey)` した後、以下を全て確認:
- 実在すること（存在しなければ 404/422）
- `ContentLength > 0` かつ `<= MAX_LOG_SIZE_BYTES`（宣言 `fileSize` ではなく **実サイズ**で判定）
- `ContentType` が `ALLOWED_LOG_MIME` のいずれか
- objectKey が当該 unit の prefix（再掲・(1)）
- 上記いずれか違反なら **DBへINSERTしない**

**(4) オーファン対策（推奨）**
検証NG時、S3に残った不正オブジェクトを `deleteObject` で削除することを検討（任意。最低限ライフサイクルで失効するが、即時削除が望ましい）。`StorageService` に `deleteLogObject(s3Key)` を用意。

**(5) DI（StorageService の注入）**
`StorageModule` は `@Global()` で `AppModule` に登録済み（[storage.module.ts](../../apps/api/src/storage/storage.module.ts) / [app.module.ts](../../apps/api/src/app.module.ts)）。
→ **DeviceModule / UnitsModule への `StorageModule` 明示 import は不要**。`DeviceService` / `UnitsService` のコンストラクタに `private readonly storage: StorageService` を注入するだけでよい（`UnitsService` は download-url 用に新規注入が必要）。
※ 将来 `@Global()` を外す場合は各モジュールでの import が必要になる点だけ留意。

---

## 3. 実装タスク（バックエンド）

### タスク1: スキーマ変更とマイグレーション
§2-3 を反映 → ユーザーに差分提示 → `prisma migrate dev --name device_log_file` → `prisma generate`。

### タスク2: StorageService にログ用メソッド追加
[storage.service.ts](../../apps/api/src/storage/storage.service.ts) に、`createUploadUrl()` を参考に以下を追加:
- `createLogUploadUrl({ unitId, fileName, contentType, fileSize })` → `S3_LOGS_BUCKET`・キー `logs/{unitId}/{fileName}`・`ALLOWED_LOG_MIME`/`MAX_LOG_SIZE_BYTES` で検証して Presigned PUT URL を返す。
- `createLogDownloadUrl(s3Key)` → `S3_LOGS_BUCKET` に対する **Presigned GET URL**（`@aws-sdk/s3-request-presigner` の `GetObjectCommand`。CloudFront署名ではない）。`LOG_DOWNLOAD_URL_EXPIRES_IN` を使用。
- `headObject()` はバケットを引数化するか、ログ用 `headLogObject()` を追加（現状 `headObject` が `S3_CONTENTS_BUCKET` 固定なら要対応）。返却に `ContentLength` / `ContentType` を含め、§2-5(3) の再検証に使えるようにする。
- `deleteLogObject(s3Key)` を追加（§2-5(4) のオーファン削除用。`DeleteObjectCommand`）。

### タスク3: device側API（新フロー）
[device.controller.ts](../../apps/api/src/device/device.controller.ts) / [device.service.ts](../../apps/api/src/device/device.service.ts):
- 旧 `POST /logs`（`sendLogs`）と `send-logs.dto.ts` を削除。
- 追加:
  - `POST /api/device/logs/upload-url`（`@UseGuards(DeviceAuthGuard)` `@CurrentDevice()`）+ `CreateLogUploadUrlDto { fileName, contentType, fileSize }`
  - `POST /api/device/logs/upload-complete` + `CompleteLogUploadDto { objectKey, fileName, contentType, checksum? }` → **§2-5 の所有検証＋headObject再検証** → `DeviceLogFile` を **s3Key で upsert**（update側で `uploadedAt: new Date()` 明示）。
- DTOバリデーション・所有検証・headObject再検証は **§2-5 を必須要件として実装**（`fileName` は §2-5(2) のホワイトリスト、サイズ/MIMEは実体ベースで再判定）。Swagger注釈も付与。

### タスク4: 管理画面側 閲覧API
- 新規: `GET /api/admin/units/:unitId/logs`（JWT・ロール認可は既存に合わせる）→ `DeviceLogFile` を `uploadedAt desc` でページング返却（`fileName/fileSize/uploadedAt/logFileId`）。
- 新規: `GET /api/admin/units/:unitId/logs/:logFileId/download-url` → `createLogDownloadUrl(s3Key)` で署名付きGET URLを返す。
- [units.service.ts](../../apps/api/src/admin/units/units.service.ts) の `findOne` から `deviceLogs: { take: 20 }` を**除去**（または `deviceLogFiles: { take: 20 }` のメタ一覧に差し替え）。レスポンス型変更はフロントに影響するため §5 と整合させる。

### タスク5: ドキュメント更新・後始末
- **API仕様ドキュメントの更新**: 旧 `POST /api/device/logs` と `logType` の記述が以下に残っているため新フローへ更新する:
  - [docs/api-specification.md](../api-specification.md)
  - [docs/device-api-specification.md](../device-api-specification.md)
- 全文検索の対象に **`docs/` も含める**こと（`logType` / `device/logs` / `DeviceLog` / `sendLogs` の残骸確認）。
- Swagger（`/api/docs`）の表記が新フローに更新されることを確認。
- 関連する docx 版API仕様（生成スクリプトがある場合）への波及有無も確認。

---

## 4. 検証（実装者が完了報告前に実施）

1. `pnpm --filter @sinmirai/api build` と既存テストがグリーン。
2. ローカルで device トークンを使い、`upload-url` → 返却URLへ `curl -X PUT --data-binary @app.log` → `upload-complete` の3ステップが通り、`device_log_files` に1行入る。同名再送で行が増えず更新されること（upsert）。
3. §2-5 の異常系が全て弾かれること: (a) 他筐体prefix/任意キーの `objectKey`、(b) `fileName` に `..` `/` `\` 制御文字・空白のみ・超長、(c) 宣言サイズは小さいが実体が上限超過、(d) 許可外MIME。いずれもDBに行が作られないこと（NG時 deleteObject を入れた場合はS3にも残らないこと）。
4. 管理API `GET .../logs` で一覧、`.../download-url` の署名URLで実ファイルがダウンロードできること。
5. 旧 `POST /api/device/logs` は、§6 で決めた移行方針に応じて検証すること。即廃止なら404、一定期間併存なら410(Gone)を返すこと。

---

## 5. フロントエンド（apps/web）への影響

- 筐体詳細画面でログを直近20件テーブル表示していた箇所が、`deviceLogs` 廃止で壊れる。**ファイル一覧（ファイル名・サイズ・アップロード日時）＋ダウンロードボタン**に作り替える。ダウンロードは `download-url` API で署名URLを取得して遷移。
- API契約変更を含むため、**web側の改修とAPIデプロイの順序**に注意（`forbidNonWhitelisted` 等でフロント先行/後追いの可否を確認。過去 BUG-002 の教訓参照）。
- 本指示書はバックエンド中心。フロント詳細タスクは別途切り出してよい。

---

## 6. リスク・申し送り

- **筐体アプリの移行（着手前に決定）**: 旧 `POST /logs` を即 404 廃止すると、新フロー未対応の筐体からのログが失われる。**実装着手前に筐体チームの移行タイミングを確認し、(a) 即廃止 / (b) 一定期間 410(Gone)＋非推奨で併存、のどちらかを決めてから着手**する。併存させる場合は廃止予定日も合わせて決める。
- **インフラ前提**: `S3_LOGS_BUCKET`（非公開・ライフサイクル）作成とタスクロール権限付与が**デプロイ前に必須**。未整備だと `upload-complete` の `headObject` で失敗する。
- **既存 `device_logs` データ**: マイグレーションでDROP。保全要否をユーザー確認。
- **検索要件の将来再燃**: 「level/期間で絞りたい」が後で出たら、ファイル内検索ビューア or 受信時の軽量インデックス（行数・ERROR件数のサマリのみDB保持）を別途設計。

---

## 7. 完了報告フォーマット（CodeX → Claude）

- 変更ファイル一覧（パス）
- スキーマ差分（migrate名）
- 新規/廃止エンドポイント一覧
- §4 の検証結果（実行コマンドと結果）
- 追加した環境変数と `.env.example` への反映
- フロント影響範囲の引き継ぎメモ
