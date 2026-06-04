const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.admin.findUnique({
    where: { loginId: 'sinmirai-admin' },
  });

  if (existing) {
    console.log('seed: admin already exists; skipped');
    return;
  }

  const rawPassword = process.env.ADMIN_INITIAL_PASSWORD;
  if (!rawPassword) {
    console.error('seed: ADMIN_INITIAL_PASSWORD is not set; admin was not created');
    return;
  }

  const password = rawPassword.replace(/[\r\n]+$/, '');
  const hashedPassword = await bcrypt.hash(password, 10);

  await prisma.admin.create({
    data: {
      loginId: 'sinmirai-admin',
      password: hashedPassword,
      name: 'System Administrator',
    },
  });

  console.log('seed: initial admin created');
}

main()
  .catch((error) => {
    console.error('seed error:', error && error.message);
  })
  .finally(() => prisma.$disconnect());
