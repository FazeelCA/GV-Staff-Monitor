/**
 * clear-test-data.ts
 *
 * Deletes all Screenshot and ActivityLog records from the database,
 * and removes associated image files from local disk storage.
 *
 * Run on the server with:
 *   npx ts-node -r dotenv/config src/clear-test-data.ts
 */

import { prisma } from "./lib/prisma";
import fs from "fs";
import path from "path";

async function main() {
    console.log("=== GV Staff Monitor — Test Data Cleanup ===\n");

    // ── 1. Read all screenshot URLs before deleting ───────────────────────────
    const screenshots = await prisma.screenshot.findMany({
        select: { id: true, imageUrl: true },
    });

    console.log(`Found ${screenshots.length} screenshot records.`);

    // ── 2. Delete image files from local disk ────────────────────────────────
    const baseUploadsDir =
        process.env.STORAGE_PATH ||
        path.join(__dirname, "../../uploads/screenshots");

    let filesDeleted = 0;
    for (const s of screenshots) {
        try {
            const filename = path.basename(new URL(s.imageUrl).pathname);
            const localPath = path.join(baseUploadsDir, filename);
            if (fs.existsSync(localPath)) {
                fs.unlinkSync(localPath);
                filesDeleted++;
            }
        } catch {
            // Malformed URL or missing file — safe to skip
        }
    }
    console.log(`Deleted ${filesDeleted} image files from disk.`);

    // ── 3. Wipe Screenshot table ──────────────────────────────────────────────
    const { count: screenshotsDeleted } = await prisma.screenshot.deleteMany({});
    console.log(`Deleted ${screenshotsDeleted} Screenshot rows from database.`);

    // ── 4. Wipe ActivityLog table ─────────────────────────────────────────────
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
