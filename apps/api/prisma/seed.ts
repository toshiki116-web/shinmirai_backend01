import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const loginId = process.env.ADMIN_LOGIN_ID || 'admin';
  const email = process.env.ADMIN_INITIAL_EMAIL || process.env.ADMIN_EMAIL || 'admin@local.sinmirai.invalid';
  const password = process.env.ADMIN_PASSWORD || 'changeme';

  const hashedPassword = await bcrypt.hash(password, 10);

  const admin = await prisma.admin.upsert({
    where: { email },
    update: {
      loginId,
      role: 'master',
      isActive: true,
    },
    create: {
      loginId,
      email,
      password: hashedPassword,
      name: 'システム管理者',
      role: 'master',
      isActive: true,
    },
  });

  console.log(`初期管理者を作成しました: ${admin.email} (ID: ${admin.id})`);
}

main()
  .catch((e) => {
    console.error('シード実行エラー:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
