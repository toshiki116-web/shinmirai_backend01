const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.admin.findUnique({ where: { loginId: 'sinmirai-admin' } });
  if (existing) {
    console.log('シード: 管理者は既に存在します。スキップ。');
    return;
  }
  await prisma.admin.create({
    data: {
      loginId: 'sinmirai-admin',
      password: '$2b$10$C4AwAQrYJ4HKQb9ZX2rXYekHJaajJId8x3jmsOv8r85ZvB38U3wGy',
      name: 'システム管理者',
    },
  });
  console.log('シード: 初期管理者を作成しました');
}

main().catch(e => { console.error('シードエラー:', e); }).finally(() => prisma.$disconnect());
