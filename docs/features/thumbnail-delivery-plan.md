# サムネイル配信機能 実装指示書

> 対象: CodeX（実装担当）
> 作成: 2026-06-22 / 改訂: 2026-06-22（CodeXレビュー反映）
> 関連: [content-delivery-and-license-plan.md](./content-delivery-and-license-plan.md)（動画配信・ライセンス）

## 1. 目的

管理サイトで登録した動画に紐づく**サムネイル画像**を保持し、筐体向け
`GET /api/device/contents` のレスポンス各項目に `thumbnailUrl`（CloudFront署名付きURL）
を追加する。筐体側UIで動画一覧をサムネイル付きで表示できるようにする。

## 2. 全体方針（確定事項）

- **サムネイルの入手**: 「自動生成＋手動差し替え」の両対応。
  - 自動生成は **フロント（ブラウザ）でのフレームキャプチャ方式**を採用する。
    管理画面で選択した動画から `<video>` + `<canvas>` で先頭付近のフレームを取得し、
    JPEGに変換してデフォルトのサムネイルとする。
  - 管理者は任意の画像ファイル（JPEG/PNG/WebP）で差し替え可能。
  - **採用理由**: 現行アーキテクチャ（ブラウザ→S3直PUT）をそのまま流用でき、
    サーバー側 ffmpeg/Lambda などの新規基盤が不要。実装が軽く、AWS追加作業がほぼ発生しない。
- **保存先**: 動画と同一のS3バケット配下 `contents/{contentId}/thumbnails/{uuid}.{ext}`。
  既存のCloudFrontディストリビューション・OAC・キーグループ・APIタスクロールを
  そのまま流用する（**新規AWSインフラ不要**）。
- **配信方式**: 既存の `GET /api/device/contents` のレスポンスに `thumbnailUrl` を追加する
  （専用エンドポイントは新設しない）。署名URLは `StorageService.signContentUrl()` を再利用。
- **署名URLの付与範囲**（CodeXレビュー反映・重要）:
  | 対象 | 返すもの |
  |---|---|
  | 管理API 一覧 `GET /admin/contents`（findAll） | `thumbnailPath` / `thumbnailStatus` のみ（署名URLなし） |
  | 管理API 詳細 `GET /admin/contents/:id`（findOne） | 署名付き `thumbnailUrl`（ready時のみ、それ以外null） |
  | 筐体API `GET /api/device/contents` | 署名付き `thumbnailUrl`（ready時のみ、それ以外null） |
  - 一覧で署名しない理由: 毎回N件分のCloudFront署名を行うのは無駄なため。
  - 将来、管理画面の一覧グリッドでサムネイル表示UIを作る段階で、一覧にも署名URLを
    付与する（毎回全件署名を避けるなら `?withThumbnailUrl=true` のオプトインを検討）。
    **本タスクのスコープ外**だが忘れないよう記載。

## 3. 現状（実装前）

- `Content` モデルにサムネイル用カラムは存在しない（`apps/api/prisma/schema.prisma` 85-104行）。
- 管理画面・APIにサムネイルのアップロード機能は存在しない。
- 動画ファイルは `contents/{contentId}/{uuid}.{ext}` でS3に保存され、
  `filePath`（S3キー）・`uploadStatus`（none/uploading/ready/failed）で管理されている。
- 筐体向け `getContents`（`apps/api/src/device/device.service.ts` 82-128行）は
  `downloadUrl`（CloudFront署名付き）を返すが、サムネイルは未対応。
- **既存の負債（本タスクの前提知識）**:
  - `ContentUploadStatus` は `packages/shared/src/constants/enums.ts:52` に定義済みだが、
    API側コードはそれを **import せず**、`contents.service.ts:12` と `device.service.ts:6` で
    **ローカル定数を重複定義**している（`@sinmirai/shared` は依存宣言済みだが src で未使用）。
  - 動画の `completeUpload`（`contents.service.ts:213`）に、後述「7. 既存動画フローの穴」と
    同じ脆弱性が存在する。

## 4. 実装タスク（バックエンド先行 → フロント追従）

### タスク0: 共有Enumに ContentThumbnailStatus を追加（shared一元化）

`packages/shared/src/constants/enums.ts` に追加（既存 `ContentUploadStatus` と同形式）:

```ts
/** サムネイルのアップロード状態 */
export const ContentThumbnailStatus = {
  /** 未設定 */
  NONE: 'none',
  /** アップロード中 */
  UPLOADING: 'uploading',
  /** 表示可能 */
  READY: 'ready',
  /** アップロード失敗 */
  FAILED: 'failed',
} as const;
export type ContentThumbnailStatus =
  (typeof ContentThumbnailStatus)[keyof typeof ContentThumbnailStatus];
```

API側での利用方針（**ローカル定数の新規追加は避ける**）:

- **第一候補**: API（`contents.service.ts` / `device.service.ts`）で
  `import { ContentThumbnailStatus } from '@sinmirai/shared';` して使う。
  - ※ 現状API srcはsharedを一度もimportしていないため、NestビルドおよびJest(ts-jest)の
    パス解決（`@sinmirai/shared` → `packages/shared`）が通るか最初に確認すること。
    `apps/api/tsconfig.json` の paths / `jest` の moduleNameMapper を要点検。
  - 動作確認できたら、ついでに既存の重複 `ContentUploadStatus`（2ファイル）も
    sharedのimportへ寄せると負債解消になる（任意・余力があれば）。
- **退避策**: import解決が難航する場合に限り、API内ローカル定数のままとする。
  ただし**値は必ず shared と一致**させ、新たな文字列の分散を生まないこと。

### タスク1: Prismaスキーマにサムネイル列を追加

`apps/api/prisma/schema.prisma` の `Content` モデルに3カラム追加（動画側と対称の命名）:

```prisma
thumbnailPath     String? @map("thumbnail_path")        // S3オブジェクトキー（フルURL不可）
thumbnailMimeType String? @map("thumbnail_mime_type")   // image/jpeg 等
thumbnailStatus   String  @default("none") @map("thumbnail_status") // none/uploading/ready/failed
```

マイグレーション（**実行環境依存。DB起動状況で手順を分ける**）:

- DBに接続できる場合:
  ```bash
  cd apps/api
  docker compose up -d postgres   # 5433で起動（未起動なら）
  ./node_modules/.bin/prisma migrate dev --name add_content_thumbnail
  ```
- DBに接続できない場合は、schema.prisma変更とマイグレーションSQLの作成までを行う:
  ```bash
  ./node_modules/.bin/prisma migrate diff \
    --from-schema-datasource prisma/schema.prisma \
    --to-schema-datamodel prisma/schema.prisma \
    --script > prisma/migrations/manual_add_content_thumbnail.sql
  ```
  （DB接続可能になった環境で `migrate dev` を実行してコミットに含める）
- 既存レコードは `thumbnailStatus='none'` / `thumbnailPath=null` で問題なし。

### タスク2: StorageService にサムネイル用処理を追加

`apps/api/src/storage/storage.service.ts`

- コンストラクタに環境変数読み込みを追加:
  - `allowedImageMime`: env `ALLOWED_THUMBNAIL_MIME`（既定 `image/jpeg,image/png,image/webp`）を
    `Set<string>` 化。
  - `maxThumbnailSizeBytes`: env `MAX_THUMBNAIL_SIZE_BYTES`（既定 `5 * 1024 * 1024` = 5MB）。
- メソッド追加:
  ```ts
  async createThumbnailUploadUrl(params: {
    contentId: string;
    fileName: string;
    contentType: string;
    fileSize: number;
  }): Promise<UploadUrlResult> {
    this.ensureBucketConfigured();
    this.validateImageUpload(params.contentType, params.fileSize);
    const objectKey = this.createThumbnailObjectKey(
      params.contentId, params.fileName, params.contentType,
    );
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: params.contentType,
    });
    const uploadUrl = await getS3SignedUrl(this.s3, command, {
      expiresIn: this.uploadUrlExpiresIn,
    });
    return { uploadUrl, objectKey, expiresIn: this.uploadUrlExpiresIn };
  }

  validateImageUpload(contentType: string, fileSize: number) {
    if (!this.allowedImageMime.has(contentType)) {
      throw new BadRequestException('許可されていない画像形式です');
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      throw new BadRequestException('ファイルサイズが不正です');
    }
    if (fileSize > this.maxThumbnailSizeBytes) {
      throw new BadRequestException('サムネイルの最大サイズを超えています');
    }
  }

  // 拡張子は MIME を正とし、ファイル名拡張子は使わない（CodeXレビュー反映）
  private createThumbnailObjectKey(contentId: string, _fileName: string, contentType: string) {
    const ext = this.imageExtFromMime(contentType);
    return `contents/${contentId}/thumbnails/${randomUUID()}.${ext}`;
  }

  private imageExtFromMime(contentType: string) {
    switch (contentType) {
      case 'image/png': return 'png';
      case 'image/webp': return 'webp';
      case 'image/jpeg': return 'jpg';
      default:
        // validateImageUpload を通っていれば到達しないが防御的に
        throw new BadRequestException('許可されていない画像形式です');
    }
  }
  ```
  - **動画側 `getExtension()`（ファイル名拡張子優先）とは方針が異なる**点に注意。
    画像はMIMEを正とする（`foo.exe` 等のファイル名に引きずられないため）。
- `allowedImageMime` / `maxThumbnailSizeBytes` は完了時の再検証（タスク3）でも参照するため、
  値を返すgetter等で参照できるようにしておく（privateのままサービス内で `validateImageUpload`
  を完了処理から呼べる形でよい）。
- `signContentUrl()` はサムネイルにもそのまま再利用（同一ディストリビューション・同一鍵）。
  新規メソッドは不要。

### タスク3: 管理画面API（アップロード／削除）

`apps/api/src/admin/contents/contents.controller.ts` / `contents.service.ts`

- **コントローラ**（`@Roles('master', 'editor')`、`@ApiBearerAuth()` は既存）:
  - `POST /admin/contents/:contentId/thumbnail-url` → `createThumbnailUploadUrl(contentId, dto)`
  - `POST /admin/contents/:contentId/thumbnail-complete` → `completeThumbnailUpload(contentId, dto)`
  - `DELETE /admin/contents/:contentId/thumbnail` → `removeThumbnail(contentId)`（**必須**）
- **DTO**（`dto/` 配下、動画側の `create-upload-url.dto.ts` / `complete-upload.dto.ts` を踏襲）:
  - `CreateThumbnailUrlDto`: `fileName`, `contentType`, `fileSize`
  - `CompleteThumbnailUploadDto`: `objectKey`, `checksum?`
- **サービス**:
  ```ts
  async createThumbnailUploadUrl(contentId: string, dto: CreateThumbnailUrlDto) {
    await this.ensureExists(contentId);
    const result = await this.storageService.createThumbnailUploadUrl({
      contentId, fileName: dto.fileName, contentType: dto.contentType, fileSize: dto.fileSize,
    });
    await this.prisma.content.update({
      where: { contentId },
      data: {
        thumbnailPath: result.objectKey,
        thumbnailMimeType: dto.contentType,
        thumbnailStatus: ContentThumbnailStatus.UPLOADING,
      },
    });
    return result;
  }

  async completeThumbnailUpload(contentId: string, dto: CompleteThumbnailUploadDto) {
    const content = await this.ensureExists(contentId);

    // 穴1対策: objectKey が当該コンテンツのサムネイル領域に属することを必ず検証
    const expectedPrefix = `contents/${contentId}/thumbnails/`;
    if (!dto.objectKey.startsWith(expectedPrefix)) {
      throw new BadRequestException('サムネイルのファイルキーが不正です');
    }
    // presign で記録した thumbnailPath があれば一致も確認
    if (content.thumbnailPath && content.thumbnailPath !== dto.objectKey) {
      throw new BadRequestException('サムネイルのファイルキーが一致しません');
    }

    try {
      const head = await this.storageService.headObject(dto.objectKey);
      // 穴2対策: PUT された実体の MIME / サイズを完了時に再検証
      if (!head.contentType) {
        throw new BadRequestException('サムネイルのContent-Typeを確認できません');
      }
      this.storageService.validateImageUpload(head.contentType, Number(head.fileSize));

      const updated = await this.prisma.content.update({
        where: { contentId },
        data: {
          thumbnailPath: dto.objectKey,
          thumbnailMimeType: head.contentType,
          thumbnailStatus: ContentThumbnailStatus.READY,
        },
      });
      return this.serializeContent(updated);
    } catch (err) {
      await this.prisma.content.update({
        where: { contentId },
        data: { thumbnailStatus: ContentThumbnailStatus.FAILED },
      });
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('アップロード済みサムネイルを確認できません');
    }
  }

  async removeThumbnail(contentId: string) {
    await this.ensureExists(contentId);
    const updated = await this.prisma.content.update({
      where: { contentId },
      data: {
        thumbnailPath: null,
        thumbnailMimeType: null,
        thumbnailStatus: ContentThumbnailStatus.NONE,
      },
    });
    // S3オブジェクトの実削除は任意（オーファン許容）。実装するなら StorageService に
    // deleteObject を追加して旧キーを削除する。
    return this.serializeContent(updated);
  }
  ```
  - `head.fileSize` は `bigint`。`validateImageUpload` は `number` 引数のため `Number(...)` で
    変換する（5MB上限なので桁あふれの懸念なし）。
- **serializeContent の扱い（署名URLの付与範囲を明確化）**:
  - `serializeContent` は spread のため `thumbnailPath` / `thumbnailMimeType` /
    `thumbnailStatus` は一覧・詳細に**そのまま含まれる**（署名URLは付けない）。
  - **詳細 `findOne` のみ**、管理画面プレビュー用に署名付きURLを**追加で**付与する:
    ```ts
    thumbnailUrl:
      content.thumbnailPath && content.thumbnailStatus === ContentThumbnailStatus.READY
        ? this.storageService.signContentUrl(content.thumbnailPath)
        : null,
    ```
  - 一覧 `findAll` には `thumbnailUrl` を付けない（前述「署名URLの付与範囲」）。

### タスク4: 筐体向けAPI（本機能の中核）

`apps/api/src/device/device.service.ts` の `getContents`（82-128行）:

- `findMany` の `select` に `thumbnailPath: true, thumbnailStatus: true` を追加。
- `map` の返却オブジェクトに追加（筐体は実URLが必要なので**署名する**）:
  ```ts
  thumbnailUrl:
    c.thumbnailPath && c.thumbnailStatus === ContentThumbnailStatus.READY
      ? this.storageService.signContentUrl(c.thumbnailPath)
      : null,
  ```
- サムネイル未設定の項目は `thumbnailUrl: null` を返す（筐体側でプレースホルダ表示）。

### タスク5: フロント（管理画面アップロードUI）

`apps/web` のコンテンツ詳細アップロード画面:

- 動画選択時、**`URL.createObjectURL(file)` でローカルファイルを `<video>` に読み込む**こと
  （CORS越しのURLを `<video>` source にすると canvas が taint され `toBlob` が失敗するため。
  ローカル選択ファイル前提なら問題なし）。`loadeddata`/`seeked` で `<canvas>` に描画→
  `canvas.toBlob('image/jpeg')` でデフォルトサムネイルを生成しプレビュー表示。
  使い終わったら `URL.revokeObjectURL()` で解放。
- 「画像を選択」ボタンで任意のJPEG/PNG/WebPに差し替え可能にする。
- 「サムネイル削除」操作で `DELETE .../thumbnail` を呼び未設定に戻せるようにする。
- 保存フロー: `POST .../thumbnail-url` → 返却 `uploadUrl` へ `PUT`（`Content-Type` は
  presign時と一致させる）→ `POST .../thumbnail-complete`。
- `thumbnailStatus`（none/uploading/ready/failed）を表示。
- ステータス文字列は `@sinmirai/shared` の `ContentThumbnailStatus` を参照する。

### タスク6: 環境変数

本番env（Fargateタスク定義の環境変数）に追加:

```
ALLOWED_THUMBNAIL_MIME=image/jpeg,image/png,image/webp
MAX_THUMBNAIL_SIZE_BYTES=5242880
```

- ローカルは既定値で動作するため必須ではない。

### タスク7: テスト・ドキュメント更新

- 単体テスト:
  - `StorageService.validateImageUpload`（MIME・サイズ境界）、`imageExtFromMime`。
  - `completeThumbnailUpload` の prefix検証（不正キーで400）・完了時MIME再検証（非画像で400）。
  - `device.getContents` の `thumbnailUrl`（ready で署名URL、未設定で null の出し分け）。
- ドキュメント:
  - `docs/device-api-specification.md` のコンテンツ一覧レスポンス例に
    `thumbnailUrl`（string|null）を追記。
  - `docs/api-specification.md`（管理画面API）にサムネイルの3エンドポイント
    （thumbnail-url / thumbnail-complete / DELETE thumbnail）を追記。

## 5. AWS作業

- **原則として新規作業は不要**。サムネイルは動画と同一バケットの `contents/` プレフィックス配下に
  保存され、既存のCloudFront・OAC・キーグループ・タスクロール（`s3:PutObject` / `s3:HeadObject`
  / `s3:GetObject`）の範囲に収まる。
- S3 CORS は動画アップロード用のPUT許可（Origins: 本番ドメイン / localhost:3000）が
  サムネイルのPUTにもそのまま適用される。追加設定は不要。
- `removeThumbnail` でS3実削除まで行う場合のみ、タスクロールに `s3:DeleteObject` を追加。

## 6. 文字コード方針（mojibakeについて）

- **新規追加するファイル・文字列は必ずUTF-8**で統一する。
- ただし**既存ファイルの一括文字コード整形は本タスクのスコープ外**とする。
  実際にコード内に破損文字列が見つかった場合は、その箇所を特定して別タスクで対応する
  （誤検知のまま既存コードを触ると差分ノイズ・事故リスクが増えるため）。
  ※ 参考: 確認済みのAPIソース（contents.controller.ts / contents.service.ts /
  device.service.ts）の日本語・Swagger文言は正常なUTF-8であり、git status上の
  ファイル名エスケープ表示は文字化けではない。

## 7. 既存動画フローの穴（別タスクで追従）

サムネイルに施す「prefix検証」「完了時のMIME/サイズ再検証」と**同じ穴が、既存の動画
`completeUpload`（`apps/api/src/admin/contents/contents.service.ts:213`）にも存在する**:

- **穴1**: `content.filePath` が null の場合、キー所属チェックがスキップされ、
  `contents/{contentId}/` 以外の任意 `objectKey` を受理し得る。
- **穴2**: `headObject` の `ContentType` / `ContentLength` を検証せず保存し、
  動画以外のファイルを `ready` にできる。

いずれも `master/editor` 認証必須の経路であり、脅威は「権限保有者の誤操作・トークン漏洩・
実装バグ」（多層防御の位置づけ）。

- **本タスクの方針**: 新規サムネイルフローには上記対策を実装する。
  **動画側 `completeUpload` の同等修正は本タスクに含めず、別タスクで追従**する
  （本番稼働中の処理のため、独立したテスト・レビュー・デプロイが望ましい）。

## 8. 既知の落とし穴

- **Content-Type 整合性**: presign時の `ContentType` と実PUTの `Content-Type` を一致させる
  （不一致だとSignatureMismatch）。動画アップロードと同じ注意点。
- **キャッシュ**: 差し替え時は新UUIDキーになるためCloudFrontキャッシュ無効化は不要。
- **オーファン**: 差し替え・削除後の旧サムネイルS3オブジェクトは残存し得る。
  気になる場合は `DeleteObject` を実装（任意）。
- **null許容**: 筐体・管理画面とも `thumbnailUrl=null` を前提としたUIにする。
- **filePath/thumbnailPath はS3キー**: フルURLを保存しない（既存方針）。

## 9. スコープ外（別タスク候補）

- 動画側 `completeUpload` のセキュリティ修正（本書「7」）。
- 管理画面 一覧グリッドでのサムネイル表示と、一覧APIへの署名URL付与（本書「2」）。
- サーバー側 ffmpeg / Lambda による真のサーバーサイド自動生成。
- サムネイルの複数サイズ（サムネ/大）生成。
