const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const sessions = await prisma.session.findMany({ where: { end_time: null } });
  console.log(JSON.stringify(sessions, null, 2));
}

main().finally(() => prisma.$disconnect());
