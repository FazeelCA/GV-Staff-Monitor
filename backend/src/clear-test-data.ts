/**
 * clear-test-data.ts
 * 
 * Deletes all Screenshot and ActivityLog records from the database,
 * and removes the associated image files from local disk storage.
 *
 * Run on the server with:
 *   npx ts-node src/clear-test-data.ts
 */

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function main() {
    console.log("=== GV Staff Monitor — Test Data Cleanup ===\n");

    // ── 1. Delete screenshot files from disk ─────────────────────────────────
    const screenshots = await prisma.screenshot.findMany({
        select: { id: true, imageUrl: true },
    });

    console.log(`Found ${screenshots.length} screenshot records.`);

    let filesDeleted = 0;
    const baseUploadsDir =
        process.env.STORAGE_PATH ||
        path.join(__dirname, "../../uploads/screenshots");

    for (const s of screenshots) {
        try {
            // imageUrl is like https://track.gallerydigital.in/uploads/screenshots/uuid.webp
            const filename = path.basename(new URL(s.imageUrl).pathname);
            const localPath = path.join(baseUploadsDir, filename);
            if (fs.existsSync(localPath)) {
                fs.unlinkSync(localPath);
                filesDeleted++;
            }
        } catch {
            // URL parse may fail for old/malformed entries — safe to skip
        }
    }
    console.log(`Deleted ${filesDeleted} image files from disk.`);

    // ── 2. Wipe Screenshot table ──────────────────────────────────────────────
    const { count: screenshotsDeleted } = await prisma.screenshot.deleteMany({});
    console.log(`Deleted ${screenshotsDeleted} Screenshot rows from database.`);

    // ── 3. Wipe ActivityLog table ─────────────────────────────────────────────
    const { count: activitiesDeleted } = await prisma.activityLog.deleteMany({});
    console.log(`Deleted ${activitiesDeleted} ActivityLog rows from database.`);

    console.log("\n✅ Done — all test screenshots and activity logs cleared.");
}

main()
    .catch((e) => {
        console.error("Error:", e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
