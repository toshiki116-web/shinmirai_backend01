# 新・ミライ人間洗濯機 API 仕様書

- **バージョン**: 0.1.0
- **最終更新**: 2026-06-04
- **対象読者**: フロントエンド開発者・筐体アプリ開発者

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
| Base URL（本番） | `https://fhwm.jp/api` |
| Base URL（ローカル開発） | `http://localhost:3000/api` |
| Swagger UI（本番） | `https://fhwm.jp/api/docs` |
| Content-Type | `application/json; charset=utf-8` |
| タイムゾーン | レスポンス日時は ISO 8601（UTC） |
| CORS | 本番は `CORS_ORIGIN=https://fhwm.jp`、`credentials: true` |

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

- `POST /api/auth/login` で発行。**メールアドレス + パスワード**で認証。
- JWT ペイロード: `{ sub: adminId, email, role, iat, exp }`。
- **アクセストークン有効期限: 15分（900秒）**。期限切れ時は `POST /api/auth/refresh` で再発行。
- 無効・失効時は 401。

#### トークンライフサイクル（リフレッシュ）

- ログイン時に `access_token`（15分）と `refresh_token`（**7日**）を発行。
- `refresh_token` はサーバー側で **SHA-256 ハッシュ化して DB 保存**（平文は保持しない）。
- `POST /api/auth/refresh` でアクセストークンを再発行。**リフレッシュトークンはローテーション**され、旧トークンは即時失効する（新しい `refresh_token` を返却するので必ず差し替えること）。
- `POST /api/auth/logout` で `refresh_token` を失効。
- フロント実装方針: API 呼び出しが 401 を返したら `refresh` を一度試行し、成功すれば元のリクエストを再送、失敗すればログイン画面へ遷移。

#### ロール（RBAC）

管理画面系の各エンドポイントはロールで権限制御される。JWT の `role` クレームで判定。

| ロール | 権限範囲 |
| --- | --- |
| `master` | 全操作。ユーザー管理 API は master のみ |
| `editor` | 拠点・筐体・コンテンツの作成/更新/削除が可能 |
| `viewer` | 参照（GET）のみ |

権限不足時は 403（`FORBIDDEN`）。

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

管理者ログイン（アクセストークン・リフレッシュトークン発行）。**認証不要**。

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `email` | string (email) | ○ | メールアドレス |
| `password` | string | ○ | パスワード |

**レスポンス 201**

```json
{
  "result": "ok",
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
    "refresh_token": "0f3a...（96桁のhex文字列）",
    "admin": {
      "id": "<uuid>",
      "loginId": "admin",
      "email": "kushida@artifice-inc.com",
      "name": "Administrator",
      "role": "master"
    }
  },
  "message": ""
}
```

**エラー**

- 401: `メールアドレスまたはパスワードが正しくありません`（未存在・無効ユーザー含む）

#### POST /api/auth/refresh

リフレッシュトークンを検証し、新しいアクセストークン・リフレッシュトークンを発行。**認証不要**（リフレッシュトークン自体が認証材料）。

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `refresh_token` | string | ○ | ログイン/前回リフレッシュで取得したトークン |

**レスポンス 201**

```json
{
  "result": "ok",
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
    "refresh_token": "新しいトークン（旧トークンは失効）"
  },
  "message": ""
}
```

**エラー**

- 401: `リフレッシュトークンが無効です`（未存在・失効済み・期限切れ）／`管理ユーザーが無効です`

#### POST /api/auth/logout

リフレッシュトークンを失効する。**認証不要**。

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `refresh_token` | string | ○ | 失効させるトークン |

**レスポンス 201**

```json
{ "result": "ok", "data": { "success": true }, "message": "" }
```

> 未存在・失効済みトークンを渡しても 200 系で `success: true` を返す（冪等）。

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

詳細取得。`deviceAlerts`（直近10件）、`deviceLogFiles`（直近20件）を含む。

#### GET /api/admin/units/:unitId/logs

筐体ログファイルのメタデータ一覧を取得する。`page` / `limit` によるページングに対応。

**レスポンス 200**

```json
{
  "items": [
    {
      "logFileId": "uuid",
      "fileName": "app-20260623.log",
      "fileSize": 1048576,
      "contentType": "text/plain",
      "uploadedAt": "2026-06-23T10:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

#### GET /api/admin/units/:unitId/logs/:logFileId/download-url

非公開S3バケット上のログファイルを取得するためのPresigned GET URLを発行する。

**レスポンス 200**

```json
{
  "downloadUrl": "https://...",
  "expiresIn": 300
}
```

#### POST /api/admin/units

**リクエスト**

| フィールド | 型 | 必須 | 既定 | 説明 |
| --- | --- | --- | --- | --- |
| `siteId` | string | ○ | - | 所属拠点ID（**存在しない/削除済みの場合 404**） |
| `unitName` | string | ○ | - | 筐体名 |
| `connectionMode` | `'online' \| 'offline'` | - | `'online'` | 接続モード |

> `pcUuid` は登録時に指定できない（筐体側の `POST /api/device/activate` で登録される）。管理画面では**表示専用**。
> 必要ロール: `master` / `editor`。

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

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `siteId` | string | 変更時は存在検証あり（未存在/削除済みは 404） |
| `unitName` | string | 筐体名 |
| `connectionMode` | `'online' \| 'offline'` | 接続モード |
| `note` | string | 備考（※現状サーバー側で永続化されない） |

> `pcUuid` は更新不可（表示専用）。必要ロール: `master` / `editor`。

#### PATCH /api/admin/units/:unitId/license

筐体ライセンス状態を更新する。必要ロール: `master` / `editor`。

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `licenseStatus` | `'valid' \| 'expired' \| 'suspended' \| 'unknown'` | ○ | ライセンス状態 |
| `licenseExpiredAt` | ISO8601 datetime | - | 有効期限。`null` または省略可 |

**レスポンス 200**: 更新後の筐体オブジェクト。

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
  "filePath": "contents/CNT-00001/550e8400-e29b-41d4-a716-446655440000.mp4",
  "fileSize": "1234567890",
  "checksum": "abc123def456",
  "mimeType": "video/mp4",
  "uploadStatus": "ready",
  "thumbnailPath": "contents/CNT-00001/thumbnails/550e8400-e29b-41d4-a716-446655440000.jpg",
  "thumbnailMimeType": "image/jpeg",
  "thumbnailStatus": "ready",
  "version": 1,
  "isActive": true,
  "createdAt": "2026-04-01T00:00:00.000Z",
  "updatedAt": "2026-04-01T00:00:00.000Z",
  "assignedSiteCount": 2
}
```

> `fileSize` は BigInt のため**文字列**で返却される。フロント側で BigInt/数値変換時に注意。
> `filePath` は S3 バケット相対のオブジェクトキー。フル URL は保存しない。

#### GET /api/admin/contents/:contentId

詳細取得。`assignedSites: [{ siteId, siteName }]` を含む。
サムネイルが登録済み（`thumbnailStatus = 'ready'`）の場合のみ、管理画面プレビュー用に `thumbnailUrl`（CloudFront署名付きURL）を返す。未設定・アップロード中・失敗時は `thumbnailUrl: null`。

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

#### POST /api/admin/contents/:contentId/upload-url

ブラウザから S3 へ動画ファイルを直接 PUT するための署名付き URL を発行する。必要ロール: `master` / `editor`。成功時に対象コンテンツは `uploadStatus = 'uploading'` になる。

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `fileName` | string | ○ | 元ファイル名 |
| `contentType` | string | ○ | `video/mp4` など許可済み MIME |
| `fileSize` | number | ○ | バイト数。アップロード上限以下 |

**レスポンス 201**

```json
{
  "uploadUrl": "https://sinmirai-contents-741448957802-apne3.s3.ap-northeast-3.amazonaws.com/...",
  "objectKey": "contents/CNT-00001/550e8400-e29b-41d4-a716-446655440000.mp4",
  "expiresIn": 900
}
```

#### POST /api/admin/contents/:contentId/upload-complete

S3 への PUT 完了後に呼び出し、`HeadObject` で実在確認してメタデータを確定する。必要ロール: `master` / `editor`。成功時に `uploadStatus = 'ready'`、失敗時に `uploadStatus = 'failed'` へ更新される。

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `objectKey` | string | ○ | `upload-url` で返却された S3 オブジェクトキー |
| `checksum` | string | - | 任意。未指定時は S3 ETag を使用 |

**レスポンス 200**: 更新後のコンテンツオブジェクト。

#### POST /api/admin/contents/:contentId/thumbnail-url

ブラウザから S3 へサムネイル画像を直接 PUT するための署名付きURLを発行する。必要ロール: `master` / `editor`。成功時に対象コンテンツの `thumbnailStatus = 'uploading'` になる。

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `fileName` | string | ○ | 元ファイル名 |
| `contentType` | string | ○ | `image/jpeg`, `image/png`, `image/webp` |
| `fileSize` | number | ○ | バイト数。上限は `MAX_THUMBNAIL_SIZE_BYTES` |

**レスポンス 201**

```json
{
  "uploadUrl": "https://sinmirai-contents-741448957802-apne3.s3.ap-northeast-3.amazonaws.com/...",
  "objectKey": "contents/CNT-00001/thumbnails/550e8400-e29b-41d4-a716-446655440000.jpg",
  "expiresIn": 900
}
```

#### POST /api/admin/contents/:contentId/thumbnail-complete

S3 への PUT 完了後に呼び出し、`HeadObject` で実体・MIME・サイズ・キー所属を確認してサムネイル情報を確定する。成功時は `thumbnailStatus = 'ready'`、確認失敗時は `thumbnailStatus = 'failed'`。

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `objectKey` | string | ○ | `thumbnail-url` で返却された S3 オブジェクトキー |
| `checksum` | string | - | 任意。未指定時は S3 ETag を使用 |

**レスポンス 200**: 更新後のコンテンツオブジェクト。

#### DELETE /api/admin/contents/:contentId/thumbnail

サムネイル設定を未設定に戻す。DB上の `thumbnailPath` / `thumbnailMimeType` を `null`、`thumbnailStatus` を `none` に更新する。S3オブジェクトの実削除は行わない。

**レスポンス 200**: 更新後のコンテンツオブジェクト。

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

### 3.6 ユーザー管理（Users）

管理ユーザー（管理画面アカウント）の CRUD。**全エンドポイント `master` ロール限定**（それ以外は 403）。

レスポンスの user オブジェクトは以下の項目を返す（**パスワードハッシュは一切返却しない**）。

```json
{
  "id": "<uuid>",
  "loginId": null,
  "email": "user@example.com",
  "name": "山田 太郎",
  "role": "editor",
  "note": null,
  "isActive": true,
  "createdAt": "2026-06-01T00:00:00.000Z",
  "updatedAt": "2026-06-01T00:00:00.000Z"
}
```

#### パスワードポリシー

- **12文字以上**
- 英大文字・英小文字・数字・記号のうち **3種類以上**を含む
- 違反時は 422（`UNPROCESSABLE_ENTITY`）相当のバリデーションエラー

#### GET /api/admin/users

**クエリ**

| パラメータ | 型 | 説明 |
| --- | --- | --- |
| `page` / `limit` | number | ページネーション |
| `keyword` | string | メールアドレス・名前で部分一致 |
| `role` | `'master' \| 'editor' \| 'viewer'` | ロール絞り込み |
| `isActive` | boolean | 有効フラグ絞り込み |

**レスポンス 200**: `{ items, total, page, limit }`（`createdAt` 降順）。

#### GET /api/admin/users/:id

ユーザー詳細。**エラー**: 404（未存在）。

#### POST /api/admin/users

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `email` | string (email) | ○ | メールアドレス（重複時 409） |
| `name` | string | ○ | 名前 |
| `password` | string | ○ | パスワード（上記ポリシー準拠） |
| `role` | `'master' \| 'editor' \| 'viewer'` | ○ | ロール |
| `note` | string | - | 備考 |

**レスポンス 201**: 作成後 user オブジェクト。**エラー**: 409（メール重複）。

#### PATCH /api/admin/users/:id

**リクエスト**（すべて任意）

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `email` | string (email) | 変更時は重複検証（409） |
| `name` | string | 名前 |
| `role` | `'master' \| 'editor' \| 'viewer'` | ロール |
| `note` | string | 備考 |
| `isActive` | boolean | 有効フラグ |

**ガードレール**（不正操作は 400）:

- 自分自身を無効化（`isActive: false`）できない
- 自分自身のロールを `master` 以外へ降格できない
- 最後の有効な `master` を降格・無効化できない

#### PATCH /api/admin/users/:id/password

パスワードリセット。

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `password` | string | ○ | 新パスワード（ポリシー準拠） |

#### DELETE /api/admin/users/:id

ユーザーの**無効化**（`isActive = false`、物理削除はしない）。

**ガードレール**（400）: 自分自身は削除不可／最後の有効な `master` は無効化不可。

---

## 4. 筐体系 API

すべて `DeviceAuthGuard` 保護。`Authorization: Bearer <device_token>` が必須。

### 4.1 POST /api/device/activate

認証済み筐体にPC UUID を登録。拠点・筐体は `device_token` から特定されるため、`siteId` / `unitId` は送信しない。

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
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

- 400: `この筐体は拠点が未割当です。管理画面で拠点を割り当ててください`
- 409: `この筐体は既に紐付け済みです。管理画面から解除してください`

---

### 4.2 GET /api/device/contents

当該筐体に配信可能なコンテンツ一覧。`uploadStatus = 'ready'` かつ `filePath` があるコンテンツのみ返却する。

配信ルール:

- `deliveryType = 'general'`: 全拠点に配信
- `deliveryType = 'limited'`: 当該筐体の拠点に割り当てられたコンテンツのみ配信

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
      "deliveryType": "general",
      "downloadUrl": "https://d1v1pzc5e0jqa0.cloudfront.net/contents/CNT-00001/550e8400-e29b-41d4-a716-446655440000.mp4?Expires=...",
      "thumbnailUrl": "https://d1v1pzc5e0jqa0.cloudfront.net/contents/CNT-00001/thumbnails/550e8400-e29b-41d4-a716-446655440000.jpg?Expires=...",
      "version": 1,
      "checksum": "abc123def456"
    }
  ]
}
```

> `deliveryType` は配信区分。`'general'`（一般・全拠点配信）または `'limited'`（特別・割当拠点のみ配信）。
> `downloadUrl` は CloudFront 署名付き URL。筐体はこの URL を直接ダウンロードに使用する。署名無しの CloudFront 直アクセスは 403。
> `thumbnailUrl` はサムネイルが未設定、アップロード中、失敗の場合は `null`。

---

### 4.3 GET /api/device/license-check

```json
{
  "licenseValid": true,
  "expiredAt": "2027-04-01T00:00:00.000Z",
  "plan": "standard"
}
```

- 判定: `licenseStatus === 'valid'` の場合に `licenseValid: true`。有効期限の超過だけでは停止しない（管理サイト上で「期限切れ」と表示するのみ）。実際の停止は管理者が `licenseStatus` を `suspended`/`expired` に変更したときのみ。`expiredAt` は情報提供として返す。(BUG-008)

---

### 4.4 POST /api/device/heartbeat

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

### 4.5 POST /api/device/alerts

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

### 4.6 POST /api/device/analytics/daily

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

### 4.7 POST /api/device/logs/upload-url

ローテーション済みログファイルをS3へ直接PUTするためのPresigned URLを発行する。

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `fileName` | string | ○ | ログファイル名。`A-Z a-z 0-9 . _ -` のみ許可 |
| `contentType` | string | ○ | `text/plain` または `application/gzip` |
| `fileSize` | number | ○ | ファイルサイズ(bytes)。環境変数 `MAX_LOG_SIZE_BYTES` 以下 |

**レスポンス 201**

```json
{
  "uploadUrl": "https://...",
  "objectKey": "logs/UNIT-A0B1C2D3/app-20260623.log",
  "expiresIn": 900
}
```

### 4.8 POST /api/device/logs/upload-complete

S3アップロード済みログファイルを検証し、DBへメタデータを保存する。`objectKey` は認証済み筐体の `logs/{unitId}/` 配下かつ `fileName` と一致する必要がある。

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `objectKey` | string | ○ | `upload-url` で返却されたS3キー |
| `fileName` | string | ○ | `upload-url` に指定したログファイル名 |
| `contentType` | string | ○ | 筐体が送信したMIME。保存時はS3実体のContent-Typeを優先 |
| `checksum` | string | - | クライアント側チェックサム |

**レスポンス 201**

```json
{
  "logFileId": "uuid",
  "receivedAt": "2026-06-23T10:00:00.000Z"
}
```

---

## 5. Enum / 定数一覧

| Enum | 値 |
| --- | --- |
| AdminRole | `master`, `editor`, `viewer` |
| SiteStatus | `active`, `warning`, `stopped`, `deleted` |
| UnitStatus | `normal`, `warning`, `stop`, `maintenance`, `deleted` |
| ConnectionMode | `online`, `offline` |
| LicenseStatus | `valid`, `expired`, `suspended`, `unknown` |
| DeliveryType | `general`, `limited` |
| StatusCategory | `status1`, `status2`, `status3` |
| ContentUploadStatus | `none`, `uploading`, `ready`, `failed` |
| ContentThumbnailStatus | `none`, `uploading`, `ready`, `failed` |
| AlertLevel | `info`, `warning`, `error`, `critical` |

---

## 6. 実装上の注意・未確定事項

- **コンテンツファイルアップロード**: メタデータ登録後、`upload-url` で S3 署名付き PUT URL を取得し、ブラウザから S3 へ直接アップロードする。完了後は `upload-complete` でメタデータを確定する。
- **CloudFront 署名付きURL**: 筐体向け `downloadUrl` は CloudFront 署名付き URL。署名期限は環境変数 `SIGNED_URL_TTL_SECONDS` で制御する。
- **fileSize**: BigInt のため文字列返却。
- **論理削除**: 一覧取得では自動除外される。管理画面で「削除済みを含めて表示」する機能が必要な場合は API 拡張が必要（現状未対応）。
- **認証トークン**: アクセストークンは 15分、リフレッシュトークンは 7日。リフレッシュはローテーション方式（旧トークン即時失効）のため、フロントは `refresh` レスポンスの新トークンへ必ず差し替えること。
- **ユーザー管理 API**: `master` ロール専用。最後の有効な master を無効化・降格できないガードあり。
- **Swagger UI**: `GET /api/docs` で OpenAPI 3 の対話型ドキュメントが参照可能。最新仕様はこちらが正となる。

---

## 7. 問い合わせ

仕様疑義・追加要望はサーバーサイド担当まで。
