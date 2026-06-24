# 筐体詳細画面に「ログファイル一覧＋ダウンロード」を追加 — CodeX向け指示書

> 対象: CodeX（実装担当・フロントエンド apps/web）
> 作成: 2026-06-23 / 作成者: Claude（プラン担当）
> レビュー: Claude（実装完了後にコードレビュー）
> 前提: バックエンドのログファイル化は本番反映済み（[[device-log-file-upload-plan]] / commit a376da4 / api=:7）

---

## 0. 目的と前提

筐体ログがS3ファイル方式に変わり、筐体詳細APIから旧 `deviceLogs`（行ログ配列）が無くなった。代わりにログファイルのメタ一覧／署名付きダウンロードURLのAPIが追加された。これを管理画面の筐体詳細に**ファイル一覧＋ダウンロード**として追加する。

### 重要な前提（調査済み）
- **現状フロントは旧 `deviceLogs` を表示していない**（[units/[unitId]/page.tsx](../../apps/web/src/app/(dashboard)/units/[unitId]/page.tsx) はアラートのみ表示）。→ **既存の破損は無い。純粋な機能追加**で、デプロイ順序の制約も無い（フロント単独で先行/後追いどちらでも可）。
- バックエンドAPIは本番稼働済み:
  - `GET /api/admin/units/:unitId/logs?page=&limit=` → `{ items: [{logFileId, fileName, fileSize, contentType, uploadedAt}], total, page, limit }`
  - `GET /api/admin/units/:unitId/logs/:logFileId/download-url` → `{ downloadUrl, expiresIn }`（署名付きGET URL・既定300秒で失効）

---

## 1. 実装タスク

### タスク1: APIクライアントにメソッド追加
[apps/web/src/lib/api-client.ts](../../apps/web/src/lib/api-client.ts) の既存 `getUnit` 付近に、同じ `request<T>()`／Bearer付与パターンで追加:
```ts
getUnitLogs: (unitId: string, params?: { page?: number; limit?: number }) =>
  request<{
    items: { logFileId: string; fileName: string; fileSize: number; contentType: string | null; uploadedAt: string }[];
    total: number; page: number; limit: number;
  }>(`/admin/units/${unitId}/logs?page=${params?.page ?? 1}&limit=${params?.limit ?? 20}`),

createUnitLogDownloadUrl: (unitId: string, logFileId: string) =>
  request<{ downloadUrl: string; expiresIn: number }>(
    `/admin/units/${unitId}/logs/${logFileId}/download-url`,
  ),
```
※ `any` は使わず上記の型を付ける（既存 `getUnit` は `any` だが踏襲しない）。

### タスク2: 筐体詳細画面に「ログファイル」セクション追加
[apps/web/src/app/(dashboard)/units/[unitId]/page.tsx](../../apps/web/src/app/(dashboard)/units/[unitId]/page.tsx) の「直近のアラート」Cardの下あたりに、ログファイル一覧の Card を追加。
- 表示は既存の shadcn/ui [Table](../../apps/web/src/components/ui/table.tsx)（[units/page.tsx](../../apps/web/src/app/(dashboard)/units/page.tsx) の使い方を参照）。
- 列: **ファイル名 / サイズ / アップロード日時 / 操作（ダウンロード）**。
- データ取得は `apiClient.getUnitLogs(unitId, { page, limit })`。`page` は `useState` で持ち、件数が `limit` を超える場合のみ簡易ページネーション（前へ/次へ）を出す（`total` から算出）。
- 0件時は「ログファイルがありません」のプレースホルダ表示。
- フォーマットは既存ユーティリティを再利用:
  - 日時: `formatDateTime(uploadedAt)`（[mock-data.ts](../../apps/web/src/lib/mock-data.ts)）
  - サイズ: `formatFileSize(String(fileSize))`（同上。**引数が `string | null` なので `String()` で渡す**）
  > 補足: これらは現状 `lib/mock-data.ts` にあるが、実データ用途なので `lib/utils.ts` 等への移設を検討してよい（任意・別PRでも可）。

### タスク3: ダウンロード処理
ダウンロードボタン押下で:
1. `apiClient.createUnitLogDownloadUrl(unitId, logFileId)` を呼ぶ
2. 返却 `downloadUrl`（S3署名付きGET）でブラウザダウンロードを発火（例: 一時 `<a href={downloadUrl} download>` を生成してクリック、または `window.location.assign`）
3. 押下中はボタンを `disabled`＋ローディング表示。失敗時はトースト等で通知（既存のエラー表示パターンに合わせる）。
- 署名URLは短命（既定300秒）なので、**事前一括取得せず押下時に都度発行**する（一覧表示時にURLを先読みしない）。

---

## 2. 留意点
- 認証は既存の Bearer 自動付与＋リフレッシュ機構に乗る（追加対応不要）。
- 閲覧APIは admin 認証のみ（ロール制限なし＝`findOne` と同様）。`master/editor/viewer` 全員が閲覧・DL可。要件が違えば指示を。
- レスポンス型変更（筐体詳細から `deviceLogs` が消えた件）でフロントが参照している箇所は**無い**ことを確認済みだが、念のため `deviceLogs` の文字列が apps/web に残っていないか全文検索すること。

## 3. 検証（完了報告前）
- `pnpm --filter @sinmirai/web build` がグリーン。
- ローカル or 本番(検証用筐体がログを上げた後)で、一覧表示・ページネーション・ダウンロードが動作。
- 0件時のプレースホルダ表示。
- `deviceLogs` 参照の残骸が無いこと。

## 4. 完了報告フォーマット
- 変更ファイル一覧
- 追加したAPIクライアントメソッド
- スクリーンショット（一覧・0件時・DL動作）
- 検証結果（buildと動作確認）

---

## 追記（2026-06-23 レビュー反映・確定）: ダウンロードは添付方式に修正

**背景**: 実装＆ライブ検証で、署名付きGET URLに `Content-Disposition` が無いため、ブラウザが `text/plain` を**インライン表示**してしまう（クロスオリジンのため front の `a.download` も無効）。ユーザー決定＝**バックエンドで `Content-Disposition: attachment` を付与**する方式。

### バックエンド修正（CodeX・必須）
1. [storage.service.ts](../../apps/api/src/storage/storage.service.ts) の `createLogDownloadUrl` を **`fileName` も受け取る**ように変更し、`GetObjectCommand` に付与:
   ```ts
   async createLogDownloadUrl(s3Key: string, fileName: string) {
     this.ensureLogBucketConfigured();
     const command = new GetObjectCommand({
       Bucket: this.logsBucket,
       Key: s3Key,
       ResponseContentDisposition: `attachment; filename="${fileName}"`,
     });
     // 以下は既存どおり getS3SignedUrl(...)
   }
   ```
   - ※ `fileName` は登録時に `^[A-Za-z0-9._-]+$` のホワイトリストを通っている（[[device-log-file-upload-plan]] §2-5(2)）ため、`"` やマルチバイト混入は無く、RFC5987 (`filename*`) エンコードは不要。素の `filename="..."` で安全。
2. [units.service.ts](../../apps/api/src/admin/units/units.service.ts) の `createLogDownloadUrl(unitId, logFileId)` で、取得した `logFile.fileName` を渡す:
   ```ts
   return this.storageService.createLogDownloadUrl(logFile.s3Key, logFile.fileName);
   ```
3. これは **API側変更＝再デプロイが必要**（タスク定義・env変更は無いので、新イメージpush＋稼働中リビジョンに `--force-new-deployment` でよい。リビジョンは必ず `describe-services` で確認してから）。

### フロント
- **追加修正は不要**。`Content-Disposition: attachment` により現状の `a.href = downloadUrl; a.click()` で正しくファイル名付きダウンロードされ、ページ遷移も起きない。

### 検証（再デプロイ後）
- download-url の署名URLに `response-content-disposition=attachment%3B...` が含まれること。
- 実機で「ダウンロード」押下 → ファイルがDLされ（インライン表示にならない）、画面が遷移しないこと。
