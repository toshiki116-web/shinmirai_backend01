# sinmirai 筐体削除エラー修正（ダッシュボードのモック→実API差し替え・グループA）— CodeX向け指示書

作成: 2026-06-04 / 作成者: Claude（プラン・指示書担当） / 実装担当: CodeX
対象: フロント(Next.js `apps/web`) のみ ※バックエンド変更なし
関連バグ: BUG-001（筐体管理画面の削除ボタンで「筐体 ... が見つかりません」エラー）

---

## 0. バグ概要と確定方針

### 症状（ユーザー報告・2026-06-04）
筐体管理画面の一覧にある「削除」ボタンを押すと、確認ダイアログ内で
**「筐体 UNIT-D6A5E4F3 が見つかりません」** と表示され、削除できない。

### 根本原因（Claude調査・確定）
**一覧画面が「モックデータ」を描画しているのに、削除/編集ボタンだけ「実API」を叩いている**ため。

- 筐体一覧 [units/page.tsx:13,96](apps/web/src/app/(dashboard)/units/page.tsx#L96) は、ハードコードの `mockUnits` を `map` 描画している。
- `UNIT-D6A5E4F3`（渋谷4号機）は[モックデータ内の架空の値](apps/web/src/lib/mock-data.ts#L79)で、**実DBには存在しない**。
- 削除ボタンは実API [api.deleteUnit()](apps/web/src/lib/api-client.ts#L155) → `DELETE /admin/units/UNIT-D6A5E4F3` を呼ぶ。
- バックエンド [units.service.ts:114-129](apps/api/src/admin/units/units.service.ts#L114) は、実DBにそのIDが無いため **正しく** 404「筐体 UNIT-D6A5E4F3 が見つかりません」を返している。

➡ **バックエンドは正常。フロント側の「一覧がモックのまま」が原因。** 編集も同じ理由で失敗するはず。

### 確定方針（ユーザー合意済み・2026-06-04）
1. **本タスクのスコープ = グループA（実APIが既に存在する7画面）のフロント差し替えのみ**。バックエンド変更なし。
2. **グループB（アラート・分析）は別タスク**。これらは `GET /admin/alerts`・`GET /admin/analytics` 系のコントローラーが**未実装**のため、NestJS側の新規API設計が必要。本指示書では**触らない**。
3. **監視画面は「初回取得のみ」**（ページ表示時に1回 `getUnits`/`getSites`。定期ポーリングは行わない）。
4. **参照実装はユーザー管理画面** [users/page.tsx](apps/web/src/app/(dashboard)/users/page.tsx)。`useState`+`useEffect`+`useCallback` で fetch し、loading/error を扱う既存パターンを踏襲すること。

---

## 1. 対象スコープ（本タスクで修正する7画面 + 1ダイアログ）

| # | ファイル | 現状の問題 | 差し替え先API |
|---|---|---|---|
| 1 | `apps/web/src/app/(dashboard)/units/page.tsx` | `mockUnits` を一覧描画・統計集計 | `api.getUnits()` |
| 2 | `apps/web/src/app/(dashboard)/units/[unitId]/page.tsx` | `mockUnits.find` + `mockAlerts.filter` | `api.getUnit(unitId)`（`deviceAlerts` 同梱） |
| 3 | `apps/web/src/app/(dashboard)/sites/page.tsx` | `mockSites` を一覧描画・件数表示 | `api.getSites()` |
| 4 | `apps/web/src/app/(dashboard)/sites/[siteId]/page.tsx` | `mockSites.find` + `mockUnits.filter` | `api.getSite(siteId)`（`units` 同梱） |
| 5 | `apps/web/src/app/(dashboard)/contents/page.tsx` | `mockContents` を一覧描画・件数表示 | `api.getContents()` |
| 6 | `apps/web/src/app/(dashboard)/contents/[contentId]/page.tsx` | `mockContents.find` + `mockSites.slice` | `api.getContent(contentId)`（`assignedSites` 同梱） |
| 7 | `apps/web/src/app/(dashboard)/monitoring/page.tsx` | `mockUnits` + `mockSites` で集計 | `api.getUnits()` + `api.getSites()`（初回のみ） |
| 8 | `apps/web/src/components/dialogs/unit-dialog.tsx` | 所属拠点ドロップダウンが `mockSites` | `api.getSites()` |

**本タスクで触らない（グループB・別タスク）**:
`apps/web/src/app/(dashboard)/alerts/page.tsx`、`apps/web/src/app/(dashboard)/analytics/page.tsx`

> 注意: `mock-data.ts` の `mockUnits`/`mockSites`/`mockContents`/`mockAlerts`/`mockAnalytics` は**グループBがまだ参照するため削除しない**。今回は import を外すだけ。
> 一方、**`statusLabels` / `formatDate` / `formatDateTime` / `formatFileSize` / 各 `type`（Site/Unit/Content等）は純粋なユーティリティ/型なので、引き続き `mock-data.ts` から import してよい**（実データ化の対象は「モックの配列データ」のみ）。

---

## 2. 共通の実装パターン（必読）

[users/page.tsx](apps/web/src/app/(dashboard)/users/page.tsx) を手本に、各**一覧/監視画面**を次の形へ統一する:

```tsx
const [items, setItems] = useState<Unit[]>([])   // 画面に応じ Site[] / Content[]
const [total, setTotal] = useState(0)
const [isLoading, setIsLoading] = useState(false)
const [error, setError] = useState("")

const fetchItems = useCallback(async () => {
  setIsLoading(true)
  setError("")
  try {
    const data = await api.getUnits({ limit: 100 })   // 画面に応じ getSites/getContents
    setItems(data.items)
    setTotal(data.total)
  } catch (err) {
    setError(err instanceof ApiClientError ? err.message : "一覧の取得に失敗しました")
  } finally {
    setIsLoading(false)
  }
}, [])

useEffect(() => { void fetchItems() }, [fetchItems])
```

### 必須ルール
- **`window.location.reload()` を廃止し、mutation 成功時のコールバックを `fetchItems`（再取得）に差し替える**こと。
  - 例: `DeleteDialog` の `onSuccess={fetchItems}`、`UnitDialog` の `onSuccess={fetchItems}`。
- **統計カードの集計はモック配列ではなく取得した `items` を使う**（例: `items.filter(u => u.status === "normal").length`、件数表示は `total`）。
- **空配列/ローディング/エラーの表示**を users 画面と同様に用意する（一覧の `<TableBody>` 先頭で `isLoading ? "読み込み中..." : "データがありません"` 等）。
- **`ApiClientError` を `@/lib/api-client` から import** すること。
- **詳細画面（[unitId]/[siteId]/[contentId]）** は `useParams` でIDを取り、`useEffect` で単体取得 → 取得失敗時は既存の「○○が見つかりません」表示にフォールバック。読み込み中は `null` か簡易ローディングを返す。

---

## 3. 画面別の具体的手順と「フィールド差異」注意点

### 3-1. 筐体一覧 `units/page.tsx`（最優先・報告バグの本体）
- `mockUnits.map` → 取得した `units.map` に置換。`import { mockUnits }` を削除し `api`/`ApiClientError` を使用。
- 統計4カード（正常/警告/停止/保守中）と「全N筐体」は `units` / `total` ベースに。
- `DeleteDialog`/`UnitDialog` の `onSuccess` を `handleRefresh`(=`fetchItems`) に変更。
- **これ単体で報告バグ（削除エラー）が解消する。**

### 3-2. 筐体詳細 `units/[unitId]/page.tsx`
- `mockUnits.find(...)` → `api.getUnit(unitId)`。
- **アラート差異**: 現状は別配列 `mockAlerts.filter(...)` を使用。実APIでは `getUnit()` の戻り値に **`deviceAlerts`（直近10件・同梱）** が入る。
  → `const alerts = (unit.deviceAlerts ?? []).slice(0, 5)` に変更。`mockAlerts` import を削除。
  → アラート要素のフィールド（`id`/`alertType`/`detail`/`level`/`occurredAt`）は `DeviceAlert` モデルと一致するため描画ロジックは流用可。
- 編集/削除の `onSuccess` はそのまま（`reload`→詳細再取得 or 一覧へ遷移）。編集後は単体再取得が望ましい。

### 3-3. 拠点一覧 `sites/page.tsx`
- `mockSites` → `api.getSites()`。`unitCount` は**実APIが返す**（[sites.service.ts:46-49](apps/api/src/admin/sites/sites.service.ts#L46)）ためそのまま使用可。
- `onSuccess` を再取得へ。

### 3-4. 拠点詳細 `sites/[siteId]/page.tsx`
- `mockSites.find` → `api.getSite(siteId)`。
- **筐体一覧差異**: 現状 `mockUnits.filter(u => u.siteId === siteId)`。実APIでは `getSite()` の戻り値に **`units`（論理削除除外済み・同梱）** が入る（[sites.service.ts:57-66](apps/api/src/admin/sites/sites.service.ts#L57)）。
  → `const units = site.units ?? []` に変更。`mockUnits` import 削除。統計（総数/正常/要対応）も `units` ベースに。

### 3-5. コンテンツ一覧 `contents/page.tsx`
- `mockContents` → `api.getContents()`。`assignedSiteCount` は実APIが返す（[contents.service.ts:57](apps/api/src/admin/contents/contents.service.ts#L57)）。
- `onSuccess` を再取得へ。

### 3-6. コンテンツ詳細 `contents/[contentId]/page.tsx`
- `mockContents.find` → `api.getContent(contentId)`。
- **配信先拠点差異**: 現状 `mockSites.slice(0, assignedSiteCount)`（架空の簡略実装）。実APIでは `getContent()` の戻り値に **`assignedSites: [{ siteId, siteName }]`** が入る（[contents.service.ts:85](apps/api/src/admin/contents/contents.service.ts#L85)）。
  → 配信先テーブルは `content.assignedSites` を使う。`mockSites` import 削除。
  → 表示中に `status` を使っている箇所があれば、`assignedSites` には `status` が無い点に注意（`siteId`/`siteName` のみ）。status バッジ列は削除するか「-」表示にする。
- 「配信先を編集」ボタンのハンドラ未実装は**本タスクのスコープ外**（触らない。別途対応）。

### 3-7. 監視 `monitoring/page.tsx`（初回取得のみ）
- `mockUnits` → `api.getUnits({ limit: 100 })`、`mockSites` → `api.getSites({ limit: 100 })`。
- `useEffect` で**1回だけ**取得（`setInterval` は使わない）。
- 拠点グルーピング・オンライン/オフライン/警告集計は取得した配列ベースに置換。
- `timeSince()` 等のクライアント側ユーティリティはそのまま流用可。

### 3-8. 筐体ダイアログ `unit-dialog.tsx`
- 所属拠点ドロップダウンが `mockSites.map` になっている（[unit-dialog.tsx:151](apps/web/src/components/dialogs/unit-dialog.tsx#L151)）。
  → ダイアログを開いた時（`open===true`）に `api.getSites({ limit: 100 })` で実拠点を取得し、その配列で `<option>` を生成する。`mockSites` import 削除。
  → 取得失敗時はエラー表示（既存の `error` state を流用）。
- ※ `site-dialog.tsx` / `content-dialog.tsx` はモック依存なし（対応不要）。

---

## 4. 検証手順（再現テストの代替）

本バグはフロントのデータ結線不具合で、現状フロントの自動テスト基盤が無いため、**手動の再現/回帰確認手順**を必須とする（バックエンドの削除APIは既に正しく動作している）。

### 4-1. 再現確認（修正前）
1. 管理画面にログイン → 「筐体管理」へ。
2. 任意の筐体の「削除」→「削除する」。
3. **「筐体 ... が見つかりません」エラーが出る**ことを確認（＝モック表示の証拠）。

### 4-2. 修正後の確認（全7画面）
1. **筐体一覧**: 表示される筐体IDが**実DBの値**になっていること（モックの渋谷N号機ではない）。実在筐体の「削除」が成功し、一覧から消えること。「編集」も保存できること。
2. **筐体詳細**: 実在IDのページが開け、基本情報・ライセンス・通信状態・直近アラート（`deviceAlerts`）が表示されること。存在しないIDで「筐体が見つかりません」表示。
3. **拠点一覧/詳細**: 実拠点が表示され、`unitCount`・所属筐体一覧（`site.units`）が出ること。削除/編集が反映されること。
4. **コンテンツ一覧/詳細**: 実コンテンツが表示され、配信先拠点（`assignedSites`）が出ること。
5. **監視**: 実筐体のオンライン/オフライン/警告集計が表示されること（リロードで最新化）。
6. **筐体追加/編集ダイアログ**: 所属拠点プルダウンに**実拠点**が並ぶこと。新規作成 → 一覧に即反映されること。
7. 全画面でブラウザのネットワークタブに `GET /api/admin/*` が飛び、200で `items` が返ること。コンソールエラーが無いこと。

### 4-3. 回帰ガード（静的チェック・推奨）
修正後、グループAの対象7画面 + `unit-dialog.tsx` に `mock(Units|Sites|Contents|Alerts|Analytics)` の**import/参照が1件も残っていない**ことを grep で確認する:
```bash
grep -rnE "mock(Units|Sites|Contents)" \
  apps/web/src/app/\(dashboard\)/units \
  apps/web/src/app/\(dashboard\)/sites \
  apps/web/src/app/\(dashboard\)/contents \
  apps/web/src/app/\(dashboard\)/monitoring \
  apps/web/src/components/dialogs/unit-dialog.tsx
# → 0件であること（alerts/analytics は対象外なので除外）
```
- `pnpm --filter web build`（または `lint`）が通ること。

---

## 5. 完了報告に含めること（CodeX → Claude）

Claudeが実コードをレビューするため、報告には以下を明記すること:
1. 変更ファイル一覧（8ファイル想定）と、各ファイルの差し替え概要。
2. §4-3 の grep 結果（0件）と build/lint 結果。
3. §4-2 の手動確認の実施結果（どの画面まで動作確認したか）。スクショ可。
4. フィールド差異対応（`deviceAlerts`/`site.units`/`assignedSites`）を実際にどう反映したか。
5. スコープ外に触れていないこと（alerts/analytics/配信先編集ボタン/バックエンド/`mock-data.ts`本体は未変更）。

---

## 6. 厳守事項

- **バックエンド（`apps/api/`）・Prismaスキーマ・`mock-data.ts` 本体は変更しない**（今回はフロントの結線のみ）。
- 既存の保護ファイル（`Dockerfile`/`.github/workflows`/`.git/hooks`）に触れない。
- `mock-data.ts` の配列定義はグループBが参照中のため**残す**（import を外すだけ）。
- 不明点・仕様の食い違い（特に実APIレスポンス形状）が出たら、推測で握り潰さず報告すること。
- **BUGS.md への記録・コミット・本番反映は Claude が担当**するため、CodeX は実装と動作確認に専念してよい。
