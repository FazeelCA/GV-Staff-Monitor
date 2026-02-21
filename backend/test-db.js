const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const msgs = await prisma.adminMessage.findMany({ where: { isRead: false } });
    console.log(msgs);
}
main();
