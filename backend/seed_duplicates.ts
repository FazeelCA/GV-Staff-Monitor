
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "prisma/dev.db");
const adapter = new PrismaBetterSqlite3(new Database(dbPath));
const prisma = new PrismaClient({ adapter } as any);

async function main() {
    console.log("Seeding duplicate screenshots...");

    const user = await prisma.user.findFirst({ where: { email: "alice@gvstaff.com" } });
    if (!user) throw new Error("Alice not found");

    // Create a base screenshot
    const base = await prisma.screenshot.create({
        data: {
            userId: user.id,
            imageUrl: "https://picsum.photos/seed/static1/800/600",
            hash: "aabbcc112233", // Fake hash
            taskAtTheTime: "Static Work 1",
            timestamp: new Date()
        }
    });

    // Create a duplicate (same hash, slightly later)
    await prisma.screenshot.create({
        data: {
            userId: user.id,
            imageUrl: "https://picsum.photos/seed/static1/800/600",
            hash: "aabbcc112233", // SAME HASH
            taskAtTheTime: "Static Work 2",
            timestamp: new Date(Date.now() + 60000) // 1 min later
        }
    });

    console.log("Created 2 screenshots with identical hash 'aabbcc112233'");
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
