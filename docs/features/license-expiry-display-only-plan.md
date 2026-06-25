# ライセンス期限切れを「表示のみ」で反映する修正（BUG-008）

## 背景・症状
- ライセンス編集画面（筐体詳細 `/units/UNIT-XXXX`）で、有効期限を過ぎてもステータスが「有効」のまま表示され、「期限切れ」に変わらない。
- 期待挙動: 有効期限を過ぎたら管理サイト上で自動的に「期限切れ」と表示される。
- **重要な要件**: 期限切れになっても**ライセンスを自動的に停止しない**。管理サイト上で「期限切れ」と表示するのみにとどめる。実際の停止（配信停止）は、管理者が手動で「停止」または「期限切れ」を選択したときだけ行う。

## 根本原因
ライセンスのステータスは DB 保存値 `licenseStatus`（`valid`/`expired`/`suspended`/`unknown`）を**そのまま描画しているだけ**で、有効期限 `licenseExpiredAt` との突き合わせを一切していない。「期限が来たら期限切れ表示に変える」ロジックがフロント・APIのどこにも存在しない。

加えて、筐体向けライセンス確認API（`device.service.ts#checkLicense`）は**現状、期限を過ぎた `valid` ライセンスを `licenseValid: false`（＝配信停止）として返している**。これは「自動停止しない」要件と矛盾するため、本修正で自動停止を解除する（ユーザー判断確定済み）。

## 方針
1. **管理サイトの表示**: DB値は書き換えず、表示時に「`valid` かつ 期限超過 → 期限切れ」と**導出**して表示する（＝表示のみ。自動でのDB更新・副作用なし）。
2. **筐体側の自動停止解除**: `checkLicense` の `licenseValid` 判定から有効期限の比較を外し、`licenseStatus === 'valid'` のみで判定する。期限超過だけでは停止せず、管理者が手動で `suspended`/`expired` にしたときだけ停止する。

---

## 変更内容

### 1. フロント: 表示用の実効ステータス導出ヘルパーを追加
**ファイル**: `apps/web/src/lib/mock-data.ts`（`statusLabels`・`formatDate` と同じ場所に追加）

```ts
/**
 * ライセンス表示用の実効ステータスを導出する。
 * 保存値が valid でも有効期限を過ぎていれば「期限切れ(expired)」として表示する。
 * ※ DBは書き換えない（表示のみ）。停止は管理者が手動で suspended/expired を選んだ場合のみ。
 */
export function getEffectiveLicenseStatus(
  licenseStatus: Unit["licenseStatus"],
  licenseExpiredAt: string | null,
): Unit["licenseStatus"] {
  if (
    licenseStatus === "valid" &&
    licenseExpiredAt &&
    new Date(licenseExpiredAt) < new Date()
  ) {
    return "expired"
  }
  return licenseStatus
}
```
- 比較は「保存された期限の瞬間 < 現在時刻」。筐体側の従来ロジック（`licenseExpiredAt > new Date()`）と境界の解釈を揃える（期限日 `T00:00:00Z` を過ぎたら期限切れ）。
- 引数・戻り値は `string` ではなく `Unit["licenseStatus"]`（`"valid" | "expired" | "suspended" | "unknown"`）で型を絞る。`statusLabels` 参照時の typo や将来のステータス追加に強くするため（レビュー指摘P3）。`Unit` は同 `mock-data.ts` で定義済み。

### 2. フロント: 読み取り専用バッジを実効ステータスに差し替え（3か所）
いずれも**読み取り専用の「ステータス」バッジ**のみ差し替える。`statusLabels[...]` のキーを `getEffectiveLicenseStatus(...)` の戻り値にする。

- `apps/web/src/app/(dashboard)/units/[unitId]/page.tsx`（筐体詳細, 229-231行付近）
- `apps/web/src/app/(dashboard)/units/page.tsx`（筐体一覧, 172-173行付近）
- `apps/web/src/app/(dashboard)/sites/[siteId]/page.tsx`（拠点詳細, 218-219行付近）

例（筐体詳細）:
```tsx
// before
<Badge variant={statusLabels[unit.licenseStatus]?.variant ?? "secondary"}>
  {statusLabels[unit.licenseStatus]?.label ?? unit.licenseStatus}
</Badge>
// after
{(() => {
  const eff = getEffectiveLicenseStatus(unit.licenseStatus, unit.licenseExpiredAt)
  return (
    <Badge variant={statusLabels[eff]?.variant ?? "secondary"}>
      {statusLabels[eff]?.label ?? eff}
    </Badge>
  )
})()}
```
（各ファイルで `getEffectiveLicenseStatus` を `@/lib/mock-data` から import 追加。）

> **注記（P3: 画面開きっぱなし時の挙動）**: この導出は画面の**再描画・再取得時**に評価される。各ページは初回 fetch のみ（`units/page.tsx:45`・`units/[unitId]/page.tsx:71`・`sites/[siteId]/page.tsx:55`）のため、画面を開いたまま期限時刻を跨いでも**その場では即座に切り替わらない**（再読込・他ページ遷移・再取得で反映）。要件は「表示のみ」で、運用上この遅延は許容範囲のため、**自動切替のためのタイマー/ポーリングは入れない**（実装コスト・再描画負荷に見合わない）。許容できない場合のみ別タスクで `setInterval` 再評価を検討する。

### 3. フロント: 編集用 `<select>` は変更しない（重要）
`units/[unitId]/page.tsx` の編集 `<select value={licenseStatus}>`（242行付近）は**保存値そのもの**を表示し続ける。
- 理由: 管理者が編集するのは「DBに保存された実際のステータス」。読み取りバッジ（実効表示）と編集セレクト（保存値）が食い違うのは意図通り。例: 保存値 `valid`＋期限超過 → バッジは「期限切れ」、セレクトは「有効」。
- このズレが分かりにくい場合のUX改善（注記表示など）は本修正の対象外（必要なら別タスク）。

### 4. バックエンド: 筐体側の自動停止を解除
**ファイル**: `apps/api/src/device/device.service.ts`（`checkLicense`, 120-122行付近）

```ts
// before
const isValid =
  device.licenseStatus === 'valid' &&
  (!device.licenseExpiredAt || device.licenseExpiredAt > new Date());
// after
// 有効期限の超過だけでは停止しない（表示のみ）。停止は管理者が手動で
// licenseStatus を valid 以外（suspended/expired）に設定したときのみ。
const isValid = device.licenseStatus === 'valid';
```
- `expiredAt` は従来どおりレスポンスに含める（情報提供のため）。
- これにより `valid`＋期限超過 → `licenseValid: true`（筐体は継続稼働）。管理者が `suspended`/`expired` に変更 → `licenseValid: false`（停止）。

---

## テスト（バグ修正ガイド準拠：再現テストを先に書く）

### API: `apps/api/src/device/device.service.spec.ts` に追加
新規 `describe('DeviceService checkLicense (BUG-008)')`:
- **再現テスト**: `valid` ＋ `licenseExpiredAt` が過去 → `licenseValid === true`
  （修正前は旧ロジックで `false` になり失敗。修正後 pass）
- `valid` ＋ 期限が未来 → `true`
- `valid` ＋ `licenseExpiredAt: null` → `true`
- `suspended` → `false`（手動停止が効くこと）
- `expired`（手動設定）→ `false`（手動停止が効くこと）

`checkLicense` は Prisma を呼ばないので、`device` オブジェクトを渡すだけでよい（`new DeviceService({} as any, {} as any)`）。

実行: `cd apps/api && pnpm test`（修正前に再現テストが fail することを確認 → 修正 → 全 pass）。

### フロント
自動テスト基盤が無いため手動確認で代替。
- **再現（修正前）**: 期限切れ日（例 `2026/05/05`）かつ保存値 `valid` の筐体詳細でステータスが「有効」表示。
- **修正後**:
  - 筐体一覧・筐体詳細・拠点詳細のステータスバッジが「期限切れ」表示になる。
  - 編集セレクトは「有効」のまま（保存値を表示）。
  - 期限が未来の `valid` は「有効」のまま。`suspended`/`expired` は従来どおり。
  - 筐体API `GET /api/device/license-check`（要 device_token。ルートは `device.controller.ts` の `@Get('license-check')`）で、期限超過の `valid` が `licenseValid: true` を返す（手動 `suspended`/`expired` で `false`）。
- （任意）`getEffectiveLicenseStatus` は純関数なので、apps/web に jest があれば単体テストを追加してよい。

---

## ドキュメント整合性の更新（P2: 旧仕様の残存を解消）
挙動変更（期限超過での自動停止を解除）に伴い、旧仕様「`valid` かつ期限内なら有効」が残る既存ドキュメントを更新する。

- `docs/device-api-specification.md`（205行 — ライセンス確認APIの判定説明）
  - 現: 「判定: ライセンス状態が `valid` かつ有効期限が未経過（または未設定）の場合に `licenseValid: true`。」
  - 変更後: 「判定: ライセンス状態が `valid` の場合に `licenseValid: true`。**有効期限の超過だけでは停止しない**（管理サイト上で「期限切れ」と表示するのみ）。実際の停止は管理者が `licenseStatus` を `suspended`/`expired` に変更したときのみ。`expiredAt` は情報提供として返す。(BUG-008)」
- `docs/api-specification.md`（805行 — ライセンス確認APIの判定説明）
  - 現: 「判定: `licenseStatus === 'valid'` かつ `licenseExpiredAt` 未経過（または未設定）。」
  - 変更後: 「判定: `licenseStatus === 'valid'` の場合に `licenseValid: true`。**有効期限の超過だけでは停止しない**（管理サイト上で「期限切れ」と表示するのみ）。実際の停止は管理者が `licenseStatus` を `suspended`/`expired` に変更したときのみ。`expiredAt` は情報提供として返す。(BUG-008)」
- `docs/features/content-delivery-and-license-plan.md`（228行）
  - 現: 「筐体側 `GET /api/device/license-check` は既存ロジックのまま（`licenseStatus==='valid'` かつ期限内で有効）。」
  - 変更後: 「筐体側 `GET /api/device/license-check` は `licenseStatus==='valid'` のみで有効判定（**期限超過の自動停止は BUG-008 で解除**。詳細は `docs/device-api-specification.md` および `license-expiry-display-only-plan.md`）。」
- `docs/features/content-delivery-and-license-plan.md`（287行 — 完了済みプランの検証手順）
  - 現: 「…筐体 `GET /device/license-check` が `licenseValid:true`。期限切れ/`expired`で `false`。」
  - 過去プランの記録のため全面書き換えはせず、当該行末に注記を追記: 「※ BUG-008 で期限超過のみでは `false` にならない仕様へ変更（手動 `suspended`/`expired` 時のみ `false`）。」

## BUGS.md 追記（BUG-008）
- 症状・原因（表示が保存値直描画＋筐体側の期限超過自動停止）・修正内容（フロント導出表示＋筐体側自動停止解除）・再現テスト（`device.service.spec.ts` の `checkLicense (BUG-008)`）・再発防止策を記載。

## デプロイ順序
- フロントは表示のみの変更、APIは筐体向け判定の変更で互いに独立（依存なし）。順序の制約は無い。
- 筐体側の挙動変更（期限超過で止まらなくなる）は運用影響があるため、リリース時に運用者へ周知する。

## 影響範囲・非対象
- DBスキーマ・マイグレーション変更なし。`licenseStatus` の保存値は一切自動更新しない。
- 管理API（`findAll`/`findOne`/`updateLicense`）は変更しない（導出はフロント表示側のみ）。
- 編集セレクトと実効表示のズレに対するUX注記は対象外。
