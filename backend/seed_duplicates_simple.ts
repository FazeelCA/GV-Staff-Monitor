
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("Seeding duplicate screenshots...");

    const user = await prisma.user.findFirst({ where: { email: "alice@gvstaff.com" } });
    if (!user) throw new Error("Alice not found");

    // Create a base screenshot
    const timestamp = new Date();

    await prisma.screenshot.create({
        data: {
            userId: user.id,
            imageUrl: "https://picsum.photos/seed/static1/800/600",
            hash: "aabbcc112233", // Fake hash
            taskAtTheTime: "Static Work 1",
            timestamp: timestamp
        }
    });

    // Create a duplicate (same hash, slightly later)
    await prisma.screenshot.create({
        data: {
            userId: user.id,
            imageUrl: "https://picsum.photos/seed/static1/800/600",
            hash: "aabbcc112233", // SAME HASH
            taskAtTheTime: "Static Work 2",
            timestamp: new Date(timestamp.getTime() + 60000) // 1 min later
        }
    });

    console.log("Created 2 screenshots with identical hash 'aabbcc112233'");
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
