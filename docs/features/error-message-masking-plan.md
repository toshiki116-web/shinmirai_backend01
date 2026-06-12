# CodeX向け指示書: ログイン画面への内部エラー露出を防ぐ（例外フィルタの汎用メッセージ化）

- **作成日**: 2026-06-12
- **作成**: Claude（プラン・指示書担当）
- **実装**: CodeX
- **対象**: `apps/api`（NestJS）のみ。フロント変更なし
- **本番環境**: 大阪（ap-northeast-3）・自前ALB+Fargate
- **優先度**: 中（セキュリティ）。インフラ恒久対策（RDSマネージドPW廃止）とは独立して実施可

---

## 0. 背景と根本原因（必読）

2026-06-12、本番ログイン画面に以下の**生のDB内部エラーがそのまま表示**された：

```
Invalid `prisma.admin.findUnique()` invocation: Authentication failed against
database server, the provided database credentials for `sinmirai` are not valid. ...
```

DB認証失敗自体はインフラ側で解消済み（[[rds-managed-password-sync]] 参照）。本指示書は**別問題＝内部エラーの外部露出**を塞ぐもの。

### 露出経路（特定済み）
- グローバル例外フィルタ [`apps/api/src/common/filters/http-exception.filter.ts`](../../apps/api/src/common/filters/http-exception.filter.ts)
- `exception instanceof HttpException` ではない**想定外の内部例外**（Prismaの接続エラー等）に入ると、現状は次のようになっている：

```ts
} else if (exception instanceof Error) {
  message = exception.message;   // ← ここで生の内部メッセージをクライアントへ返している
  this.logger.error(`予期しないエラー: ${exception.message}`, exception.stack);
}
```

- `message` がそのままレスポンス `{ result:"ng", error_code:"INTERNAL_ERROR", message: <生メッセージ> }` に載り、フロントがログイン画面に表示 → **DBユーザー名・ホスト・内部構成が外部に漏洩**。

---

## 1. 対応方針

**想定外の内部例外（非HttpException）では、詳細はサーバーログにのみ残し、クライアントへは汎用メッセージ固定で返す。**

- HttpException 経路（400バリデーション・401認証失敗・404等の業務エラー）は**現状維持**。これらはクライアントに見せてよい意図的メッセージなので変更しない。
- 変更するのは `exception instanceof Error`（=非HttpExceptionの想定外エラー）の分岐のみ。

### 修正内容（最小）
[`apps/api/src/common/filters/http-exception.filter.ts`](../../apps/api/src/common/filters/http-exception.filter.ts) の該当分岐を次のように変更：

```ts
} else if (exception instanceof Error) {
  // 想定外の内部例外は詳細をクライアントに返さない（内部構成の漏洩防止）。
  // 詳細はサーバーログにのみ記録する。
  this.logger.error(`予期しないエラー: ${exception.message}`, exception.stack);
  // message は既定の「内部サーバーエラーが発生しました」を維持（再代入しない）
}
```

- ポイント：`message = exception.message;` の行を**削除**するだけ。`message` 初期値（24行目付近の `'内部サーバーエラーが発生しました'`）と `status=500` / `error_code='INTERNAL_ERROR'` がそのまま使われる。
- `logger.error` は**残す**（運用・障害調査のため詳細とスタックはログに必要）。

### （任意・推奨の追加改善）Prisma既知エラーの分類
今回の主目的（漏洩防止）には不要だが、ついでに対応してよい場合のみ：
- `PrismaClientKnownRequestError` を判定し、`P2002`（一意制約）→409 `CONFLICT`、`P2025`（対象なし）→404 `NOT_FOUND` 等にマッピングすると、500の汎用化で潰れるケースを適切なHTTPステータスにできる。
- ただし**メッセージは引き続き汎用化**し、Prismaの生文を露出しないこと。`error.meta` 等も返さない。
- 影響範囲が広がるため、自信がなければ本項はスキップし主目的のみ実施。

---

## 2. テスト観点（必須）

`apps/api` に既存のテスト基盤（Jest）がある前提。フィルタ単体の `ArgumentsHost` をモックして検証する。

1. **想定外の内部例外**：`new Error('Authentication failed ... credentials for sinmirai ...')` を投げる
   - レスポンス `message === '内部サーバーエラーが発生しました'`（生メッセージを**含まない**こと）
   - `status === 500`、`error_code === 'INTERNAL_ERROR'`、`result === 'ng'`
   - 生メッセージ文字列がレスポンスJSONに**出現しない**ことを明示的にアサート（`expect(JSON.stringify(res)).not.toContain('credentials')`）
   - `logger.error` がスタック付きで呼ばれること（spyで確認）
2. **HttpException（回帰確認）**：`new UnauthorizedException('メールアドレスまたはパスワードが正しくありません')`
   - `message` がそのまま返る（=業務メッセージは従来どおり表示される）／`status===401`／`error_code==='UNAUTHORIZED'`
3. **バリデーション（回帰確認）**：`BadRequestException` の `message` 配列がカンマ連結で返る既存挙動が維持されること

---

## 3. 手元検証（デプロイ前）

```bash
cd apps/api
npx jest http-exception   # 追加した単体テストが緑
```

- ローカルでDBを止めた状態（または誤ったDATABASE_URLを一時設定）でログインAPIを叩き、レスポンスが汎用メッセージになることを目視確認してもよい。

## 4. 完了の定義
- 上記単体テストが追加・パス
- 非HttpExceptionでクライアントに生メッセージが出ない／HttpExceptionの業務メッセージは従来どおり
- サーバーログには詳細（メッセージ＋スタック）が残る
- 本番デプロイ後、ログイン画面に内部メッセージが露出しないことを確認（DBエラーは再現困難なため、任意で一時的に内部例外を投げる検証用ルートで確認 → 検証後に必ず削除）

---

## 5. 注意
- 本フィルタは `[apps/api/src/main.ts](../../apps/api/src/main.ts)` の `useGlobalFilters` で全体適用される。挙動変更は全エンドポイントに波及するため、HttpException経路の回帰（特にバリデーション・401）を必ず確認すること。
- レスポンスの統一形式 `{ result, error_code, message }` は仕様書準拠。**形は変えない**（message文言のみ汎用化）。
