
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    try {
        console.log("Checking ActivityLog model...");
        const count = await prisma.activityLog.count();
        console.log("ActivityLog count:", count);

        const logs = await prisma.activityLog.findMany();
        console.log("Logs:", logs);
    } catch (e) {
        console.error("Error:", e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
