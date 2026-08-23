const { PrismaClient } = require('@prisma/client');
async function test() {
  const prisma = new PrismaClient();
  try {
    const res = await prisma.user.findFirst();
    console.log("SUCCESS", res);
  } catch (e) {
    console.error("ERROR", e.message);
  } finally {
    await prisma.$disconnect();
  }
}
test();
