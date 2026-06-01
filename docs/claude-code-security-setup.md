# Claude Code セキュリティ設定 セットアップ指示書

このファイルは Claude Code に読み込ませて実行させるための指示書です。
以下の手順をすべて実行してください。

---

## 前提条件
- この指示書はプロジェクトのセキュリティ管理者が作成したものです
- ユーザー（開発メンバー）の許可のもとで実行してください
- 既存の設定がある場合は上書きではなくマージしてください

---

## 手順1: settings.json の設定（ignorePaths）

`~/.claude/settings.json` を確認し、`ignorePaths` に以下のパターンが**すべて含まれている**状態にしてください。
既にファイルが存在し、他の設定や既存の ignorePaths がある場合は**マージ**してください（既存の設定を消さないこと）。

追加が必要な ignorePaths:
```json
"ignorePaths": [
  "**/.env",
  "**/.env.*",
  "**/.env.local",
  "**/.env.production",
  "**/.env.development",
  "**/*.pem",
  "**/*.key",
  "**/*.p12",
  "**/*credentials*",
  "**/*secret*",
  "**/docker-compose.override.yml",
  "**/.claude/file-history/**"
]
```

手順:
1. `~/.claude/settings.json` を読み取る（存在しない場合は新規作成）
2. 既存の `ignorePaths` がある場合、上記パターンのうち不足しているものだけを追加する
3. `ignorePaths` 以外の既存設定（permissions等）は一切変更しない
4. 変更後の内容をユーザーに表示して確認を得てから書き込む

---

## 手順2: file-history の削除

`~/.claude/file-history/` 内のバックアップファイルを削除してください。

手順:
1. `~/.claude/file-history/` の中身を確認（ファイル数・サイズを表示）
2. ユーザーに削除確認を求める
3. 承認を得たら `rm -rf ~/.claude/file-history/*` を実行
4. 削除後に空であることを確認して報告

---

## 手順3: CLAUDE.md の配置確認

このプロジェクトのリポジトリルートに `CLAUDE.md` が存在することを確認してください。
また、親ディレクトリ（リポジトリの1つ上）にも汎用 `CLAUDE.md` が配置されている必要があります。

確認項目:
1. リポジトリルートの `CLAUDE.md` に `PROJECT_ID` が `sinmirai` と定義されていること
2. 親ディレクトリの `CLAUDE.md` に「セキュリティ・信頼境界ルール」セクションが存在すること
3. 両方が存在すれば「設定済み」と報告
4. 親ディレクトリに汎用 `CLAUDE.md` がない場合、リポジトリルートの `CLAUDE.md` にセキュリティルールが含まれているか確認し、結果を報告

---

## 手順4: 設定結果の報告

すべての手順が完了したら、以下の形式で結果を報告してください:

```
セキュリティ設定結果:
- settings.json ignorePaths: [OK/追加済み/既に設定済み]（パターン数: XX個）
- file-history 削除: [OK/スキップ]（削除ファイル数: XX個）
- CLAUDE.md（リポジトリ）: [OK/未配置]
- CLAUDE.md（親ディレクトリ）: [OK/未配置]
```
