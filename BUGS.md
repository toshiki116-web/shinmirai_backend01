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

---

## BUG-002: 筐体登録/編集モーダルでPC UUIDが編集可能な入力欄になっている

- **発生日**: 2026-06-04
- **修正日**: 2026-06-04
- **修正コミット**: 本コミット（`[fix] ... (BUG-002)`）
- **症状**: 筐体管理画面の新規登録/編集モーダルで、PC UUID が編集可能なテキストボックスとして表示され、管理者が入力・編集できてしまう。
- **原因**: PC UUID の正規の書き込み者は端末（投影アプリ）の「筐体紐付け登録」API（`device` activate。既に設定済みならエラー＝一度だけ登録する設計）。にもかかわらず `UnitDialog` が編集可能 `<Input>` で出し、admin の create/update DTO・`units.service` も `pcUuid` を受理・書き込みしていた。
- **修正内容**: PC UUID を管理画面・admin API の双方で変更不可にし、端末 activate のみが書き込み者になるようにした。
  - フロント `apps/web/src/components/dialogs/unit-dialog.tsx` — PC UUID の入力欄・`pcUuid` state・送信payload を削除し、読み取り専用テキスト表示（未登録時は「未登録（端末接続時に自動登録）」）に変更。
  - フロント `apps/web/src/lib/api-client.ts` — `createUnit`/`updateUnit` の引数型から `pcUuid` を削除。
  - バックエンド `apps/api/src/admin/units/dto/create-unit.dto.ts`・`update-unit.dto.ts` — `pcUuid` を削除。
  - バックエンド `apps/api/src/admin/units/units.service.ts` — create/update の `pcUuid` 書き込みを削除。
  - 維持（触らない）: 端末 activate（`apps/api/src/device/*`）、`prisma/schema.prisma` の `pc_uuid` 列、findAll のキーワード検索、筐体詳細画面の読み取り表示。
- **再現テスト**: API側に自動テスト基盤（`.spec.ts`）が無いため手動検証で代替。
  - **再現手順（修正前）**: 筐体管理→「筐体を追加」/「編集」で PC UUID が編集可能な入力欄。
  - **修正後の確認**: モーダルの PC UUID が読み取り表示。拠点・筐体名のみで作成/更新が 400 なしで成功。`POST`/`PATCH /api/admin/units` の body に `pcUuid` を含めると `ValidationPipe`（`forbidNonWhitelisted: true`）により 400。端末 activate での pc_uuid 登録は従来どおり動作。
  - **回帰ガード（静的）**: admin DTO・`units.service` の create/update・フロントの送信payload・`setPcUuid`/editable input に `pcUuid` が残っていないこと（grep）。残存は許可箇所（schema/findAll検索/device/詳細表示/モック）のみ。
- **再発防止策**: `ValidationPipe` の `forbidNonWhitelisted: true` により、DTOに無い `pcUuid` はAPIレベルで400拒否され、admin経由の書き込みが構造的に不可能。
- **デプロイ注意**: `forbidNonWhitelisted` のため、フロント（pcUuid送らない）とAPI（DTO除去）はセット必須。**web先行→api**の順でデプロイ（逆順だと旧web＋新apiで編集が400になる窓ができる）。

---

## BUG-003: 筐体編集中にアクセストークンが失効するとログアウトされる

- **発生日**: 2026-06-04
- **修正日**: 2026-06-04
- **修正コミット**: 本コミット（`[feat] ... (BUG-003)`）
- **症状**: 管理画面で筐体編集モーダルを開いたまま時間が経過し、「更新する」を押すとログアウトされる。ユーザーには拠点選択や更新操作が原因に見えるが、実際には失効後の最初の API リクエストが 401 になっていた。
- **原因**: アクセストークンの有効期限が 15 分である一方、リフレッシュトークン機構が無かった。フロントの API client は 401 を受けると即 `clearToken()` と `/login` 遷移を行うため、正規セッション中でもアクセストークン失効時にログアウトされていた。
- **修正内容**:
  - `apps/api/prisma/schema.prisma` / `apps/api/prisma/migrations/20260604120000_add_refresh_token/migration.sql` - `refresh_tokens` テーブルを追加し、ハッシュ保存・7日 TTL・ローテーション運用に対応。
  - `apps/api/src/auth/auth.service.ts` - login 時に refresh token を発行し、`refresh()` で旧 token を失効して新しい access/refresh token を発行、`logout()` で refresh token を冪等に失効。
  - `apps/api/src/auth/auth.controller.ts` / `apps/api/src/auth/dto/refresh-token.dto.ts` - `POST /auth/refresh` と `POST /auth/logout` を追加。
  - `apps/web/src/lib/api-client.ts` - access/refresh token を localStorage に保存し、401 時に single-flight で `/auth/refresh` を実行して元リクエストを1回だけ再送。
  - `apps/web/src/lib/auth-context.tsx` / `apps/web/src/components/layout/header.tsx` / `apps/web/src/components/layout/app-sidebar.tsx` - login 保存を refresh token 対応にし、logout 時にサーバ側 token 失効を試行。
- **再現テスト**:
  - 修正前: ログイン後、アクセストークン失効後に筐体更新などの API 操作を行うと 401 を受けて `/login` に遷移。
  - 修正後: localStorage の access token を不正値にして API 操作を行うと、`/auth/refresh` 後に元リクエストが再送される想定。refresh token が不正な場合は `/login` に遷移。
  - 自動 E2E は未整備のため、実ブラウザ/DevTools での手動確認対象として残す。
- **再発防止策**: アクセストークンは短命のまま維持し、401 時の自動リフレッシュ＋リフレッシュトークンのローテーションで、正規セッション中の不意のログアウトを構造的に防ぐ。将来的には httpOnly cookie 化と E2E 整備を検討する。

---

## BUG-004: 筐体作成/更新で不正な拠点IDを渡すと 500 になる

- **発生日**: 2026-06-04
- **修正日**: 2026-06-04
- **修正コミット**: 本コミット（`[fix] ... (BUG-004)`）
- **症状**: `POST /api/admin/units` または `PATCH /api/admin/units/:unitId` に存在しない `siteId` を渡すと、Prisma の外部キー制約違反が発生し、500 / `INTERNAL_ERROR` として返る。
- **原因**: `units.service` の create/update が `siteId` の存在と未削除状態を検証せず、Prisma にそのまま渡していた。
- **修正内容**:
  - `apps/api/src/admin/units/units.service.ts` - `ensureSiteExists(siteId)` を追加。拠点が存在しない、または `status === "deleted"` の場合は `NotFoundException('拠点 ${siteId} が見つかりません')` を返す。
  - create では必ず `dto.siteId` を検証。
  - update では `dto.siteId` が指定された場合のみ検証。
- **再現テスト**:
  - 修正前: 不正な `siteId` を含む筐体作成/更新リクエストで 500。
  - 修正後: 不正な `siteId` では 404 / 「拠点 ... が見つかりません」を返す想定。正常な `siteId` では従来どおり作成/更新成功。
  - 自動 API テストは未整備のため、curl/Swagger での手動確認対象として残す。
- **再発防止策**: 外部キー制約に到達する前に service 層で参照先の存在を検証し、業務上の入力エラーとして 404 を返す。将来的には service 単体テストまたは API E2E で不正 `siteId` ケースを固定する。
