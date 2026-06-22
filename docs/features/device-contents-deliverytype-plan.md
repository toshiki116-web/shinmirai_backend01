# 指示書: 筐体配信API（GET /api/device/contents）に deliveryType を追加

作成日: 2026-06-22 / 担当実装: CodeX / 計画: Claude

## 背景・問題

筐体向け配信API `GET /api/device/contents` のレスポンス `items[]` に `deliveryType`
（`'general'` | `'limited'`）が含まれていない。配信ルールの出し分け（一般＝全拠点／特別＝
割当拠点のみ）には内部で使用しているが、筐体側へは返していないため、筐体アプリで
「一般／特別」を区別した表示・制御ができない。

ドキュメントのレスポンス例にも `deliveryType` が記載されていないため、**実装と仕様書の両方**を
揃える。

## 根本原因

`apps/api/src/device/device.service.ts` の `getContents()`:

- `where` の OR 条件では `deliveryType` を使用（修正不要）
- `select` に `deliveryType: true` が無い → DB から取得していない
- 返却 `items.map(...)` の戻りオブジェクトに `deliveryType` が無い

## 変更内容

### 1. API 実装 — `apps/api/src/device/device.service.ts`

`getContents()` の `select` に `deliveryType` を追加し、返却オブジェクトにも含める。

> 補足（型の堅牢化・任意）: 既存 import は `ContentThumbnailStatus, ContentUploadStatus`
> のみ（[device.service.ts:3](../../apps/api/src/device/device.service.ts#L3)）。shared に
> `DeliveryType`（`GENERAL='general'` / `LIMITED='limited'`、
> [enums.ts:79](../../packages/shared/src/constants/enums.ts#L79)）が既にあるため、`where` の
> OR 条件の文字列直書き（`'general'` / `'limited'`）を `DeliveryType.GENERAL` /
> `DeliveryType.LIMITED` に寄せると typo に強くなる。今回必須ではないが、同時に対応すると望ましい。

```ts
    const contents = await this.prisma.content.findMany({
      where,
      select: {
        contentId: true,
        contentName: true,
        statusCategory: true,
        deliveryType: true,        // ← 追加
        filePath: true,
        thumbnailPath: true,
        thumbnailStatus: true,
        version: true,
        checksum: true,
      },
    });

    return {
      items: contents.map((c) => ({
        contentId: c.contentId,
        contentName: c.contentName,
        statusCategory: c.statusCategory,
        deliveryType: c.deliveryType,   // ← 追加（'general' | 'limited'）
        downloadUrl: c.filePath ? this.storageService.signContentUrl(c.filePath) : null,
        thumbnailUrl:
          c.thumbnailPath && c.thumbnailStatus === ContentThumbnailStatus.READY
            ? this.storageService.signContentUrl(c.thumbnailPath)
            : null,
        version: c.version,
        checksum: c.checksum,
      })),
    };
```

- `deliveryType` は schema 上 `String @default("general")`（[prisma/schema.prisma:89](../../apps/api/prisma/schema.prisma#L89)）。
  値は `'general'` / `'limited'` のみ。NULL にはならない。
- 返却フィールドの並び順は `statusCategory` の直後に置く（仕様書例と一致させる）。

### 2. テスト — `apps/api/src/device/device.service.spec.ts`

既存テストの `findMany` モックデータに `deliveryType` を追加し、返却に含まれることを検証する。

- モックの各レコードに `deliveryType`（1件目 `'general'` / 2件目 `'limited'`）を追加
- 返却値のアサーション:
  ```ts
  expect(result.items[0].deliveryType).toBe('general');
  expect(result.items[1].deliveryType).toBe('limited');
  ```
- **`select` も検証する**（今回の根本原因＝select 漏れを直接防ぐ）:
  ```ts
  expect(prisma.content.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      select: expect.objectContaining({ deliveryType: true }),
    }),
  );
  ```

実行コマンド（この環境では PowerShell から `pnpm` が直接見つからない。`corepack` 経由を使う）:

```
corepack pnpm --dir apps/api test -- --runInBand device.service.spec.ts
```

### 3. ドキュメント整合（レスポンス例に追記）

以下2ファイルの §4.3 `GET /api/device/contents` のレスポンス JSON 例に
`"deliveryType": "general"` を `statusCategory` の直後へ追加する。

- `docs/device-api-specification.md`（§4.3、[L185 付近](../device-api-specification.md#L185)）
- `docs/api-specification.md`（§4.3「レスポンス 200」、[L759 付近](../api-specification.md#L759)）

あわせて、レスポンスのフィールド説明（注記）に1行追加:

> - `deliveryType` は配信区分。`'general'`（一般・全拠点配信）または `'limited'`
>   （特別・割当拠点のみ配信）。

### 4. 仕様書 docx の再生成

`docs/generate-api-spec-docx.js` は **CLI 引数で渡した Markdown を読み込んで docx 化するだけ**で、
レスポンス例をスクリプト内に内包していない（[generate-api-spec-docx.js:259-266](../generate-api-spec-docx.js#L259)）。
そのため**スクリプト本体の修正は不要**。§3 で Markdown 2ファイルを修正後、以下2本を再生成する。

```
node docs/generate-api-spec-docx.js docs/api-specification.md docs/新・ミライ人間洗濯機_API仕様書.docx
node docs/generate-api-spec-docx.js docs/device-api-specification.md docs/新・ミライ人間洗濯機_筐体連携API仕様書.docx
```

## 影響範囲・互換性

- **後方互換**: フィールド追加のみ。既存の筐体クライアントへの破壊的変更なし。
- DB マイグレーション不要（既存カラムを返すだけ）。
- 管理画面（web）側の変更は不要（本APIは筐体向け）。

## 対象外（今後の改善候補）

- `GET /api/device/contents` のレスポンス DTO は未定義で、Swagger は
  `@ApiResponse({ description })` のみ。今回は md/docx の更新で仕様を担保する。
  Swagger を正式な仕様の源泉として使う場合は、別タスクでレスポンス DTO を追加し
  `@ApiResponse({ type })` に寄せるのが望ましい。

## 完了条件（受け入れ基準）

- [ ] `GET /api/device/contents` の各 `items[]` に `deliveryType` が含まれる
- [ ] 値が `'general'` / `'limited'` で正しく返る（特別動画＝割当拠点で確認）
- [ ] `device.service.spec.ts` が green（返却値＋`select.deliveryType === true` を検証）
      `corepack pnpm --dir apps/api test -- --runInBand device.service.spec.ts`
- [ ] md 2ファイル・docx 2ファイルのレスポンス例が実装と一致
- [ ] 本番デプロイ後、実機で実レスポンスに `deliveryType` を確認
