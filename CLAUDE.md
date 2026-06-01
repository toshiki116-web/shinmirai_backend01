# CLAUDE.md — 新・ミライ人間洗濯機 サーバーサイド

## PROJECT_ID
sinmirai

## プロジェクト概要
シン・ミライ人間洗濯機の管理基盤システム。拠点・筐体・動画コンテンツの一元管理と筐体端末からの監視・ログ受信を行う。

## 技術スタック
- API: NestJS (TypeScript) + Prisma ORM
- フロント: Next.js 14+ (React, App Router, Tailwind CSS, shadcn/ui)
- DB: PostgreSQL 15
- インフラ: AWS ECS Fargate + RDS + S3 + CloudFront
- モノレポ: pnpm workspaces + Turborepo

## 開発環境セットアップ
```bash
pnpm install
docker compose up -d postgres    # PostgreSQLをポート5433で起動
cd apps/api
./node_modules/.bin/prisma migrate dev
./node_modules/.bin/ts-node prisma/seed.ts
npx nest start --watch
```

## ディレクトリ構成
- `apps/api/` — NestJS APIサーバー
- `apps/web/` — Next.js管理画面（予定）
- `packages/shared/` — 共通型定義・Enum
- `docs/` — 仕様書

## API構成
- `/api/admin/*` — 管理画面用API（JWT認証）
- `/api/device/*` — 筐体向けAPI（device_token認証）
- `/api/auth/login` — 管理者ログイン
- `/api/health` — ヘルスチェック
- `/api/docs` — Swagger UI

## 注意事項
- ローカルにPostgreSQLが稼働している場合、ポート競合を避けるためDockerは5433ポートを使用
- .envファイルはapps/api/配下に配置
