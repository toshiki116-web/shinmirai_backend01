# CodeX向け指示書: コンテンツ詳細画面から配信対象拠点を編集できるようにする（案A）

- **作成日**: 2026-06-22
- **作成**: Claude（プラン・指示書担当）
- **実装**: CodeX
- **対象**: `apps/web`（Next.js）＋ `apps/api`（NestJS・軽微）
- **本番環境**: 大阪（ap-northeast-3）・自前ALB+Fargate

---

## 0. 背景と根本原因（必読）

### ユーザー報告
- コンテンツ詳細画面（例: `https://fhwm.jp/contents/CNT-00004`）で **配信対象拠点の設定/編集ができない**。

### 真因（フロントの配線漏れ）
1. **主因**: 詳細画面の「配信先を編集」ボタンに **`onClick` ハンドラが無い**。
   - [`apps/web/src/app/(dashboard)/contents/[contentId]/page.tsx`](../../apps/web/src/app/(dashboard)/contents/[contentId]/page.tsx) の 395-399行目:
     ```tsx
     {canEdit && (
       <Button variant="outline" size="sm">   {/* ← onClick が無く、押しても何も起きない */}
         配信先を編集
       </Button>
     )}
     ```
2. **副因**: ヘッダーの「編集」ボタンから `ContentDialog` を開いても、拠点選択UIは **「限定配信」のときしか表示されず**（[`content-dialog.tsx`](../../apps/web/src/components/dialogs/content-dialog.tsx) 161行目）、送信時も **「一般配信」だと `siteIds: []` 固定で送られる**（同 74行目）。よって一般配信コンテンツには拠点を割り当てられない。

### 既に実装済み（修正不要）
- バックエンドAPI: `POST /api/admin/contents/:contentId/assign`（[`contents.controller.ts`](../../apps/api/src/admin/contents/contents.controller.ts) 114-121行・`@Roles('master','editor')`）
- Service: `assignSites`（[`contents.service.ts`](../../apps/api/src/admin/contents/contents.service.ts) 176-189行・トランザクションで全置換）
- APIクライアント: `api.assignSites(contentId, siteIds)`（[`api-client.ts`](../../apps/web/src/lib/api-client.ts) 272-273行）
- 詳細取得で `assignedSites` を返却済み（`findOne`）
- Prisma `ContentSiteAssignment`（多対多中間テーブル）

→ **配信区分に依存しない「配信先専用ダイアログ」を新設して既存 `assignSites` API に繋ぐ**のが本指示書（案A）の方針。

---

## 1. 設計方針（案A）

- 配信区分（一般/限定）に **依存しない** 配信先専用の編集ダイアログ `SiteAssignmentDialog` を新設する。
- 詳細画面の「配信先を編集」ボタンの `onClick` でこのダイアログを開く。
- 保存時に `api.assignSites(contentId, selectedSiteIds)` を呼び、成功したら詳細を再取得（`fetchContent`）してダイアログを閉じる。
- 初期選択状態は、現在の `content.assignedSites` から復元する。
- **「全拠点解除（空選択で保存）」を許可する**。現状の `AssignSitesDto` は `@ArrayNotEmpty` で空配列を弾くため、これを緩和する（後述 3章）。

> **責務分離（重要）**: 配信先の更新は **今後この専用ダイアログに一本化** する。`ContentDialog`（コンテンツ名・言語・配信区分等の編集）からは **編集時の拠点更新責務を外す**（後述 2-3）。これをやらないと、一般配信コンテンツに本ダイアログで割り当てた拠点が、その後の `ContentDialog` でのメタ情報編集で全消去される（[`content-dialog.tsx` 74行](../../apps/web/src/components/dialogs/content-dialog.tsx) が一般配信時に `siteIds: []` を送るため）。

---

## 2. フロントエンド実装（apps/web）

### 2-1. 新規ダイアログ `SiteAssignmentDialog` を作成

新規ファイル: `apps/web/src/components/dialogs/site-assignment-dialog.tsx`

既存 [`content-dialog.tsx`](../../apps/web/src/components/dialogs/content-dialog.tsx) の拠点選択UI（161-183行のチェックボックス群）と `toggleSite`、`api.getSites` 取得処理（43-57行）を踏襲して実装する。要件:

- **Props**:
  ```tsx
  interface SiteAssignmentDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    contentId: string
    assignedSites: { siteId: string; siteName: string }[]  // 現在の割り当て（初期選択用）
    onSuccess: () => void                                   // 成功時に詳細再取得
  }
  ```
- **挙動**:
  - `open` が true になったら拠点を **全件取得**（下記 ★ 参照）し、`selectedSiteIds` を `assignedSites.map(s => s.siteId)` で初期化する。`error` もリセット。
  - チェックボックスで `selectedSiteIds` をトグル（`content-dialog.tsx` の `toggleSite` と同じ）。
  - 「保存」押下で `api.assignSites(contentId, selectedSiteIds)` を呼ぶ。**空選択でもそのまま送信可（全解除）**。
  - 成功 → `onOpenChange(false)` ＋ `onSuccess()`。
  - 失敗 → `ApiClientError` のメッセージ（無ければ「配信先の更新に失敗しました」）を `error` 表示。
- **配信区分の条件分岐は入れない**（一般/限定どちらのコンテンツでも常に拠点選択を表示する）。これが副因の解消にあたる。

- **★ 拠点の全件取得（100件上限対策）**:
  - `api.getSites({ limit: 100 })` は最大100件まで（API側 `PaginationDto` が `@Max(100)`、[`pagination.dto.ts` 19行](../../apps/api/src/common/dto/pagination.dto.ts)）。拠点が100件を超えると101件目以降を選べないため、**`total` を見てページングで全件取得する**。`sites.findAll` は `{ items, total }` を返す（[`sites.service.ts` 46-51行](../../apps/api/src/admin/sites/sites.service.ts)）。
    ```tsx
    async function fetchAllSites() {
      const first = await api.getSites({ page: 1, limit: 100 })
      const acc = [...first.items]
      const totalPages = Math.ceil(first.total / 100)
      for (let p = 2; p <= totalPages; p++) {
        const next = await api.getSites({ page: p, limit: 100 })
        acc.push(...next.items)
      }
      return acc
    }
    ```
  - 将来的に拠点数が大きくなる場合は「検索つき選択」や候補APIを別途検討（本指示書の対象外・TODOコメントで残す）。

- **状態の分離（UX）**: 「拠点一覧の取得中（`isFetching`）」「送信中（`isSubmitting`）」「取得結果0件」を **別表示** にする。
  - 取得中: スピナー/「拠点を読み込み中…」。
  - 0件（取得完了かつ `sites.length === 0`）: 「拠点がありません」。
  - 送信中: 保存ボタンを `disabled`。取得中も保存ボタンを `disabled`。
  - ※ 取得中と0件が同じ表示にならないようにすること（取得中＝ロード表示、0件＝空表示）。

UIの骨子（既存 `Dialog`/`Button`/`Label` コンポーネントを利用）:
```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="sm:max-w-[480px]">
    <DialogHeader>
      <DialogTitle>配信先拠点を編集</DialogTitle>
      <DialogDescription>{contentId} の配信対象拠点を設定します</DialogDescription>
    </DialogHeader>
    {/* error表示 → 拠点チェックボックス一覧（content-dialog.tsx 164-181行を流用）→ フッターボタン */}
  </DialogContent>
</Dialog>
```

### 2-2. 詳細画面でダイアログを配線

[`apps/web/src/app/(dashboard)/contents/[contentId]/page.tsx`](../../apps/web/src/app/(dashboard)/contents/[contentId]/page.tsx):

1. import 追加:
   ```tsx
   import { SiteAssignmentDialog } from "@/components/dialogs/site-assignment-dialog"
   ```
2. state 追加（31行目 `editOpen` の近く）:
   ```tsx
   const [siteEditOpen, setSiteEditOpen] = useState(false)
   ```
3. 「配信先を編集」ボタンに `onClick` を付与（395-399行目）:
   ```tsx
   {canEdit && (
     <Button variant="outline" size="sm" onClick={() => setSiteEditOpen(true)}>
       配信先を編集
     </Button>
   )}
   ```
4. ダイアログを描画（427-444行目の `canEdit && (<> ... </>)` ブロック内、`ContentDialog` の隣）:
   ```tsx
   <SiteAssignmentDialog
     open={siteEditOpen}
     onOpenChange={setSiteEditOpen}
     contentId={content.contentId}
     assignedSites={assignedSites}
     onSuccess={fetchContent}
   />
   ```
   - `assignedSites` は当該ファイルで既に算出済みの変数を利用（393行で `assignedSites.length` を使用しているもの）。
   - `fetchContent` は既存の詳細再取得関数（`ContentDialog` の `onSuccess` でも使われている）。

### 2-3. `ContentDialog` の編集送信から `siteIds` を外す（デグレ防止・重要）

配信先の更新責務を専用ダイアログへ一本化するため、[`content-dialog.tsx`](../../apps/web/src/components/dialogs/content-dialog.tsx) を次のように修正する。

- **編集時（`isEdit === true`）は `siteIds` を送らない**。`handleSubmit`（59-88行）の送信データを修正:
  ```tsx
  const data: Record<string, unknown> = {
    contentName,
    language,
    deliveryType,
    statusCategory,
  }
  // 新規作成時のみ拠点を含める。編集時の拠点更新は SiteAssignmentDialog に一本化（デグレ防止）
  if (!isEdit) {
    data.siteIds = deliveryType === "limited" ? selectedSiteIds : []
  }
  ```
  - これにより、一般配信コンテンツに専用ダイアログで割り当てた拠点が、メタ情報編集（名前/カテゴリ等）で全消去される事故を防ぐ（`UpdateContentDto` の `siteIds` は optional なので、未送信なら拠点は触らない＝[`contents.service.ts` 131行](../../apps/api/src/admin/contents/contents.service.ts) の `if (dto.siteIds !== undefined)` を通らない）。
- **編集時は拠点選択UIも非表示にする**（操作しても保存に反映されず混乱を招くため）。161行の表示条件を `{!isEdit && deliveryType === "limited" && ( ... )}` に変更する。
  - 新規作成時のみ「限定配信」で拠点選択を表示（従来どおり）。
  - 編集時に拠点を変えたい場合は詳細画面の「配信先を編集」へ誘導（必要なら説明文を1行添える）。
- 新規作成時の空チェックバリデーション（62-65行）は **`!isEdit` のときのみ** 効くようにする（編集時は `selectedSiteIds` を見ない）。

> 補足: 新規作成フローはこれまでどおり `ContentDialog` 内で拠点設定可能。変えるのは「編集フロー」だけ。

---

## 3. バックエンド実装（apps/api・軽微）

### 3-1. 「全拠点解除」を許可する（空配列を受け付ける）

[`apps/api/src/admin/contents/dto/assign-sites.dto.ts`](../../apps/api/src/admin/contents/dto/assign-sites.dto.ts) の `@ArrayNotEmpty` を **削除**し、空配列を許可する。

```ts
import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class AssignSitesDto {
  @ApiProperty({
    description: '配信対象拠点IDリスト（既存の割り当てを全置換。空配列で全解除）',
    type: [String],
    example: ['LOC-0001', 'LOC-0002'],
  })
  @IsArray()
  @ArrayUnique({ message: '拠点IDが重複しています' }) // 重複IDで中間テーブルの複合PK制約に当たるのを防ぐ
  @IsString({ each: true })
  siteIds!: string[];
}
```

- `@ArrayNotEmpty` を削除し、空配列を許可（全解除のため）。
- `@ArrayUnique` を追加し、重複 `siteId` を弾く。`ContentSiteAssignment` は `@@id([contentId, siteId])` の複合PKなので、重複があると `createMany` がユニーク制約違反になる（`skipDuplicates` を使わない方針のため明示ガードする）。

### 3-2. `assignSites` Service に空配列ガードを追加（堅牢化）

[`contents.service.ts` 176-189行](../../apps/api/src/admin/contents/contents.service.ts) の `assignSites` は、現状 **無条件で `createMany` を呼ぶ**（181行）。`update`（同ファイル 134-141行）には空配列ガードがあるのに `assignSites` には無く、挙動が非対称。`update` に揃えて空配列時は `createMany` をスキップする:

```ts
async assignSites(contentId: string, dto: AssignSitesDto) {
  await this.ensureExists(contentId);

  await this.prisma.$transaction(async (tx) => {
    await tx.contentSiteAssignment.deleteMany({ where: { contentId } });
    if (dto.siteIds.length > 0) {
      await tx.contentSiteAssignment.createMany({
        data: dto.siteIds.map((siteId) => ({ contentId, siteId })),
      });
    }
  });

  this.logger.log(`コンテンツ ${contentId} の配信対象拠点を更新: ${dto.siteIds.join(', ')}`);

  return { contentId, assignedSiteIds: dto.siteIds };
}
```

- 空配列での `createMany` は現状の Prisma では実害なく通るが、バージョン差・将来変更に対して `update` と同じガード形にしておく方が堅い。

> ⚠️ 仕様確認: 「全拠点解除」を **UI/業務的に許可してよいか** はユーザー確認済み（案A採用時の前提）。もし「最低1拠点必須」にしたい場合は、この3-1をスキップし、フロント側で空選択時に保存ボタンを `disabled` ＋ 注意文表示にする方針へ切り替えること（実装前に要相談）。

---

## 4. 動作確認（受け入れ条件）

1. **一般配信**のコンテンツ（CNT-00004）詳細で「配信先を編集」を押す → ダイアログが開き、拠点一覧が表示される。
2. 拠点を選択して保存 → 一覧の「配信対象拠点（N拠点）」が更新され、`assignedSites` が反映される。
3. **限定配信**のコンテンツでも同様に編集できる。
4. 既存の割り当てがある状態で開くと、現在の拠点に **チェックが入った状態**で表示される。
5. 全チェックを外して保存 → 「配信先拠点が設定されていません」になる（全解除が成功する）。
6. **デグレ確認（重要）**: 一般配信コンテンツに専用ダイアログで拠点を割り当てた後、ヘッダー「編集」から名前/カテゴリだけ変更して保存 → **拠点割当が維持されている**（消えない）。
7. 拠点が101件以上ある場合でも、専用ダイアログに全拠点が表示され選択できる（ページング取得）。
8. ダイアログを開いた直後は「読み込み中」表示になり、取得完了後に拠点一覧 or 「拠点がありません」が出る（取得中と0件が区別される）。
9. `editor` / `master` ロールで操作可。閲覧専用ロール（`canEdit === false`）では「配信先を編集」ボタン自体が出ない（既存挙動）。
10. JWT失効中に保存した場合は既存のリフレッシュ機構が働く（BUG-003対応済み）。

---

## 5. デプロイ順序の注意

- フロント（web）とAPIの両方を変更する。空配列許可（3-1）は **API先行 or 同時** が安全（フロントが空配列を送ったときにAPIが弾かないように）。
  - ただし通常運用で空配列を送るのは「全解除」操作時のみなので、web を先にデプロイしても全解除しない限り問題は出ない。基本は **API → web の順**、もしくは同時リリースを推奨。
- 既存の `@Roles`・JWT・リフレッシュ機構には影響しない。

---

## 6. 変更ファイル一覧

| 区分 | ファイル | 変更内容 |
|---|---|---|
| 新規 | `apps/web/src/components/dialogs/site-assignment-dialog.tsx` | 配信先専用ダイアログ（全件取得・取得中/送信中の状態分離） |
| 変更 | `apps/web/src/app/(dashboard)/contents/[contentId]/page.tsx` | ボタン配線・state・ダイアログ描画 |
| 変更 | `apps/web/src/components/dialogs/content-dialog.tsx` | **編集時は `siteIds` を送らない＋拠点UI非表示**（デグレ防止・2-3） |
| 変更 | `apps/api/src/admin/contents/dto/assign-sites.dto.ts` | `@ArrayNotEmpty` 削除＋`@ArrayUnique` 追加 |
| 変更 | `apps/api/src/admin/contents/contents.service.ts` | `assignSites` に空配列ガード追加（3-2） |
