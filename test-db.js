const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const users = await prisma.user.findMany({ take: 1 });
    console.log('Connection successful. User count:', users.length);
  } catch (e) {
    console.error('Connection failed:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
