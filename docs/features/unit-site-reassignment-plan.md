# CodeX向け指示書: 筐体の拠点変更（再割当）と投映アプリへの軽量同期

- **作成日**: 2026-06-30
- **作成**: Claude（プラン・指示書担当）
- **実装**: CodeX
- **対象**: `apps/api`（NestJS）＋ `apps/web`（Next.js）／＋ 投映アプリ（別リポジトリ・アプリ担当者向け仕様）
- **本番環境**: 大阪（ap-northeast-3）・自前ALB+Fargate

---

## 0. 背景と論点（必読）

### 相談内容
筐体詳細画面（例: `/units/UNIT-D2D1A434`）で所属拠点を変更できる仕様にするか検討。
当初の懸念は「投映アプリの設定画面で拠点と紐づけているため、管理サイトで拠点を変えると紐付けが切れ、拠点限定動画の再生でエラーが起こる／APIの返す拠点IDと不整合になる」というもの。

### 現状の事実確認（コード調査済み）
- 筐体の所属拠点は **DBの `Unit.siteId` が唯一の正（source of truth）**（[`apps/api/prisma/schema.prisma:64`](../../apps/api/prisma/schema.prisma)）。NULL許可。
- `POST /device/activate` は **`pcUuid` のみ送信**（[`apps/api/src/device/dto/activate.dto.ts`](../../apps/api/src/device/dto/activate.dto.ts)）。siteId は管理画面で事前割当が前提で、未割当だと activate が `BadRequestException`（[`device.service.ts:57`](../../apps/api/src/device/device.service.ts)）。
- `GET /device/contents` の拠点限定動画の絞り込みは、端末送信値ではなく **device_token から引いたサーバー側 `device.siteId`** で `ContentSiteAssignment` を照合（[`device.service.ts:82`](../../apps/api/src/device/device.service.ts)）。**サーバーは常に正しいコンテンツを返している**。
- siteId をレスポンスに含むのは **activate のみ**。contents / license-check / heartbeat は siteId 非返却。
- 管理画面の `PATCH /admin/units/{unitId}` は **既に siteId 変更を受け付ける実装**（[`units.service.ts:106`](../../apps/api/src/admin/units/units.service.ts)、UI: [`unit-dialog.tsx:159`](../../apps/web/src/components/dialogs/unit-dialog.tsx)）。

### 真の問題（合意済み）
- **投映アプリは activate 応答の siteId をローカルにキャッシュし、拠点限定動画のローカル出し分け・表示に使っている**（ユーザー確認済みの前提）。
- このため拠点変更時、**「サーバーは新拠点／アプリのキャッシュは旧拠点」という一時的な不整合**が生じる。アプリが旧 siteId でローカル再フィルタすると、新拠点の限定動画が逆に弾かれ再生エラーになり得る。
- → 物理的に紐付けが「壊れる」のではなく、**アプリのキャッシュを自己修復させる仕組みが無い**のが本質。これを解消する。

### 採用方針（ユーザー判断済み）
1. **反映方式 = 軽量同期**：サーバーが現在の siteId をアプリに常時通知し、アプリが差分検知でキャッシュ更新＋再取得。**再activate不要・現地作業ゼロ**。
2. **データ帰属 = ライブ帰属（現状維持）**：dailyAnalytics・アラートは `Unit.siteId` 参照のまま。移設すると過去分も新拠点に計上される（スキーマ変更しない）。この挙動は仕様として許容する。

---

## 1. 設計方針

### 1-1. サーバー → アプリの siteId 同期（軽量同期）
端末が定期的に叩く既存エンドポイントに現在の siteId を載せ、アプリが差分で自己修復する。**新規エンドポイントは作らない**。

- `POST /device/heartbeat` 応答に `siteId`・`siteName` を追加（定期通信＝追従の主経路）。
- `GET /device/contents` 応答に `siteId`・`siteName` を**同梱**（コンテンツ取得とキャッシュ更新が同一応答で起きるため、コンテンツ側のズレ窓がゼロになる）。
  - ※ siteName も載せる理由: アプリの設定画面の所属拠点表示も `siteName` で更新するため。contents 経由で差分検知したのに siteName を載せないと、表示が次回 heartbeat まで古いまま残る。
- アプリ側の追従条件（重要・冗長な再取得を避ける）:
  - **contents 応答で差分検知**: その応答の `items` をそのまま採用しキャッシュ更新（**再取得しない**。応答自体が既に新拠点の items のためズレ窓ゼロ）。
  - **heartbeat 応答で差分検知**: heartbeat は items を持たないので、このときだけ contents を再取得する。

> 反映遅延 = 端末の heartbeat 間隔。contents 取得時は同応答で即整合。

### 1-2. 管理画面の拠点変更 UX
- 拠点変更を含む更新時に**確認ダイアログ**を表示し、影響（「この筐体で再生される拠点限定動画が切り替わります。端末への反映は次回通信まで最大 数十秒〜数分かかります」）を明示。
- 既に紐付け済み（`pcUuid` 設定済み）の筐体の拠点変更は、上記の影響が大きいため確認を必須にする。未紐付け筐体は従来どおり気軽に変更可。

### 1-3. 監査ログ
- siteId が実際に変化した更新について、`who / unitId / oldSiteId / newSiteId / 日時` をログ出力（最低限 `Logger.log`。監査テーブルがあればそちらへ）。

### 1-4. データ帰属（変更なし・確認のみ）
- `dailyAnalytics`（`unitId + targetDate` キー、siteId カラム無し）・`deviceAlert`（`unitId` キー）は現状維持。拠点別集計は `Unit.siteId` を join するライブ帰属のままとする。**スキーマ変更しない**。

### 1-5. 未割当（siteId=null）の扱い（方針確定）
- DB は `Unit.siteId` が nullable だが、**管理画面からの「未割当化（拠点を外す）」は本タスクでは行わない**。
- 現状の web フォームは所属拠点 select が `required`、更新時も `siteId || undefined` を送信（[`unit-dialog.tsx:66`](../../apps/web/src/components/dialogs/unit-dialog.tsx)）。`UpdateUnitDto.siteId?` が undefined のとき Prisma は「変更なし」として扱うため、**web 経由で null へ戻す経路は存在しない**。この挙動を維持する（required のまま）。
- ⚠️ **ただし API は実行時ガードが必須（レビュー指摘・重要）**: 現状 [`update-unit.dto.ts:6`](../../apps/api/src/admin/units/dto/update-unit.dto.ts) は `@IsOptional() @IsString()`。class-validator の `@IsOptional()` は **`undefined` だけでなく `null` もスキップ**するため、外部から `PATCH /admin/units/{unitId}` に `{ "siteId": null }` を直接送ると `@IsString()` が走らず、サービスの `if (dto.siteId)` も通らず、Prisma の `data: { siteId: dto.siteId }`（=null）で**未割当化できてしまう**。TypeScript 型だけでは防げないので、**サービス先頭で実行時に明示拒否する**（§2-4 (b) に実装を記載）。
- 未割当へ戻す運用が将来必要になれば別タスクで DTO・UI・確認文言を設計する。
- ※ device 応答の `siteId: null` は「activate 前 or 既存の未割当筐体」のための表現で、これは残す（getContents の早期 return 等）。

---

## 2. バックエンド実装（apps/api）

### 2-1. heartbeat 応答に siteId を追加
[`apps/api/src/device/device.service.ts`](../../apps/api/src/device/device.service.ts) `sendHeartbeat`：

```typescript
async sendHeartbeat(device: UnitWithSite, dto: HeartbeatDto) {
  await this.prisma.unit.update({
    where: { unitId: device.unitId },
    data: { status: dto.status, lastSeenAt: new Date(dto.sentAt) },
  });

  return {
    received: true,
    siteId: device.siteId ?? null,
    siteName: device.site?.siteName ?? null,
  };
}
```

> `device` は `DeviceAuthGuard` が site を include 済み（[`device-auth.guard.ts:22`](../../apps/api/src/common/guards/device-auth.guard.ts)）なので追加クエリ不要。

### 2-2. contents 応答に siteId / siteName を同梱
同ファイル `getContents`：

- 未割当時の早期 return も `{ siteId: null, siteName: null, items: [] }` に揃える。
- 通常応答を `{ siteId, siteName, items: [...] }` に変更。`siteName` は `device.site?.siteName`（guard が include 済み）。

```typescript
async getContents(device: UnitWithSite, language?: string) {
  if (!device.siteId) {
    return { siteId: null, siteName: null, items: [] };
  }
  // ...既存の where / findMany ...
  return {
    siteId: device.siteId,
    siteName: device.site?.siteName ?? null,
    items: contents.map((c) => ({ /* 既存のまま */ })),
  };
}
```

> ⚠️ **互換性**: 旧アプリは `items` のみ参照していれば影響なし（フィールド追加のみ）。`siteId`/`siteName` を新規に読むのはアプリ更新後。後方互換あり。

### 2-3. Swagger レスポンス形状の明示（description だけにしない）
現状の heartbeat / contents は `@ApiResponse` に schema/type が無く（[`device.controller.ts:34`](../../apps/api/src/device/device.controller.ts)）、外部担当者・生成クライアントにレスポンス形状が伝わらない。**レスポンス DTO クラスを定義し `@ApiResponse({ type: ... })` で明示する**。

- `HeartbeatResponseDto`（`received: boolean`, `siteId: string | null`, `siteName: string | null`）
- `ContentsResponseDto`（`siteId: string | null`, `siteName: string | null`, `items: ContentItemDto[]`）と、`ContentItemDto`（contentId / contentName / statusCategory / deliveryType / downloadUrl / thumbnailUrl / version / checksum）
- 各 DTO のフィールドに `@ApiProperty({ nullable: true })` 等を付与。
- コントローラの `@ApiResponse({ status: 200, description: ... })` を `@ApiResponse({ status: 200, type: HeartbeatResponseDto })` 等に更新し、description にも「現在の所属拠点(siteId/siteName)を返却」を追記。

> DTO の置き場所は既存の `apps/api/src/device/dto/` 配下に新規ファイルで作成。

> ⚠️ **包み形に注意（レビュー指摘）**: グローバルの [`TransformInterceptor`](../../apps/api/src/common/interceptors/transform.interceptor.ts) が全成功応答を **`{ result: 'ok', data: {...}, message: '' }`** に包む。つまり実際の HTTP ボディは `{ result, data: { siteId, siteName, items }, message }` で、上記 DTO は **`data` の中身**を表す。
> - 既存の他エンドポイントも同様に「DTO=data の中身」で記述しているので、本タスクもそれに**揃える**（包みの DTO は作らない）。
> - ただし投映アプリ担当者向けの申し送り（§4）には、**「レスポンスは `{ result, data, message }` で包まれ、siteId/siteName/items は `data` 直下」**と明記して誤解を防ぐ。

### 2-4. 拠点変更の監査ログ（who を必ず含める）
> ⚠️ レビュー指摘の最重要項目。要件は `who / unitId / oldSiteId / newSiteId / 日時` だが、操作者(who)を出すには **コントローラが操作者IDをサービスへ渡す改修が必須**。既存の [`users.controller.ts:48`](../../apps/api/src/admin/users/users.controller.ts)（`@CurrentUser() user: RequestUser` → `service.update(id, dto, user.id)`）と同じパターンを踏襲する。

**(a) コントローラ**: [`units.controller.ts:59`](../../apps/api/src/admin/units/units.controller.ts) の `update` を変更。

```typescript
import { CurrentUser } from '../../common/decorators/current-user.decorator';

// users.controller.ts と同じく、ファイル内にローカル型を定義
type RequestUser = { id: string; role: string };

@Patch(':unitId')
@Roles('master', 'editor')
update(
  @Param('unitId') unitId: string,
  @Body() dto: UpdateUnitDto,
  @CurrentUser() user: RequestUser,
) {
  return this.unitsService.update(unitId, dto, user.id);
}
```

**(b) サービス**: [`units.service.ts:106`](../../apps/api/src/admin/units/units.service.ts) の `update` に `actorId` を追加。`ensureExists` は既に現在の Unit を返している（[`units.service.ts:149`](../../apps/api/src/admin/units/units.service.ts)）ので、その戻り値で旧 siteId を取得できる。

```typescript
async update(unitId: string, dto: UpdateUnitDto, actorId: string) {
  // ⚠️ 未割当化を実行時に拒否（@IsOptional() が null をスキップする穴を塞ぐ）
  if (dto.siteId === null) {
    throw new BadRequestException('siteId を null にはできません（未割当化は非対応）');
  }

  const existing = await this.ensureExists(unitId); // 現在の Unit を返す（既存実装のまま）
  if (dto.siteId) {
    await this.ensureSiteExists(dto.siteId);
  }

  const siteChanged = dto.siteId !== undefined && dto.siteId !== existing.siteId;

  const updated = await this.prisma.unit.update({
    where: { unitId },
    data: { siteId: dto.siteId, unitName: dto.unitName, connectionMode: dto.connectionMode },
  });

  if (siteChanged) {
    this.logger.log(
      `筐体拠点変更: who=${actorId} unit=${unitId} ` +
        `oldSiteId=${existing.siteId ?? 'なし'} newSiteId=${dto.siteId} ` +
        `(紐付け済み=${!!updated.pcUuid})`,
    );
  }
  return updated;
}
```

> `UnitsService` に `Logger` 未導入なので `import { Logger } from '@nestjs/common';` と `private readonly logger = new Logger(UnitsService.name);` を追加。
> `BadRequestException` は [`units.service.ts:1`](../../apps/api/src/admin/units/units.service.ts) で既に import 済み（追加不要）。
> ⚠️ **TS 型注意**: 現状の `UpdateUnitDto.siteId?: string` のままだと `dto.siteId === null` は TS2367（型に重なりなし）でコンパイルエラーになる。**DTO の型を `siteId?: string | null` に変更**して「ワイヤ上は null が来得る」ことを型に反映する（バリデーションは `@IsOptional() @IsString()` のまま。`Prisma` の nullable フィールドなので `data: { siteId }` 側は問題なし）。これで実行時 null ガードが型と整合する。
> 監査テーブルが将来できれば DB 記録へ移行。今回は `Logger.log` でよい（要件の who/unit/old/new/日時=ログのタイムスタンプ を満たす）。
> ※ `create` 側のシグネチャ変更は本タスク範囲外（拠点変更ではないため）。

---

## 3. フロント実装（apps/web）

### 3-1. 拠点変更の確認ダイアログ
[`apps/web/src/components/dialogs/unit-dialog.tsx`](../../apps/web/src/components/dialogs/unit-dialog.tsx)：

- 編集時、`siteId` が元の値（`unit.siteId`）から変更され、かつ対象筐体が紐付け済み（`unit.pcUuid` あり）の場合に、保存実行前に確認（`AlertDialog` 等）を挟む。
- 文言例:「所属拠点を「旧拠点名」→「新拠点名」へ変更します。この筐体で再生される拠点限定動画が切り替わります。端末への反映は次回通信まで時間がかかる場合があります。よろしいですか？」
- 既存の `updateUnit` 呼び出し（[`unit-dialog.tsx:65`](../../apps/web/src/components/dialogs/unit-dialog.tsx)）はそのまま使用。API 変更不要。

> ⚠️ **loading 状態の注意（レビュー指摘）**: 現在の `handleSubmit` は冒頭で `setIsLoading(true)` する（[`unit-dialog.tsx:61`](../../apps/web/src/components/dialogs/unit-dialog.tsx)）。確認ダイアログの分岐は **`setIsLoading(true)` を立てる前**に行い、キャンセル時は loading を立てないまま return すること。`AlertDialog`（宣言的に open state を持つ）を使う場合は、submit → 確認用 state を open にして一旦抜ける／確認の「実行」ボタン押下時に初めて `setIsLoading(true)` ＋ API 実行、という二段構えにすると loading の取り残しが起きない。`window.confirm` で簡易実装する場合も、`if (!confirm(...)) return;` を `setIsLoading(true)` より前に置く。

### 3-2. （任意・推奨）反映待ちの可視化
[`apps/web/src/app/(dashboard)/units/[unitId]/page.tsx`](../../apps/web/src/app/(dashboard)/units/[unitId]/page.tsx) の所属拠点表示付近で、`lastSeenAt` が拠点変更時刻より古い間「端末へ反映待ち」バッジを出せると親切。
- 変更時刻を保持する専用カラムは今回追加しない方針のため、簡易実装が難しければ **本項はスキップ可**（任意）。

---

## 4. 投映アプリ側の仕様（別リポジトリ・アプリ担当者向け）

> このリポジトリ外。アプリ担当者へ申し送る仕様。

> ⚠️ **レスポンスの包み形**: 全 API 成功応答は `{ result: 'ok', data: {...}, message: '' }` で包まれる。`siteId` / `siteName` / `items` は **`data` 直下**にある（`response.data.siteId` 等）。

1. heartbeat / contents 応答（`data` 直下）に含まれる `siteId`（＋`siteName`）を毎回チェックし、ローカルキャッシュと異なれば**キャッシュを更新**する。
2. 再取得は**検知した経路で書き分ける**（冗長な再取得を避ける）:
   - **contents 応答で差分検知**: その応答の `items` をそのまま採用（**再取得しない**）。応答自体が既に新拠点の items なのでズレ窓ゼロ。
   - **heartbeat 応答で差分検知**: heartbeat は items を持たないので、このときだけ contents を再取得して再生対象リストを差し替える。
3. 拠点限定動画のローカル出し分けは、**サーバーが `contents` で返したリストを信頼**する方向へ寄せる（旧 siteId による自前再フィルタを最小化／撤廃）。これによりキャッシュ更新前の取りこぼしを防ぐ。
4. （表示）設定画面の所属拠点表示も応答の `siteName` で更新する（contents 経由でも siteName が来るので、表示が古いまま残らない）。

---

## 5. テスト観点

### API（apps/api）
- heartbeat 応答に `siteId` / `siteName` が含まれる（拠点あり・未割当 NULL の両方）。
- contents 応答に `siteId` / `siteName` が含まれる（拠点あり・未割当 `{ siteId: null, siteName: null, items: [] }`）。
- `PATCH /admin/units/{unitId}` で siteId を別拠点へ変更 → 変更後の contents が新拠点の限定動画に切り替わる。
- 存在しない siteId 指定時は従来どおり 404（`ensureSiteExists`）。
- `{ "siteId": null }` を送ると 400（未割当化拒否）。DB の siteId が null に書き換わらないこと。
- 拠点変更時のみ監査ログが出力され、`who`(操作者ID) / `oldSiteId` / `newSiteId` を含む。同値更新・siteId 未指定更新では出力されない。
- Swagger 上で heartbeat / contents のレスポンス schema が表示される（DTO type 指定）。

### web（apps/web）
- 紐付け済み筐体の拠点変更時に確認ダイアログが出る／キャンセルで更新されない。
- 未紐付け筐体・拠点以外の項目変更では確認を挟まない（従来どおり）。

---

## 6. デプロイ順序・注意

- **後方互換あり**（応答へのフィールド追加のみ）。API 先行デプロイ → アプリ更新の順で安全。
- `forbidNonWhitelisted` の影響はリクエスト DTO に変更が無いため無し（今回はレスポンス追加のみ）。
- 本番は大阪（ap-northeast-3）。デプロイは網接許可モードで実施（ネットワーク隔離セッションでは ECR push 不可。`deploy-sandbox-proxy-blocker` 参照）。
- タスク定義リビジョンは決め打ちせず、デプロイ前に `describe-services` で稼働中リビジョンを確認（`ecs-taskdef-revision-pinning-gotcha` 参照。現 api 稼働=`:7`）。

---

## 7. スコープ外（今回やらない）

- dailyAnalytics / アラートのスナップショット帰属（スキーマ変更を伴うため。ライブ帰属で確定）。
- 強制再activate 方式・拠点変更専用の状態管理テーブル。
- 投映アプリ本体の改修（別リポジトリ。本書は申し送り仕様のみ）。
