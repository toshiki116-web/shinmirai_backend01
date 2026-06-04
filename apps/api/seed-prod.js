const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_INITIAL_EMAIL || 'kushida@artifice-inc.com').replace(/[\r\n]+$/, '');

  const existing = await prisma.admin.findUnique({
    where: { email },
  });

  if (existing) {
    await prisma.admin.update({
      where: { email },
      data: {
        loginId: existing.loginId || 'sinmirai-admin',
        role: 'master',
        isActive: true,
      },
    });
    console.log('seed: admin already exists; ensured master role');
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
      email,
      password: hashedPassword,
      name: 'System Administrator',
      role: 'master',
      isActive: true,
    },
  });

  console.log('seed: initial admin created');
}

main()
  .catch((error) => {
    console.error('seed error:', error && error.message);
  })
  .finally(() => prisma.$disconnect());
