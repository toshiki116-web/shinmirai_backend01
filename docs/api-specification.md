# 新・ミライ人間洗濯機 API 仕様書

- **バージョン**: 0.1.0
- **最終更新**: 2026-04-20
- **対象読者**: フロントエンド開発者

---

## 1. 概要

拠点・筐体・動画コンテンツの管理基盤 API。用途別に2系統を提供する。

| 系統 | プレフィックス | 認証 | 利用者 |
| --- | --- | --- | --- |
| 管理画面系 | `/api/admin/*`、`/api/auth/*` | JWT Bearer | 管理画面（Next.js） |
| 筐体系 | `/api/device/*` | device_token Bearer | 筐体端末（PC） |
| 共通 | `/api/health` | 不要 | 監視・L7ヘルスチェック |

---

## 2. 共通仕様

### 2.1 ベース情報

| 項目 | 値 |
| --- | --- |
| Base URL（開発） | `http://localhost:3000/api` |
| Swagger UI | `http://localhost:3000/api/docs` |
| Content-Type | `application/json; charset=utf-8` |
| タイムゾーン | レスポンス日時は ISO 8601（UTC） |
| CORS | `CORS_ORIGIN`（未設定時は `*`）、`credentials: true` |

### 2.2 統一レスポンス形式

**成功（TransformInterceptor が付与）**

```json
{
  "result": "ok",
  "data": { /* エンドポイント固有のデータ */ },
  "message": ""
}
```

- `data` が `null`/`undefined` の場合は `{}` に正規化される。
- HTTP ステータスは NestJS 既定（GET=200、POST=201、PATCH/DELETE=200）。

**失敗（GlobalHttpExceptionFilter が付与）**

```json
{
  "result": "ng",
  "error_code": "BAD_REQUEST",
  "message": "エラー内容（日本語）"
}
```

`class-validator` のバリデーションエラーは配列メッセージをカンマ区切り文字列に変換して `message` に格納。

### 2.3 エラーコード一覧

| HTTP | error_code | 発生例 |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | 不正なパラメータ |
| 401 | `UNAUTHORIZED` | 認証失敗、トークン無効・失効 |
| 403 | `FORBIDDEN` | 権限なし |
| 404 | `NOT_FOUND` | リソースなし・論理削除済み |
| 409 | `CONFLICT` | 既に紐付け済み等の競合 |
| 422 | `UNPROCESSABLE_ENTITY` | バリデーション失敗 |
| 429 | `TOO_MANY_REQUESTS` | レート制限 |
| 500 | `INTERNAL_ERROR` | サーバー内部エラー |

### 2.4 認証

#### 管理画面系: JWT Bearer

```
Authorization: Bearer <access_token>
```

- `POST /api/auth/login` で発行。
- JWT ペイロード: `{ sub: adminId, loginId, iat, exp }`。
- 無効・失効時は 401。

#### 筐体系: device_token Bearer

```
Authorization: Bearer <device_token>
```

- 筐体登録時（`POST /api/admin/units`）に一度だけレスポンスで返却される。
- 以降の筐体取得系レスポンスには含まれない（再発行は管理画面操作が必要）。
- 無効・筐体削除済みは 401。

### 2.5 ページネーション（管理画面系共通）

**リクエスト（クエリ）**

| パラメータ | 型 | 既定値 | 範囲 |
| --- | --- | --- | --- |
| `page` | number | 1 | `>=1`、整数 |
| `limit` | number | 20 | `1〜100`、整数 |

**レスポンス**

```json
{
  "items": [ /* ... */ ],
  "total": 100,
  "page": 1,
  "limit": 20
}
```

- 論理削除済みレコードは自動除外（Sites/Units は `status != 'deleted'`、Contents は `isActive = true`）。

### 2.6 バリデーション

- `ValidationPipe` を全ルートに適用。
- `whitelist: true` + `forbidNonWhitelisted: true` → DTO 未定義プロパティは 400。
- `transform: true` + `enableImplicitConversion: true` → クエリ文字列を number/boolean に自動変換。

---

## 3. 管理画面系 API

### 3.1 認証

#### POST /api/auth/login

管理者ログイン（JWT 発行）。**認証不要**。

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `loginId` | string | ○ | ログインID |
| `password` | string | ○ | パスワード |

**レスポンス 201**

```json
{
  "result": "ok",
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
    "admin": {
      "id": "<uuid>",
      "loginId": "admin",
      "name": "Administrator"
    }
  },
  "message": ""
}
```

**エラー**

- 401: `ログインIDまたはパスワードが正しくありません`

---

### 3.2 ヘルスチェック

#### GET /api/health

**認証不要**。DB 疎通確認付き。

**レスポンス 200**

```json
{
  "result": "ok",
  "data": {
    "status": "ok",
    "details": { "database": { "status": "up" } }
  },
  "message": ""
}
```

---

### 3.3 拠点管理（Sites）

`siteId` フォーマット: `LOC-0001`（4桁ゼロ埋め自動採番）。

#### GET /api/admin/sites

拠点一覧取得。

**クエリ**

| パラメータ | 型 | 説明 |
| --- | --- | --- |
| `page` / `limit` | number | ページネーション（共通） |
| `keyword` | string | 拠点名・拠点ID の部分一致（大小区別なし） |
| `status` | `'active' \| 'warning' \| 'stopped'` | ステータス絞り込み |

**レスポンス 200**

```json
{
  "items": [
    {
      "siteId": "LOC-0001",
      "siteName": "大阪梅田店",
      "address": "大阪府大阪市北区梅田1-1-1",
      "phoneNumber": "06-1234-5678",
      "note": "保守窓口あり",
      "status": "active",
      "createdAt": "2026-04-01T00:00:00.000Z",
      "updatedAt": "2026-04-01T00:00:00.000Z",
      "unitCount": 3
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

#### GET /api/admin/sites/:siteId

拠点詳細（配下の筐体一覧 `units` を含む）。

**エラー**: 404（未存在・削除済み）。

#### POST /api/admin/sites

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `siteName` | string | ○ | 拠点名 |
| `address` | string | - | 住所 |
| `phoneNumber` | string | - | 電話番号 |
| `note` | string | - | 備考 |

**レスポンス 201**: 作成された拠点オブジェクト。

#### PATCH /api/admin/sites/:siteId

部分更新（全フィールド任意）。レスポンスは更新後オブジェクト。

#### DELETE /api/admin/sites/:siteId

論理削除（`status = 'deleted'`）。レスポンスは削除後オブジェクト。

---

### 3.4 筐体管理（Units）

`unitId` フォーマット: `UNIT-XXXXXXXX`（UUID 先頭8桁の大文字、自動採番）。

#### GET /api/admin/units

**クエリ**

| パラメータ | 型 | 説明 |
| --- | --- | --- |
| `page` / `limit` | number | ページネーション |
| `keyword` | string | 筐体ID・PC UUID・筐体名で部分一致 |
| `siteId` | string | 所属拠点で絞り込み |
| `status` | `'normal' \| 'warning' \| 'stop' \| 'maintenance'` | ステータス絞り込み |

**レスポンス 200**（`items[]` の要素例）

```json
{
  "unitId": "UNIT-A0B1C2D3",
  "siteId": "LOC-0001",
  "unitName": "1号機",
  "pcUuid": "550e8400-e29b-41d4-a716-446655440000",
  "connectionMode": "online",
  "status": "normal",
  "alertMessage": null,
  "licenseStatus": "valid",
  "licenseExpiredAt": "2027-04-01T00:00:00.000Z",
  "lastSeenAt": "2026-04-06T10:30:00.000Z",
  "createdAt": "2026-04-01T00:00:00.000Z",
  "updatedAt": "2026-04-01T00:00:00.000Z",
  "site": { "siteId": "LOC-0001", "siteName": "大阪梅田店" }
}
```

> **注意**: `deviceToken` はこのレスポンスには含まれない（作成時レスポンスのみ返却）。

#### GET /api/admin/units/:unitId

詳細取得。`deviceAlerts`（直近10件）、`deviceLogs`（直近20件）を含む。

#### POST /api/admin/units

**リクエスト**

| フィールド | 型 | 必須 | 既定 | 説明 |
| --- | --- | --- | --- | --- |
| `siteId` | string | ○ | - | 所属拠点ID |
| `unitName` | string | ○ | - | 筐体名 |
| `pcUuid` | string (UUID v4) | - | - | PC端末UUID |
| `connectionMode` | `'online' \| 'offline'` | - | `'online'` | 接続モード |

**レスポンス 201**

```json
{
  "unitId": "UNIT-A0B1C2D3",
  "siteId": "LOC-0001",
  "unitName": "1号機",
  "deviceToken": "550e8400-e29b-41d4-a716-446655440000",
  "connectionMode": "online",
  "status": "normal",
  "licenseStatus": "unknown",
  "createdAt": "2026-04-20T00:00:00.000Z",
  "updatedAt": "2026-04-20T00:00:00.000Z"
}
```

> **重要**: `deviceToken` はここでのみ返却される。フロント側で筐体管理者に確実に提示・控えさせること。

#### PATCH /api/admin/units/:unitId

**リクエスト**（すべて任意）

| フィールド | 型 |
| --- | --- |
| `siteId` | string |
| `unitName` | string |
| `pcUuid` | string |
| `connectionMode` | `'online' \| 'offline'` |
| `note` | string |

#### DELETE /api/admin/units/:unitId

論理削除（`status = 'deleted'`）。

---

### 3.5 コンテンツ管理（Contents）

`contentId` フォーマット: `CNT-00001`（5桁ゼロ埋め自動採番）。

#### GET /api/admin/contents

**クエリ**

| パラメータ | 型 | 説明 |
| --- | --- | --- |
| `page` / `limit` | number | ページネーション |
| `keyword` | string | コンテンツ名・コンテンツIDで部分一致 |
| `statusCategory` | string | `'status1' \| 'status2' \| 'status3'` |
| `deliveryType` | `'general' \| 'limited'` | 配信区分 |
| `language` | string | 言語コード（例 `ja`） |

**レスポンス 200**（`items[]` の要素例）

```json
{
  "contentId": "CNT-00001",
  "contentName": "臨床試験ガイダンス映像 #04",
  "language": "ja",
  "deliveryType": "general",
  "statusCategory": "status1",
  "filePath": "/contents/2026/04/video.mp4",
  "fileSize": "1234567890",
  "checksum": "abc123def456",
  "version": 1,
  "isActive": true,
  "createdAt": "2026-04-01T00:00:00.000Z",
  "updatedAt": "2026-04-01T00:00:00.000Z",
  "assignedSiteCount": 2
}
```

> `fileSize` は BigInt のため**文字列**で返却される。フロント側で BigInt/数値変換時に注意。

#### GET /api/admin/contents/:contentId

詳細取得。`assignedSites: [{ siteId, siteName }]` を含む。

#### POST /api/admin/contents

**リクエスト**

| フィールド | 型 | 必須 | 既定 | 説明 |
| --- | --- | --- | --- | --- |
| `contentName` | string | ○ | - | コンテンツ名 |
| `language` | string | - | `'ja'` | 言語コード |
| `deliveryType` | `'general' \| 'limited'` | - | `'general'` | 配信区分 |
| `statusCategory` | string | - | `'status1'` | 状態カテゴリ |
| `siteIds` | string[] | - | - | 配信対象拠点ID |

**レスポンス 201**: 作成後オブジェクト（`assignedSites` 含む）。

#### PATCH /api/admin/contents/:contentId

`POST` と同じフィールドを部分的に指定可能。`siteIds` を含めると**既存の割り当てをすべて置換**（トランザクション処理）。`version` は自動インクリメント。

#### DELETE /api/admin/contents/:contentId

論理削除（`isActive = false`）。

#### POST /api/admin/contents/:contentId/assign

配信対象拠点の**一括置換**。

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `siteIds` | string[] | ○ | 1要素以上。既存割り当てを全削除→再作成 |

**レスポンス 200**

```json
{
  "contentId": "CNT-00001",
  "assignedSiteIds": ["LOC-0001", "LOC-0002"]
}
```

---

## 4. 筐体系 API

すべて `DeviceAuthGuard` 保護。`Authorization: Bearer <device_token>` が必須。

### 4.1 GET /api/device/master/sites-units

初回設定画面用の拠点・筐体マスタ取得。

**レスポンス 200**

```json
{
  "sites": [
    {
      "siteId": "LOC-0001",
      "siteName": "大阪梅田店",
      "units": [
        { "unitId": "UNIT-A0B1C2D3", "unitName": "1号機" }
      ]
    }
  ]
}
```

---

### 4.2 POST /api/device/activate

筐体を拠点・筐体IDに紐付け、PC UUID を登録。

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `siteId` | string | ○ | 拠点ID |
| `unitId` | string | ○ | 筐体ID |
| `pcUuid` | string (UUID v4) | ○ | PC端末UUID |

**レスポンス 200**

```json
{
  "unitId": "UNIT-A0B1C2D3",
  "siteId": "LOC-0001",
  "pcUuid": "550e8400-e29b-41d4-a716-446655440000",
  "deviceToken": "550e8400-e29b-41d4-a716-446655440000"
}
```

**エラー**

- 409: `この筐体は既に紐付け済みです。管理画面から解除してください`

---

### 4.3 GET /api/device/contents

当該筐体の拠点に配信可能なコンテンツ一覧。

**クエリ**

| パラメータ | 型 | 説明 |
| --- | --- | --- |
| `language` | string | 省略可。言語コードで絞り込み |

**レスポンス 200**

```json
{
  "items": [
    {
      "contentId": "CNT-00001",
      "contentName": "臨床試験ガイダンス映像 #04",
      "statusCategory": "status1",
      "downloadUrl": "/contents/2026/04/video.mp4",
      "version": 1,
      "checksum": "abc123def456"
    }
  ]
}
```

> 現段階では `downloadUrl` は `filePath` をそのまま返却。Phase 5 で CloudFront 署名付き URL に置き換え予定。

---

### 4.4 GET /api/device/license-check

```json
{
  "licenseValid": true,
  "expiredAt": "2027-04-01T00:00:00.000Z",
  "plan": "standard"
}
```

- 判定: `licenseStatus === 'valid'` かつ `licenseExpiredAt` 未経過（または未設定）。

---

### 4.5 POST /api/device/heartbeat

稼働状況と各デバイスステータスを送信。`unit.status` と `unit.lastSeenAt` を更新。

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `status` | `'normal' \| 'warning' \| 'stop' \| 'maintenance'` | ○ | 筐体ステータス |
| `devices` | `{ name: string, status: string }[]` | - | 各デバイスの状態 |
| `sentAt` | string (ISO 8601) | ○ | 送信日時 |

**レスポンス 200**

```json
{ "received": true }
```

---

### 4.6 POST /api/device/alerts

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `alertType` | string | ○ | 例 `device_disconnected` |
| `deviceName` | string | - | 例 `heart_sensor` |
| `detail` | string | - | 詳細メッセージ |
| `level` | `'info' \| 'warning' \| 'error' \| 'critical'` | ○ | アラートレベル |
| `occurredAt` | string (ISO 8601) | ○ | 発生日時 |

**レスポンス 200**

```json
{ "alertId": "<uuid>" }
```

- `level` が `error` または `critical` の場合、`unit.alertMessage` を更新し `unit.status = 'warning'` に遷移。

---

### 4.7 POST /api/device/analytics/daily

日次利用回数を UPSERT（`(unitId, targetDate)` をキー）。

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `targetDate` | string (ISO 8601 日付) | ○ | 対象日 |
| `useCount` | integer | ○ | `>= 0` |

**レスポンス 200**

```json
{ "received": true }
```

---

### 4.8 POST /api/device/logs

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `logType` | `'application' \| 'error' \| 'event'` | ○ | ログ種別 |
| `logs` | `LogEntry[]` | ○ | **最大100件** |

`LogEntry`:

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `timestamp` | string (ISO 8601) | ○ | 発生時刻 |
| `level` | `'DEBUG' \| 'INFO' \| 'WARN' \| 'ERROR'` | ○ | ログレベル |
| `message` | string | ○ | 本文 |

**レスポンス 200**

```json
{ "receivedCount": 5 }
```

---

## 5. Enum / 定数一覧

| Enum | 値 |
| --- | --- |
| SiteStatus | `active`, `warning`, `stopped`, `deleted` |
| UnitStatus | `normal`, `warning`, `stop`, `maintenance`, `deleted` |
| ConnectionMode | `online`, `offline` |
| LicenseStatus | `valid`, `expired`, `unknown` |
| DeliveryType | `general`, `limited` |
| StatusCategory | `status1`, `status2`, `status3` |
| AlertLevel | `info`, `warning`, `error`, `critical` |
| LogLevel | `DEBUG`, `INFO`, `WARN`, `ERROR` |
| LogType | `application`, `error`, `event` |

---

## 6. 実装上の注意・未確定事項

- **コンテンツファイルアップロード**: `POST /api/admin/contents` でメタデータのみ登録。実ファイルアップロード API は Phase 5 で S3 直接アップロード（署名付きURL方式）に切り出す予定。
- **CloudFront 署名付きURL**: 現段階の `downloadUrl` は `filePath` をそのまま返却。Phase 5 で置換予定のため、フロント実装では URL をそのまま `<video>` の `src` に渡す前提で問題ないが、将来 URL 形式が変わる点に留意。
- **fileSize**: BigInt のため文字列返却。
- **論理削除**: 一覧取得では自動除外される。管理画面で「削除済みを含めて表示」する機能が必要な場合は API 拡張が必要（現状未対応）。
- **Swagger UI**: `GET /api/docs` で OpenAPI 3 の対話型ドキュメントが参照可能。最新仕様はこちらが正となる。

---

## 7. 問い合わせ

仕様疑義・追加要望はサーバーサイド担当まで。
