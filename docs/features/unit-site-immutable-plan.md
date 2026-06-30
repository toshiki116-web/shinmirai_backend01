# CodeX向け指示書: 筐体の所属拠点を「設定後は変更不可」にする（前回方針の反転）

- **作成日**: 2026-06-30
- **作成**: Claude（プラン・指示書担当）
- **実装**: CodeX
- **対象**: `apps/api`（NestJS）＋ `apps/web`（Next.js）
- **本番環境**: 大阪（ap-northeast-3）・自前ALB+Fargate
- **前提**: 本指示書は [`unit-site-reassignment-plan.md`](./unit-site-reassignment-plan.md)（commit `9085c63` で実装・本番デプロイ済）の **「拠点を変更可能にする」部分を反転** する。device 応答の siteId/siteName 追加と Swagger DTO は**残す**（後述）。

---

## 0. 背景（必読）

### 方針の反転
- 前回は「筐体の所属拠点を管理画面から変更可能にし、投映アプリへ軽量同期する」方針で実装・デプロイした（commit `9085c63`、本番ライブ）。
- **ユーザー再判断: 筐体の所属拠点は一度設定したら変更できるべきではない。**
- `CreateUnitDto.siteId` は `@IsNotEmpty` で**必須**（[`create-unit.dto.ts:7`](../../apps/api/src/admin/units/dto/create-unit.dto.ts)）。よって**拠点は作成時に必ず確定**し、「一度設定したら」＝実質「作成時」。
- 結論: **作成時に確定した所属拠点は、以降 `PATCH /admin/units/:id` で変更できないようにする。**

### 採用方針（ユーザー判断済み）
1. **device 応答の siteId/siteName は残す**（churn 最小）。拠点が変わらないので同期の動機は消えるが、フィールド自体は無害でアプリの表示・整合チェックに使えるため撤去しない。**device 側（device.service / device.controller / device-response.dto）は今回ノータッチ**。
2. **未割当(siteId=null)の筐体に限り一度だけ割当可**（`null → 値` は許可、`値 → 別値` は拒否）。作成時必須のため通常 null は存在しないが、レガシー/例外の安全弁として残す。

---

## 1. 設計方針

### 1-1. API: 拠点変更の拒否（コア）
[`apps/api/src/admin/units/units.service.ts`](../../apps/api/src/admin/units/units.service.ts) `update` のロジックを変更する。

| 状態 | 挙動 |
|---|---|
| `dto.siteId === null` | **400**（未割当化は不可・現状維持） |
| 既存 siteId が**設定済み** かつ `dto.siteId` が**異なる値** | **409 Conflict**「所属拠点は変更できません」 |
| 既存 siteId が設定済み かつ `dto.siteId` が**同値** | no-op（許可） |
| 既存 siteId が **null** かつ `dto.siteId` 指定あり | **一度だけ割当**（許可・ログ出力） |
| `dto.siteId === undefined` | siteId は変更しない（通常の名称/接続モード更新） |

### 1-2. Web: 所属拠点を読み取り専用に
[`apps/web/src/components/dialogs/unit-dialog.tsx`](../../apps/web/src/components/dialogs/unit-dialog.tsx)：
- **編集モード かつ 既に拠点が設定済み**（`unit.siteId` あり）→ 所属拠点を **読み取り専用表示**（PC UUID と同じ見せ方）。select を出さない。
- **編集モード かつ 未割当**（`unit.siteId` が空）→ select を表示（一度だけ割当可）。
- **新規作成モード** → 従来どおり select（必須）。
- 前回追加した**拠点変更の確認ダイアログ（`AlertDialog`）と関連 state は撤去**（変更不可になり不要）。

### 1-3. device 側はノータッチ
- heartbeat / contents 応答の `siteId`/`siteName`、`device-response.dto.ts`、Swagger 設定は**現状維持**（前回デプロイ済のまま）。
- 投映アプリ側の「拠点変更追従（再取得）」仕様は**不要化**（site は不変）。アプリ担当者へは「拠点は不変なので同期ロジックは不要。siteId/siteName は表示・整合確認に利用してよい」と申し送る（§4）。

---

## 2. バックエンド実装（apps/api）

### 2-1. `units.service.ts` の `update` を変更

現状（前回実装）:
```typescript
async update(unitId: string, dto: UpdateUnitDto, actorId: string) {
  if (dto.siteId === null) {
    throw new BadRequestException('siteId を null にはできません（未割当化は非対応）');
  }
  const existing = await this.ensureExists(unitId);
  if (dto.siteId) {
    await this.ensureSiteExists(dto.siteId);
  }
  const siteChanged = dto.siteId !== undefined && dto.siteId !== existing.siteId;
  const updated = await this.prisma.unit.update({ /* ... */ });
  if (siteChanged) {
    this.logger.log(`筐体拠点変更: who=${actorId} ...`);
  }
  return updated;
}
```

変更後:
```typescript
async update(unitId: string, dto: UpdateUnitDto, actorId: string) {
  // 未割当化（null）は不可（現状維持）
  if (dto.siteId === null) {
    throw new BadRequestException('siteId を null にはできません（未割当化は非対応）');
  }

  const existing = await this.ensureExists(unitId);

  // 拠点は一度設定したら変更不可。設定済みの拠点を別拠点へ変えようとしたら拒否。
  if (dto.siteId !== undefined && existing.siteId && dto.siteId !== existing.siteId) {
    throw new ConflictException('所属拠点は変更できません');
  }

  if (dto.siteId) {
    await this.ensureSiteExists(dto.siteId);
  }

  // null → 値 の一度きりの割当のみ「割当」として記録
  const isInitialAssignment =
    dto.siteId !== undefined && !existing.siteId && !!dto.siteId;

  const updated = await this.prisma.unit.update({
    where: { unitId },
    data: {
      siteId: dto.siteId,
      unitName: dto.unitName,
      connectionMode: dto.connectionMode,
    },
  });

  if (isInitialAssignment) {
    this.logger.log(`筐体拠点割当: who=${actorId} unit=${unitId} siteId=${dto.siteId}`);
  }

  return updated;
}
```

- `ConflictException` を `@nestjs/common` から import 追加（`BadRequestException`/`NotFoundException`/`Logger` は import 済）。
- 同値（`値 → 同値`）は conflict 判定を通過し no-op で許可（冪等）。
- 設定済み拠点への「変更」ログは出さない（変更が起きないため）。割当（null→値）時のみログ。
- **P3: 判定順序を崩さない（重要）**。「既存 siteId 設定済み かつ 別値指定」は `ensureSiteExists` より**先に 409** を返す（＝変更不可なので、指定先拠点の存在確認すらしない）。これは意図的。`ensureSiteExists` による **404 は「未割当筐体への初回割当時」に限り**発生する。実装時にこの順序（conflict 判定 → ensureSiteExists）を入れ替えないこと。

### 2-2. コントローラ / DTO はノータッチ
- [`units.controller.ts`](../../apps/api/src/admin/units/units.controller.ts) の `@CurrentUser()` 受け渡しは前回実装のまま維持（割当ログの who に使用）。
- [`update-unit.dto.ts`](../../apps/api/src/admin/units/dto/update-unit.dto.ts) の `siteId?: string | null` は維持（null を実行時に弾く前提）。
- Swagger: `@ApiResponse({ status: 409, description: '所属拠点は変更不可' })` を `update` に追記すると親切（任意）。

### 2-3. device 側はノータッチ
- 変更しない。

---

## 3. フロント実装（apps/web）

[`apps/web/src/components/dialogs/unit-dialog.tsx`](../../apps/web/src/components/dialogs/unit-dialog.tsx)：

### 3-1. 撤去するもの（前回追加分）
- `confirmSiteChangeOpen` state、`AlertDialog` ブロック（拠点変更確認）、`isLinkedSiteChange` 判定、`handleSubmit` 内の確認分岐。
- `saveUnit` は残してよいが、`handleSubmit` は確認分岐を除いて従来どおり `saveUnit` を呼ぶだけに戻す。
- `AlertDialog*` の import が他で未使用になるなら削除。

### 3-2. 所属拠点の表示制御
- 「所属拠点」欄を以下で出し分ける（PC UUID 欄の読み取り専用表示が手本）:
  - `isEdit && unit?.siteId`（割当済み）→ 読み取り専用テキスト（拠点名・拠点ID）。select を出さない。`updateUnit` 送信時は **siteId を payload に含めない**（`siteId` プロパティ自体を渡さない。`siteId: siteId || undefined` をそのまま使うと同値が送られ意図と合わないため、割当済み分岐では明示的に siteId キーを除外する）。
  - `isEdit && !unit?.siteId`（未割当）→ select 表示（一度だけ割当）。**ただし `required` にはしない**（後述 P2 決定）。
  - `!isEdit`（新規）→ 従来どおり select（必須）。
- 既存の `defaultSiteId && !isEdit`（拠点詳細からの新規登録で固定表示）の分岐は維持。

#### P2 決定: 未割当編集時の select は必須にしない
- select の `required` は **`required={!isEdit}`**（新規作成時のみ必須）にする。
- 理由: 未割当はレガシー/例外状態。そこで「拠点はまだ決めず筐体名だけ直す」をブロックしないため、編集時は拠点未選択のまま保存可とする。
- payload: 未割当編集で **拠点を選ばなかった場合は siteId を送らない**（無変更）。**選んだ場合のみ siteId を送る**（→ API 側で null→値の一度割当が走る）。
- これにより、割当の強制はせず、割当したいときだけ一度割り当てられる。

### 3-3. 文言
- 読み取り専用表示の補足に「※所属拠点は登録時に確定し、変更できません」を添える（PC UUID 欄の注記に倣う）。

---

## 4. 投映アプリ側の申し送り（別リポジトリ）

- **拠点は不変**になったため、前回申し送った「siteId 差分検知 → キャッシュ更新 → contents 再取得」の同期ロジックは**不要**。
- heartbeat / contents 応答の `siteId`/`siteName`（`data` 直下）は引き続き返るので、**表示や整合チェック**に利用してよい（必須ではない）。
- もしアプリが自身のキャッシュ siteId とサーバー応答が食い違うのを検知したら、それは異常（運用上起こらない想定）なのでログに残す程度でよい。

---

## 5. テスト観点

### API（apps/api）
> 前回追加した [`units.service.spec.ts`](../../apps/api/src/admin/units/units.service.spec.ts) を以下の形へ更新する（「拠点変更で who/old/new ログ」ケースは削除し、409 拒否＋割当ログへ置換）。

- 設定済み筐体（`LOC-0001`）に `{ siteId: 'LOC-0002' }` → **409 ConflictException**。DB の siteId が変わらないこと。
- **conflict 時に `prisma.site.findUnique`（ensureSiteExists）と `prisma.unit.update` が呼ばれない**こと（副作用ゼロ・判定順序の担保）。
- 設定済み筐体に `{ siteId: 'LOC-0001' }`（同値）→ 200・更新許可・**ログなし**。
- 設定済み筐体に siteId を含めない更新（名称変更等）→ 200・siteId 不変。
- 未割当筐体（siteId=null）に `{ siteId: 'LOC-0002' }` → 200・割当成功・**`筐体拠点割当` ログ出力**（who/unit/siteId）。
- 未割当筐体への**存在しない siteId** → 404（`ensureSiteExists`）。
- `{ siteId: null }`（明示 null）→ 400（現状維持）。

### web（apps/web）
- 割当済み筐体の編集モーダルで所属拠点が読み取り専用（select 非表示）・更新 payload に siteId キーが含まれない。
- 未割当筐体の編集モーダルでは select が出る。**未選択のまま筐体名だけ更新できる**（select は `required={!isEdit}` で編集時は必須でない）。拠点を選んだ場合のみ siteId が送られる。
- 新規作成は従来どおり select 必須。
- 拠点変更の確認ダイアログが出ない（撤去済み）。

### 既存テストの更新
- 前回追加した [`units.service.spec.ts`](../../apps/api/src/admin/units/units.service.spec.ts) の「拠点変更で who/old/new ログ」ケースは、**変更が 409 で拒否される**仕様へ更新する（変更ログのテスト → 409 拒否のテスト ＋ 割当ログのテストへ書き換え）。

---

## 6. デプロイ・注意

- **api / web ともに再ビルド＆再デプロイが必要**（前回デプロイ済の挙動を上書きするため）。スキーマ変更は無く**マイグレーション不要**。
- デプロイは網接許可モードで。デプロイ前に `describe-services` で稼働中リビジョンを確認（前回時点 api 稼働=`:8`・web=`:1`、両 taskdef とも `:latest` 参照のため force-new-deployment で更新可）。
- 順序は api → web。
- 受け入れ: `/api/health`=200・`/login`=200、割当済み筐体の拠点変更が 409、編集画面で拠点が読み取り専用。

---

## 7. スコープ外（今回やらない）

- device.service / device.controller / device-response.dto の変更（前回実装のまま維持）。
- 投映アプリ本体の改修（別リポジトリ・申し送りのみ）。
- 拠点の物理移設運用（筐体を別拠点へ移す場合は「削除→新拠点で再登録」。本タスクでは運用方針の明記のみで、専用機能は作らない）。
