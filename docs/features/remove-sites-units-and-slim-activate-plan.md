# 指示書: 筐体マスタ取得API（sites-units）の削除と activate のスリム化

作成日: 2026-06-23
対象リポジトリ: shinmirai_backend01（APIサーバー）
実装担当: CodeX
レビュー担当: Claude

---

## 1. 背景・目的

定例会議で「ユニット情報設定画面（筐体側の拠点・筐体選択画面）」を廃止することが決定した。
これに伴い、選択候補を返すための `GET /api/device/master/sites-units` が不要になる。

また現状の `sites-units` は **削除済み以外の全拠点・全筐体の名前を丸ごと返す**ため、
1台の有効な device_token を持つ筐体から **他社・他店舗の拠点名／筐体名／台数が列挙できる**
情報漏えい状態にある。エンドポイント削除によりこの問題も根本解決する。

`activate`（筐体紐付け＝pcUuid登録）は今後も残す方針（2026-06-23 ユーザー確認済み）。

---

## 2. 設計上の根拠（重要）

- 筐体は管理画面での登録時に必ず `siteId` を割り当てて作成される
  （`apps/api/src/admin/units/units.service.ts` の `create()`、`CreateUnitDto.siteId` は必須）。
- 同時に `device_token` が発行され、筐体はそれを保持する。
- `DeviceAuthGuard`（`apps/api/src/common/guards/device-auth.guard.ts`）が
  token から `unit` と紐づく `site` を解決し `request.device` にセットする。
  → **API 側は token だけで「どの筐体か」「どの拠点か」を既に確定できている。**
- 現状の `activate()`（`apps/api/src/device/device.service.ts`）は
  body の `dto.unitId` を**使っておらず**、`device.unitId`（token由来）で更新している。
  `siteId` も筐体登録時点で確定済みのため、body から受け取る必要がない。

→ 結論: `activate` は `pcUuid` のみ受け取れば成立する。

---

## 3. 変更内容

### 3-1. `sites-units` エンドポイントの削除

**`apps/api/src/device/device.controller.ts`**
- `getMasterSitesUnits` のルートハンドラ（`@Get('master/sites-units')` のブロック）を削除。

**`apps/api/src/device/device.service.ts`**
- `getMasterSitesUnits()` メソッドを削除。
- 当該メソッドでのみ使用していた import があれば併せて整理（他で使っていれば残す）。

### 3-2. `activate` のスリム化（pcUuid のみ受け取る）

**`apps/api/src/device/dto/activate.dto.ts`**
- `siteId` と `unitId` のプロパティを削除し、`pcUuid` のみ残す。

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ActivateDto {
  @ApiProperty({ description: 'PC端末UUID', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID('4', { message: 'pc_uuidはUUID v4形式で指定してください' })
  pcUuid!: string;
}
```

**`apps/api/src/device/device.service.ts` の `activate()`**
- `data.siteId = dto.siteId` の代入を削除（siteId は登録時に確定済みのため更新しない）。
- 防御的チェック: `device.siteId` が未設定（null）の場合は紐付け不可として
  `BadRequestException('この筐体は拠点が未割当です。管理画面で拠点を割り当ててください')` を投げる。
- 更新は `pcUuid` のみ。
- ログ出力は `device.siteId` を参照する形に修正。

変更後イメージ:

```ts
async activate(device: UnitWithSite, dto: ActivateDto) {
  if (device.pcUuid) {
    throw new ConflictException('この筐体は既に紐付け済みです。管理画面から解除してください');
  }
  if (!device.siteId) {
    throw new BadRequestException('この筐体は拠点が未割当です。管理画面で拠点を割り当ててください');
  }

  const updated = await this.prisma.unit.update({
    where: { unitId: device.unitId },
    data: { pcUuid: dto.pcUuid },
  });

  this.logger.log(`筐体紐付け完了: ${device.unitId} -> 拠点:${device.siteId}, PC:${dto.pcUuid}`);

  return {
    unitId: updated.unitId,
    siteId: updated.siteId,
    pcUuid: updated.pcUuid,
    deviceToken: updated.deviceToken,
  };
}
```

> 注: `BadRequestException` の import が未追加なら `@nestjs/common` から追加すること。

### 3-3. ドキュメント更新

- `docs/device-api-specification.md`
  - §3.1 初期セットアップのフローから「`GET /api/device/master/sites-units` で候補取得」の手順を削除。
    筐体は token を保持済みである前提に書き換え、`activate` は `pcUuid` のみ送る旨に修正。
  - §4.1（sites-units の節）を削除し、以降の節番号を繰り上げ。
  - §4.2 activate のリクエスト表を `pcUuid` のみに修正。
- `docs/api-specification.md`
  - §4.1 `GET /api/device/master/sites-units` の節を削除。
  - activate のリクエスト仕様を `pcUuid` のみに修正。

---

## 4. 注意点・デプロイ順序（重要）

筐体向け DTO は**厳格モード（forbidNonWhitelisted 相当）**で、DTO未定義のプロパティを送ると 400 になる
（`docs/device-api-specification.md` §2.5 に明記）。

そのため `ActivateDto` から `siteId`/`unitId` を削除すると、
**旧筐体クライアントが `siteId`/`unitId` を送り続けている間は activate が 400 になる**。

対応方針（いずれかを選択。本指示書の推奨は A）:

- **案A（推奨・きれい）**: サーバ側を本指示書どおり完全削除し、
  筐体クライアントの改修（`pcUuid` のみ送る）と**リリースを協調**させる。
  筐体クライアント側の改修見込みを必ず確認してからデプロイすること。
- **案B（過渡期を設ける場合）**: `ActivateDto` に `siteId`/`unitId` を
  `@IsOptional()` 付きで一旦残し（サーバ側は無視）、筐体クライアント移行完了後に削除する。
  この場合も `activate()` のロジックは案A同様 token 由来で処理する。

→ 筐体クライアントの改修・リリース時期が未確定なら、実装前にユーザーへ確認すること。

---

## 5. 完了条件（受け入れ基準）

- [ ] `GET /api/device/master/sites-units` が 404（ルート消滅）になる。
- [ ] `device.service.ts` から `getMasterSitesUnits()` が消え、ビルド・型チェックが通る。
- [ ] `POST /api/device/activate` が `pcUuid` のみで成功する。
- [ ] `activate` に `siteId`/`unitId` を含めると（案A採用時）400 になる。
- [ ] 既に pcUuid 設定済みの筐体で activate すると 409。
- [ ] siteId 未割当の筐体で activate すると 400（防御チェック）。
- [ ] Swagger（`/api/docs`）から sites-units が消え、activate のスキーマが pcUuid のみになる。
- [ ] `docs/` 2ファイルが更新されている。
- [ ] 他に `getMasterSitesUnits` / `sites-units` への参照が残っていない（grep 確認）。
```
