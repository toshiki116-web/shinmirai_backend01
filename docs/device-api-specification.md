# 新・ミライ人間洗濯機 筐体制御システム連携API 仕様書

- **バージョン**: 0.1.0
- **最終更新**: 2026-06-05
- **対象読者**: 現場の筐体制御用システム（投影アプリ）開発者

---

## 1. 概要

本書は、各拠点に納品された人間洗濯機の**現場筐体制御用システムが、本管理基盤と連携するためのAPI（`/api/device/*`）に限定**した仕様書です。

| 区分 | 内容 |
| --- | --- |
| 役割 | ①動画コンテンツの取得（ダウンロード）／②筐体の稼働状況・アラート・ログ・利用回数の送信 |
| 対象API | `/api/device/*` のみ |
| 認証 | `device_token`（Bearer） |
| 対象外 | 管理画面用API（`/api/admin/*`）・管理者認証（`/api/auth/*`）。これらは別仕様書を参照 |

データの流れ:

- **現場 → 本システム**: 筐体制御システムが稼働状況・アラート・ログ・利用回数を**送信**し、管理画面に反映される。
- **本システム → 現場**: 筐体制御システムが配信対象の動画一覧を**取得**し、署名付きURLで動画を直接ダウンロードする。

> 本システムから筐体へ能動的に指示を送る経路（リモート制御等）は提供しない。現場側が「送る／取りに行く」方式。

---

## 2. 共通仕様

### 2.1 ベース情報

| 項目 | 値 |
| --- | --- |
| Base URL（本番） | `https://fhwm.jp/api` |
| Base URL（ローカル開発） | `http://localhost:3000/api` |
| Content-Type | `application/json; charset=utf-8` |
| タイムゾーン | 日時は ISO 8601 で送受信（例 `2026-04-06T10:10:00+09:00`） |

### 2.2 認証（device_token）

全エンドポイントで、HTTPヘッダに筐体トークンを付与する。

```
Authorization: Bearer <device_token>
```

- `device_token` は**筐体登録時に管理画面で自動発行**され、運営から現場へ受け渡される（筐体ごとに一意）。
- トークンが無い／不正／筐体が削除済みの場合は **401** を返す。
- トークンは秘密情報。第三者に漏れないよう現場システムで安全に保管すること。

### 2.3 統一レスポンス形式

**成功時**（HTTP 2xx）

```json
{
  "result": "ok",
  "data": { /* 各APIの返却データ。本書では data の中身を示す */ },
  "message": ""
}
```

**エラー時**

```json
{
  "result": "ng",
  "error_code": "UNAUTHORIZED",
  "message": "無効なdevice_tokenです"
}
```

### 2.4 エラーコード一覧（筐体連携で発生し得るもの）

| HTTP | error_code | 主な発生例 |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | リクエスト本文の不正・バリデーション失敗 |
| 401 | `UNAUTHORIZED` | `device_token` 未指定・不正・筐体削除済み |
| 404 | `NOT_FOUND` | 指定リソースが存在しない |
| 409 | `CONFLICT` | 既に紐付け済みの筐体を再度 activate した |
| 422 | `UNPROCESSABLE_ENTITY` | バリデーション失敗 |
| 500 | `INTERNAL_ERROR` | サーバー内部エラー |

### 2.5 バリデーション方針

- リクエスト本文に**DTO未定義のプロパティを含めると 400** で拒否される（厳格モード）。仕様にあるフィールドのみ送ること。
- 日時は ISO 8601 文字列で送る。

---

## 3. 連携フロー

### 3.1 初期セットアップ（筐体の紐付け）

1. 管理画面で筐体を登録し、発行された `device_token` を現場の筐体制御システムへ設定する。
2. `POST /api/device/activate` で `pcUuid` のみを送信し、認証済み筐体にPC端末UUIDを登録する。
   - 拠点・筐体は `device_token` から特定される。`siteId` / `unitId` は送信しない。
   - 拠点は管理画面での筐体登録時に確定し、以降の配信対象判定に使われる。

### 3.2 通常運用

- **稼働状況の定期送信**: `POST /api/device/heartbeat`（間隔は運用合意による）。
- **コンテンツの取得とダウンロード**: `GET /api/device/contents` で配信対象＋署名付きURLを取得 → URLで動画を直接ダウンロード。
- **ライセンス確認**: `GET /api/device/license-check`。
- **異常通知**: `POST /api/device/alerts`。
- **ログ送信**: `POST /api/device/logs/upload-url` → S3へPUT → `POST /api/device/logs/upload-complete`。
- **利用回数送信**: `POST /api/device/analytics/daily`（日次）。

---

## 4. エンドポイント詳細

> 以下、レスポンスは `data` の中身のみを示す（実際は §2.3 の統一形式でラップされる）。

### 4.1 POST /api/device/activate

認証済み筐体にPC端末のUUIDを登録する。

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `pcUuid` | string (UUID v4) | ○ | PC端末UUID |

**レスポンス**

```json
{
  "unitId": "UNIT-A0B1C2D3",
  "siteId": "LOC-0001",
  "pcUuid": "550e8400-e29b-41d4-a716-446655440000",
  "deviceToken": "550e8400-e29b-41d4-a716-446655440000"
}
```

**エラー**

- 409: `この筐体は既に紐付け済みです。管理画面から解除してください`（既に `pcUuid` 設定済み）
- 400: `この筐体は拠点が未割当です。管理画面で拠点を割り当ててください`（拠点未割当）

---

### 4.2 GET /api/device/contents

当該筐体に**配信可能な動画コンテンツ一覧**と、その**ダウンロード用署名付きURL**を取得する。

**配信ルール**（重要）

- 一般動画（`deliveryType = 'general'`）: **全拠点に配信**
- 特別動画（`deliveryType = 'limited'`）: **当該筐体の拠点に割り当てられたコンテンツのみ配信**
- いずれも、アップロード完了済み（`uploadStatus = 'ready'`）かつファイル登録済みのもののみが対象。
- 管理データ不整合等により筐体の `siteId` が未設定の場合は空配列を返す。

**クエリ**

| パラメータ | 型 | 説明 |
| --- | --- | --- |
| `language` | string | 省略可。言語コード（例 `ja`）で絞り込み |

**レスポンス**

```json
{
  "items": [
    {
      "contentId": "CNT-00001",
      "contentName": "臨床試験ガイダンス映像 #04",
      "statusCategory": "status1",
      "deliveryType": "general",
      "downloadUrl": "https://d1v1pzc5e0jqa0.cloudfront.net/contents/CNT-00001/....mp4?Expires=...&Signature=...",
      "thumbnailUrl": "https://d1v1pzc5e0jqa0.cloudfront.net/contents/CNT-00001/thumbnails/....jpg?Expires=...&Signature=...",
      "version": 1,
      "checksum": "abc123def456"
    }
  ]
}
```

**ダウンロード方法・注意**

- `deliveryType` は配信区分。`'general'`（一般・全拠点配信）または `'limited'`（特別・割当拠点のみ配信）。
- `downloadUrl` は **CloudFront 署名付きURL**。このURLに対して**直接 GET でダウンロード**する（本APIサーバーは動画バイトを中継しない）。
- `thumbnailUrl` はサムネイルが登録済み（`thumbnailStatus = 'ready'`）の場合のみ CloudFront 署名付きURLを返す。未設定・アップロード中・失敗時は `null`。
- URLには**有効期限**がある。期限切れ後のアクセスは **403** になるため、ダウンロード前に本APIで取得し直すこと。
- 署名無しでCloudFrontへ直アクセスすると **403**。
- `version` / `checksum` で更新検知・整合性確認に利用できる（同一 `contentId` で `version` が上がっていれば再ダウンロード）。

---

### 4.3 GET /api/device/license-check

筐体のライセンス有効性を確認する。

**レスポンス**

```json
{
  "licenseValid": true,
  "expiredAt": "2027-04-01T00:00:00.000Z",
  "plan": "standard"
}
```

- 判定: ライセンス状態が `valid` の場合に `licenseValid: true`。有効期限の超過だけでは停止しない（管理サイト上で「期限切れ」と表示するのみ）。実際の停止は管理者が `licenseStatus` を `suspended`/`expired` に変更したときのみ。`expiredAt` は情報提供として返す。(BUG-008)

---

### 4.4 POST /api/device/heartbeat

筐体の稼働状況と各デバイスのステータスを送信する。受信時に筐体の状態・最終受信時刻が更新され、管理画面に反映される。

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `status` | `'normal' \| 'warning' \| 'stop' \| 'maintenance'` | ○ | 筐体ステータス |
| `devices` | `{ name: string, status: string }[]` | - | 各デバイス（例: unity_app / heart_sensor 等）の状態 |
| `sentAt` | string (ISO 8601) | ○ | 送信日時 |

**レスポンス**

```json
{ "received": true }
```

---

### 4.5 POST /api/device/alerts

未接続発生・復旧などのアラートを送信する。`level` が `error` または `critical` の場合、筐体の状態が `warning` に遷移し、管理画面にアラートメッセージが反映される。

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `alertType` | string | ○ | アラート種別（例 `device_disconnected`） |
| `deviceName` | string | - | デバイス名（例 `heart_sensor`） |
| `detail` | string | - | 詳細メッセージ |
| `level` | `'info' \| 'warning' \| 'error' \| 'critical'` | ○ | アラートレベル |
| `occurredAt` | string (ISO 8601) | ○ | 発生日時 |

**レスポンス**

```json
{ "alertId": "<uuid>" }
```

---

### 4.6 POST /api/device/analytics/daily

日次の利用回数を送信する。同一 `(筐体, 対象日)` は UPSERT（上書き）される。

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `targetDate` | string (ISO 8601 日付) | ○ | 対象日（例 `2026-04-06`） |
| `useCount` | integer | ○ | 利用回数（0以上） |

**レスポンス**

```json
{ "received": true }
```

---

### 4.7 POST /api/device/logs/upload-url

ローテーション済みログファイルをS3へ直接PUTするためのPresigned URLを取得する。

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `fileName` | string | ○ | ログファイル名。`A-Z a-z 0-9 . _ -` のみ許可 |
| `contentType` | string | ○ | `text/plain` または `application/gzip` |
| `fileSize` | number | ○ | ファイルサイズ(bytes)。環境変数 `MAX_LOG_SIZE_BYTES` 以下 |

**レスポンス**

```json
{
  "uploadUrl": "https://...",
  "objectKey": "logs/UNIT-A0B1C2D3/app-20260623.log",
  "expiresIn": 900
}
```

### 4.8 PUT uploadUrl

`upload-url` で取得したURLへログファイル本体をPUTする。APIサーバーはファイル本体を中継しない。

### 4.9 POST /api/device/logs/upload-complete

S3上のログファイル実体を検証し、DBへメタデータを保存する。同名ファイルの再送時は既存メタデータを更新する。

**リクエスト**

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `objectKey` | string | ○ | `upload-url` で返却されたS3キー |
| `fileName` | string | ○ | `upload-url` に指定したログファイル名 |
| `contentType` | string | ○ | 筐体が送信したMIME。保存時はS3実体のContent-Typeを優先 |
| `checksum` | string | - | クライアント側チェックサム |

**レスポンス**

```json
{
  "logFileId": "uuid",
  "receivedAt": "2026-06-23T10:00:00.000Z"
}
```

---

## 5. Enum / 定数一覧（筐体連携で使用）

| Enum | 値 | 使用箇所 |
| --- | --- | --- |
| 筐体ステータス | `normal`, `warning`, `stop`, `maintenance` | heartbeat `status` |
| アラートレベル | `info`, `warning`, `error`, `critical` | alerts `level` |
| ライセンス状態 | `valid`, `expired`, `suspended`, `unknown` | license-check 判定 |
| 配信区分 | `general`（一般＝全拠点）, `limited`（特別＝割当拠点のみ） | contents 配信ルール |
| 状態カテゴリ | `status1`, `status2`, `status3` | contents `statusCategory` |

---

## 6. 実装上の注意

- **動画ダウンロードは署名付きURLの直接GET**。本APIサーバーは動画バイトを中継しない。URLには有効期限があり、期限切れは 403 になるため、ダウンロード直前に `GET /api/device/contents` で取り直す運用が安全。
- **配信対象**は `uploadStatus = 'ready'` の動画のみ。アップロード中・未アップロードの動画は一覧に出ない。
- **一般／特別の出し分け**: 一般は全拠点、特別は割当拠点のみ（§4.3）。
- **更新検知**: `contentId` ごとの `version` 上昇／`checksum` 変化で再ダウンロード判定が可能。
- **ログはローテーション済みファイル単位で送信**。種別は `app-20260623.log` などファイル名で表現する。
- **日時はISO 8601**で送る。`sentAt`/`occurredAt` はタイムゾーン付き推奨。
- **device_token の保護**: 筐体ごとに一意の秘密情報。漏洩時は管理画面で筐体を削除/再発行する運用。
- **未定義プロパティ禁止**: DTOにないキーを本文に含めると 400。

---

## 7. 問い合わせ

仕様疑義・追加要望はサーバーサイド担当まで。
