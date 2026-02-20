import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";
import path from "path";

const dbPath = `file:${path.join(process.cwd(), "prisma/dev.db")}`;
const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter } as any);

const DEFAULT_PASSWORD = "changeme123";

async function main() {
    console.log("🌱 Seeding database...");

    const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    // Clear existing data
    await prisma.activityLog.deleteMany();
    await prisma.task.deleteMany();
    await prisma.screenshot.deleteMany();
    await prisma.timeLog.deleteMany();
    await prisma.user.deleteMany();

    const fazeelHash = await bcrypt.hash("264378", 10);

    const fazeel = await prisma.user.create({
        data: { name: "Fazeel Azeez", email: "fazeel@gallery.vision", role: "ADMIN", passwordHash: fazeelHash },
    });

    const alice = await prisma.user.create({
        data: { name: "Alice Johnson", email: "alice@gvstaff.com", role: "ADMIN", passwordHash: hash },
    });
    const bob = await prisma.user.create({
        data: { name: "Bob Martinez", email: "bob@gvstaff.com", role: "STAFF", passwordHash: hash },
    });
    const carol = await prisma.user.create({
        data: { name: "Carol White", email: "carol@gvstaff.com", role: "STAFF", passwordHash: hash },
    });

    const now = new Date();
    const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
    const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

    // Fazeel: Just started
    await prisma.timeLog.createMany({
        data: [
            { userId: fazeel.id, type: "START", currentTask: "System check", timestamp: hoursAgo(1) },
        ],
    });

    // Alice: Working (after break)
    await prisma.timeLog.createMany({
        data: [
            { userId: alice.id, type: "START", currentTask: "Reviewing Q1 reports", timestamp: hoursAgo(5) },
            { userId: alice.id, type: "BREAK_START", currentTask: "Reviewing Q1 reports", timestamp: hoursAgo(3) },
            { userId: alice.id, type: "BREAK_END", currentTask: "Finalising budget spreadsheet", timestamp: hoursAgo(2.5) },
        ],
    });

    // Bob: On Break
    await prisma.timeLog.createMany({
        data: [
            { userId: bob.id, type: "START", currentTask: "Building new onboarding flow", timestamp: hoursAgo(4) },
            { userId: bob.id, type: "BREAK_START", currentTask: "Building new onboarding flow", timestamp: minutesAgo(20) },
        ],
    });

    // Carol: Offline (yesterday + today history)
    await prisma.timeLog.createMany({
        data: [
            { userId: carol.id, type: "START", currentTask: "Customer support tickets", timestamp: hoursAgo(6) },
            { userId: carol.id, type: "STOP", currentTask: "Customer support tickets", timestamp: hoursAgo(1) },
        ],
    });

    // Seed some tasks for each user (today + a few past days)
    const daysAgo = (d: number) => { const dt = new Date(); dt.setDate(dt.getDate() - d); dt.setHours(10, 0, 0, 0); return dt; };

    await prisma.task.createMany({
        data: [
            { userId: fazeel.id, title: "System check", note: "Checking admin access", date: daysAgo(0) },
            { userId: alice.id, title: "Reviewing Q1 reports", note: "Done with finance section", date: daysAgo(0) },
            { userId: alice.id, title: "Finalising budget spreadsheet", note: "", date: daysAgo(0) },
            { userId: alice.id, title: "Team standup prep", note: "Check Notion board", date: daysAgo(1) },
            { userId: alice.id, title: "HR onboarding documents", note: "", date: daysAgo(2) },
            { userId: bob.id, title: "Building new onboarding flow", note: "Design review pending", date: daysAgo(0) },
            { userId: bob.id, title: "Fix nav bug in dashboard", note: "", date: daysAgo(1) },
            { userId: carol.id, title: "Customer support tickets", note: "Closed 12 tickets", date: daysAgo(0) },
            { userId: carol.id, title: "Update FAQ page", note: "", date: daysAgo(3) },
        ],
    });

    // Screenshots for Alice
    for (let i = 0; i < 6; i++) {
        await prisma.screenshot.create({
            data: {
                userId: alice.id,
                imageUrl: `https://picsum.photos/seed/alice${i}/1280/720`,
                taskAtTheTime: i < 3 ? "Reviewing Q1 reports" : "Finalising budget spreadsheet",
                timestamp: minutesAgo(60 - i * 10),
            },
        });
    }

    console.log("✅ Seed complete!");
    console.log(`   Default password: ${DEFAULT_PASSWORD}`);
    console.log(`   Fazeel (admin): fazeel@gallery.vision / 264378`);
    console.log(`   Alice (admin): alice@gvstaff.com`);
    console.log(`   Bob   (staff): bob@gvstaff.com`);
    console.log(`   Carol (staff): carol@gvstaff.com`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
