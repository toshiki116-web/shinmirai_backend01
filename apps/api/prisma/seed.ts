import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const loginId = process.env.ADMIN_LOGIN_ID || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'changeme';

  const hashedPassword = await bcrypt.hash(password, 10);

  const admin = await prisma.admin.upsert({
    where: { loginId },
    update: {},
    create: {
      loginId,
      password: hashedPassword,
      name: 'システム管理者',
    },
  });

  console.log(`初期管理者を作成しました: ${admin.loginId} (ID: ${admin.id})`);
}

main()
  .catch((e) => {
    console.error('シード実行エラー:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
