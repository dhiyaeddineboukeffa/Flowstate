const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  // Check if bob exists
  let bob = await prisma.user.findUnique({
    where: { username: "bob" },
  });

  if (!bob) {
    bob = await prisma.user.create({
      data: { username: "bob" },
    });
    console.log("Created user bob with ID:", bob.id);
  } else {
    console.log("User bob already exists with ID:", bob.id);
  }

  // Find all parent tasks that have no user_id
  const parentTasks = await prisma.parentTask.findMany({
    where: { user_id: null },
  });

  console.log(`Found ${parentTasks.length} tasks without a user.`);

  let updatedCount = 0;
  for (const task of parentTasks) {
    await prisma.parentTask.update({
      where: { id: task.id },
      data: { user_id: bob.id },
    });
    updatedCount++;
  }

  console.log(`Successfully migrated ${updatedCount} tasks to bob.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
