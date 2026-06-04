# sinmirai 筐体登録モーダルのPC UUIDを入力不可・表示専用にする — CodeX向け指示書

作成: 2026-06-04 / 作成者: Claude（プラン・指示書担当） / 実装担当: CodeX
対象: フロント(Next.js `apps/web`) + バックエンド(NestJS `apps/api`) ※Prismaスキーマ変更なし
関連バグ: BUG-002（筐体新規登録/編集モーダルでPC UUIDが編集可能な入力欄になっている）

---

## 0. バグ概要と確定方針

### 症状（ユーザー報告・2026-06-04）
筐体管理画面の新規登録/編集モーダルで、**PC UUID が編集可能なテキストボックス**として表示されている。
PC UUID は投影アプリ（筐体端末）が API 経由で送ってくる値であり、管理画面では入力・編集すべきでない。
新規登録時は空欄、編集も不可で、**テキスト表示のみ**であるべき。

### 根本原因（Claude調査・確定）
- PC UUID の正規の書き込み者は**端末側の「筐体紐付け登録」API**（[device.service.ts:49-50](apps/api/src/device/device.service.ts#L49) — 既に pc_uuid 設定済みならエラー＝端末が一度だけ登録する設計。検証は [activate.dto.ts](apps/api/src/device/dto/activate.dto.ts) でUUID v4）。
- ところが管理画面の `UnitDialog` が PC UUID を**編集可能 `<Input>`**で出し（[unit-dialog.tsx:177-182](apps/web/src/components/dialogs/unit-dialog.tsx#L177)）、`createUnit`/`updateUnit` で送信。admin の DTO（[create-unit.dto.ts:15-18](apps/api/src/admin/units/dto/create-unit.dto.ts#L15)・[update-unit.dto.ts:15-18](apps/api/src/admin/units/dto/update-unit.dto.ts#L15)）も `pcUuid` を受理し、`units.service` が書き込んでいる（[units.service.ts:86](apps/api/src/admin/units/units.service.ts#L86)・[:107](apps/api/src/admin/units/units.service.ts#L107)）。
- ※筐体**詳細**画面は既に「PC UUID -」の読み取り表示で問題なし。修正対象は**モーダル(`UnitDialog`)とadmin API**のみ。

### 確定方針（ユーザー合意済み・2026-06-04）
**フロント＋API両方**を修正し、PC UUID を管理画面・admin API の双方で変更不可にする。端末の activate フローのみが唯一の書き込み者。

---

## ⚠️ 1. 最重要の前提（必読）— フロントとAPIは必ずセット

`main.ts` の ValidationPipe が **`whitelist: true, forbidNonWhitelisted: true`**（[main.ts:27-29](apps/api/src/main.ts#L27)）。
このため、**admin の DTO から `pcUuid` を除去すると、`pcUuid` を含むリクエストは 400 で拒否される**。

- 結果として、**フロントが `pcUuid` を送らないようにする修正は必須**（送り続けると編集時に400で壊れる）。
- **デプロイ順序は web 先行**（新web=pcUuid送らない＋旧api=受理する、の組み合わせは無害。逆順だと旧web=pcUuid送る＋新api=400で壊れる窓ができる）。デプロイはClaudeが担当。

---

## 2. 修正内容（ファイル別）

### 2-1. フロント `apps/web/src/components/dialogs/unit-dialog.tsx`
1. **PC UUID の入力欄を読み取り表示に変更**。現在の `<Input id="unit-uuid" ...>`（176-183行あたり）を、編集不可のテキスト表示へ置換:
   ```tsx
   <div className="space-y-2">
     <Label>PC UUID</Label>
     <p className="rounded-md border border-input bg-muted/50 px-3 py-2 font-mono text-xs text-muted-foreground break-all">
       {unit?.pcUuid ?? "未登録（端末接続時に自動登録）"}
     </p>
     <p className="text-xs text-muted-foreground">
       ※筐体端末から自動登録される値です。管理画面では変更できません。
     </p>
   </div>
   ```
   - 新規登録（`unit` なし）→「未登録（端末接続時に自動登録）」。編集で値あり→値を表示。編集で未登録→「未登録…」。
2. **`pcUuid` の state と送信を除去**:
   - `const [pcUuid, setPcUuid] = useState("")` を削除。
   - `useEffect` 内の `setPcUuid(unit?.pcUuid ?? "")` を削除。
   - **作成ペイロード**から `pcUuid: pcUuid || undefined` を削除（`api.createUnit({ siteId, unitName, connectionMode })`）。
   - **更新ペイロード**から `pcUuid: pcUuid || undefined` を削除（`api.updateUnit(unit!.unitId, { siteId, unitName, connectionMode })`）。
   - 表示は `unit?.pcUuid` を直接参照するため state は不要。

### 2-2. フロント `apps/web/src/lib/api-client.ts`
- `createUnit` / `updateUnit` の引数型から **`pcUuid` を除去**（[api-client.ts:151](apps/web/src/lib/api-client.ts#L151)・[:153](apps/web/src/lib/api-client.ts#L153)）。将来の呼び出し元が誤って送って400になるのを防ぐ。
  - 例: `createUnit: (data: { siteId: string; unitName: string; connectionMode?: string })`
  - 例: `updateUnit: (unitId: string, data: Partial<{ siteId: string; unitName: string; connectionMode: string }>)`

### 2-3. バックエンド DTO（`pcUuid` 受理を停止）
- `apps/api/src/admin/units/dto/create-unit.dto.ts` — `pcUuid?` ブロック（15-18行）を**削除**。
- `apps/api/src/admin/units/dto/update-unit.dto.ts` — `pcUuid?` ブロック（15-18行）を**削除**。

### 2-4. バックエンド `apps/api/src/admin/units/units.service.ts`
- `create()` の `data` から `pcUuid: dto.pcUuid,`（86行）を**削除**（新規はnull＝端末activateまで未登録）。
- `update()` の `data` から `pcUuid: dto.pcUuid,`（107行）を**削除**。

### 2-5. 触らないもの（重要）
- **`apps/api/src/device/*`**（activate＝PC UUIDの正規の書き込み者。これは維持）。
- **`units.service.ts` の findAll キーワード検索の `pcUuid`**（[:21](apps/api/src/admin/units/units.service.ts#L21)）— 検索（読み取り）なので**残す**。
- **`prisma/schema.prisma` の `pcUuid` 列** — DBには引き続き必要（端末が登録）。**変更しない**。
- 筐体詳細画面（既に読み取り表示）。

---

## 3. 検証手順（再現テストの代替）

API側に自動テスト基盤（`.spec.ts`）が無いため手動検証で代替（BUG-001と同方針）。

### 3-1. 再現確認（修正前）
- 筐体管理→「筐体を追加」/「編集」で、PC UUID が**編集できるテキストボックス**になっている。

### 3-2. 修正後の確認
1. **新規登録モーダル**: PC UUID が入力欄ではなく「未登録（端末接続時に自動登録）」のテキスト表示。拠点・筐体名を入れて「追加する」→ 作成成功（400が出ない）。作成された筐体の `pcUuid` は null。
2. **編集モーダル**: PC UUID が読み取り表示（値があれば値、無ければ「未登録…」）。他項目を変更して「更新する」→ 成功（400が出ない）。
3. **API直接（forbidNonWhitelisted）**: `POST /api/admin/units` または `PATCH /api/admin/units/:id` の body に `pcUuid` を含めると **400**（whitelist違反）になること（curl/Swaggerで確認）。＝admin経由でPC UUIDを設定/変更できない。
4. **端末フロー不変**: 端末の「筐体紐付け登録」APIで pc_uuid が従来どおり登録できること（既存挙動の回帰がないこと）。
5. **ビルド**: `apps/web` の build と `apps/api` の build（`tsc`）が通ること。

### 3-3. 回帰ガード（静的）
- `unit-dialog.tsx` に `setPcUuid`／`pcUuid` を送るペイロードが残っていないこと（grep）。
- admin の create/update DTO・`units.service` の create/update に `pcUuid` が残っていないこと（grep）。

---

## 4. 完了報告に含めること（CodeX → Claude）
1. 変更ファイル一覧（想定5ファイル: unit-dialog.tsx / api-client.ts / create-unit.dto.ts / update-unit.dto.ts / units.service.ts）と各変更概要。
2. §3-2 の手動確認結果（新規/編集モーダルの表示、作成・更新が400なしで成功、API直接でpcUuidが400拒否）。スクショ可。
3. build結果（web / api）。
4. スコープ外不可侵の確認（device.*／schema.prisma／findAll検索のpcUuid／筐体詳細は未変更）。

## 5. 厳守事項
- `prisma/schema.prisma` は変更しない（pc_uuid 列は維持）。
- `device/*`（端末activateフロー）は変更しない。
- **フロントの「pcUuidを送らない」修正とAPIのDTO除去は必ずセットで実施**（片方だけだと400で壊れる）。
- BUGS.md記録（BUG-002）・コミット・本番反映（**web先行→api**）は Claude が担当。CodeX は実装と動作確認に専念してよい。
