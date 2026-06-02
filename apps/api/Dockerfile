FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY apps/api/ apps/api/
COPY packages/shared/ packages/shared/

RUN pnpm install --frozen-lockfile || pnpm install

WORKDIR /app/apps/api
RUN npx prisma generate
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app

COPY --from=builder /app ./

WORKDIR /app/apps/api
EXPOSE 3000
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node seed-prod.js && node dist/main"]
