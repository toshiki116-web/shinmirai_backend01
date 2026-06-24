# 指示書: 右上メニューからログアウトできない (BUG-006)

## 対象
`apps/web`（フロントのみ。API・DB変更なし）

## 症状
管理画面ヘッダー右上のユーザーメニュー（アバター＋氏名）を開き「ログアウト」を押しても、
ログアウトされない（メニューが閉じるだけ）。サイドバー下部の「ログアウト」は正常に動作する。

## 根本原因
ドロップダウンは Base UI（`@base-ui/react` v1.5）で実装されている
（`apps/web/src/components/ui/dropdown-menu.tsx` → `@base-ui/react/menu`）。

Base UI の `Menu.Item` のクリックハンドラは **`onClick`** であり、`onSelect` というプロパティは存在しない
（型定義: `apps/web/node_modules/@base-ui/react/menu/item/MenuItem.d.ts` の `MenuItemProps` に `onClick` のみ）。

ところが `apps/web/src/components/layout/header.tsx:43` は Radix UI 流の `onSelect` を渡しているため、
このハンドラは未知のプロパティとして下層 `<div>` にそのまま透過し、DOM ネイティブの `onSelect`
（テキスト選択イベント）として解釈される。クリックでは発火しないため `logout()` が一切呼ばれない。

対照的にサイドバー（`apps/web/src/components/layout/app-sidebar.tsx:127`）は `onClick={() => { void logout() }}`
を使っており正常。これが「右上だけ効かない」症状と一致する。

## プロフィール項目について
ヘッダーの「プロフィール」項目（`header.tsx:39-42`）はハンドラもリンクも無く、遷移先ルート `/profile` も
存在しない非機能の飾り。ユーザー判断により**今回は一旦メニューから削除**する（後日プロフィール機能を
追加する際に復活させる）。

## 修正内容
ファイル: `apps/web/src/components/layout/header.tsx`

1. ログアウト項目のハンドラを `onSelect` → `onClick` に変更する。
   ```tsx
   // 修正前
   <DropdownMenuItem className="text-destructive" onSelect={() => { void logout() }}>
   // 修正後
   <DropdownMenuItem className="text-destructive" onClick={() => { void logout() }}>
   ```
   - `Menu.Item` は既定で `closeOnClick: true` のため、クリックでハンドラ発火＋メニュー自動クローズ。
     `logout()` 内で `window.location.href = "/login"` 遷移するため追加処理は不要。

2. 「プロフィール」項目（`<DropdownMenuItem>` の User アイコン＋「プロフィール」）を削除する。

3. 上記でアイコン `User` が未使用になるため、`lucide-react` の import から `User` を外す
   （`import { LogOut } from "lucide-react"` に変更）。`LogOut` は引き続き使用。

## やってはいけないこと
- `dropdown-menu.tsx`（共通UIラッパ）は変更しない。原因は呼び出し側の prop 名のみ。
- API（`auth.controller` / `auth.service`）・`auth-context.tsx` の `logout()` 実装は変更しない（正しく動作している）。
- サイドバーのログアウト（`app-sidebar.tsx`）は変更しない（既に `onClick` で正常）。
- 新規の `/profile` ルートやプロフィールページは作らない（今回はスコープ外）。

## 検証手順（手動）
フロントに自動テスト基盤が無いため手動再現/回帰で代替。

- **再現（修正前）**: ログイン → 右上アバターをクリック → 「ログアウト」をクリック → 何も起きない（メニューが閉じるだけ、`/login` に遷移しない）。
- **修正後の確認**:
  1. ログイン → 右上アバターをクリック → メニューに「ログアウト」のみ表示（「プロフィール」は無い）。
  2. 「ログアウト」をクリック → `/login` に遷移し、再アクセス時に未ログイン状態になる（localStorage の `sinmirai_admin`・トークンが消える）。
  3. サイドバー下部の「ログアウト」も従来どおり動作することを確認（回帰なし）。
- **回帰ガード（静的）**: `header.tsx` に `onSelect` が残っていないこと（grep）。ヘッダーメニューのログアウトは `onClick` であること。

## BUGS.md 追記（BUG-006）
`BUGS.md` 末尾に以下を追記する（テンプレートは `~/.claude/guides/bug-fix.md` 準拠）。

```markdown
## BUG-006: 右上ユーザーメニューの「ログアウト」が効かない

- **発生日**: 2026-06-24
- **修正日**: 2026-06-24
- **修正コミット**: 本コミット（`[fix] ... (BUG-006)`）
- **症状**: 管理画面ヘッダー右上のユーザーメニューから「ログアウト」を押しても何も起きない（サイドバーのログアウトは正常）。
- **原因**: ドロップダウンは Base UI（`@base-ui/react`）実装で、`Menu.Item` のクリックハンドラは `onClick`。`header.tsx` が Radix 流の `onSelect` を渡していたため、DOM ネイティブの `onSelect`（テキスト選択イベント）として透過しクリックで発火せず、`logout()` が呼ばれていなかった。
- **修正内容**: `apps/web/src/components/layout/header.tsx` のログアウト項目を `onSelect` → `onClick` に変更。併せて非機能の「プロフィール」項目（遷移先 `/profile` 未実装）を一旦削除し、未使用の `User` import を除去。
- **再現テスト**: 自動テスト基盤が無いため手動再現/回帰で代替（指示書 `docs/features/fix-header-logout-plan.md` 参照）。
- **再発防止策**: Base UI の `Menu.Item` は `onClick` を使うことを徹底（`onSelect` は Radix のAPIで Base UI では発火しない）。`header.tsx` に `onSelect` が残っていないことを静的grepで確認。
```

## コミット
- `[fix] 右上メニューからログアウトできない不具合を修正 (BUG-006)`
- 修正と BUGS.md 追記は同一コミットで可（緊急ホットフィックスではないため）。

## デプロイ
- web のみ。API 変更が無いためデプロイ順序の制約なし（`forbidNonWhitelisted` 等の影響なし）。
