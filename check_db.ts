import { prisma } from './src/db/index.js';

async function main() {
  const users = await prisma.user.findMany({
    include: {
      accounts: true,
    },
  });
  console.log(JSON.stringify(users, null, 2));
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
