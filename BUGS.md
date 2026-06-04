# バグ修正履歴

過去に修正したバグの記録。新規バグ修正時は本ファイルを必ず確認し、類似バグが既出でないかチェックすること。

---

## BUG-001: 筐体管理画面の削除ボタンで「筐体 ... が見つかりません」エラーで削除できない

- **発生日**: 2026-06-04
- **修正日**: 2026-06-04
- **修正コミット**: 本コミット（`[fix] ... (BUG-001)`）
- **症状**: 筐体管理画面の一覧で「削除」を押すと、確認ダイアログ内に「筐体 UNIT-D6A5E4F3 が見つかりません」と表示され削除できない。編集も同様に失敗する。
- **原因**: ダッシュボード各画面が `mock-data.ts` のモック配列を描画していたのに対し、削除/編集ボタンだけ実API（`api.deleteUnit` 等）を呼んでいた。モックの架空ID（実DBに存在しない `UNIT-D6A5E4F3` 等）でAPIを叩くため、バックエンドが正しく404「筐体 ... が見つかりません」を返していた。バックエンドは正常で、フロントの結線不足（一覧がモックのまま）が根本原因。実API接続済みはユーザー管理画面のみだった。
- **修正内容**: グループA（実APIが既存の7画面）をモックから実APIへ差し替え。参照実装は `users/page.tsx`（`useState`+`useEffect`+`useCallback`+loading/error）。
  - `apps/web/src/app/(dashboard)/units/page.tsx` — `mockUnits` → `api.getUnits()`。削除/編集後は `fetchUnits` で再取得。
  - `apps/web/src/app/(dashboard)/units/[unitId]/page.tsx` — `api.getUnit()`。アラートは戻り値の `deviceAlerts` を使用。
  - `apps/web/src/app/(dashboard)/sites/page.tsx` — `api.getSites()`。
  - `apps/web/src/app/(dashboard)/sites/[siteId]/page.tsx` — `api.getSite()`。所属筐体は戻り値の `units` を使用。
  - `apps/web/src/app/(dashboard)/contents/page.tsx` — `api.getContents()`。
  - `apps/web/src/app/(dashboard)/contents/[contentId]/page.tsx` — `api.getContent()`。配信先は戻り値の `assignedSites` を使用（status列は実APIに無いため削除）。
  - `apps/web/src/app/(dashboard)/monitoring/page.tsx` — 初回のみ `getUnits`/`getSites` を取得して集計（ポーリングなし）。
  - `apps/web/src/components/dialogs/unit-dialog.tsx` — 所属拠点プルダウンを `api.getSites()` に差し替え。
  - 全画面で `window.location.reload()` を廃止し、mutation 成功時はデータ再取得に変更。
- **再現テスト**: フロントに自動テスト基盤が無いため、手動再現/回帰手順で代替（下記）。バックエンドの削除API（`DELETE /admin/units/:unitId`）は元から正常動作。
  - **再現手順（修正前）**: ログイン→筐体管理→任意筐体の「削除」→「削除する」→「筐体 ... が見つかりません」エラー。
  - **修正後の確認**: 一覧に実DBの筐体が表示され、実在筐体の削除/編集が成功・即時反映される。拠点/コンテンツ/監視/筐体ダイアログも実データで表示される。
  - **回帰ガード（静的）**: グループA対象パス（units/sites/contents/monitoring + unit-dialog.tsx）に `mock(Units|Sites|Contents)` の参照が残っていないことを grep で確認（0件であること）。
- **再発防止策**: 上記grep回帰ガードを手動チェック手順として明文化。フロントの自動テスト基盤（Playwright等のE2E）は未整備のため、別途整備をユーザーに提案予定。
- **残課題（別タスク）**: グループB（アラート `alerts/page.tsx`・分析 `analytics/page.tsx`）は `GET /admin/alerts`・`GET /admin/analytics` 系コントローラーが未実装のため、本修正対象外。コンテンツ詳細「配信先を編集」ボタンのハンドラ未実装も別途対応。
