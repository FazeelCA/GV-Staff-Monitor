import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

export function startAutoDeleteCron() {
    // Run everyday at 2:00 AM server time
    cron.schedule("0 2 * * *", async () => {
        console.log("Running 60-day auto-delete cron job for screenshots...");
        try {
            const sixtyDaysAgo = new Date();
            sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

            // Find all screenshots older than 60 days
            const oldScreenshots = await prisma.screenshot.findMany({
                where: {
                    timestamp: {
                        lt: sixtyDaysAgo
                    }
                }
            });

            if (oldScreenshots.length === 0) {
                console.log("No screenshots found older than 60 days.");
                return;
            }

            console.log(`Found ${oldScreenshots.length} screenshots to auto-delete.`);

            const baseUploadsDir = process.env.STORAGE_PATH || path.join(__dirname, "../../../uploads");
            const screenshotsDir = process.env.STORAGE_PATH ? baseUploadsDir : path.join(baseUploadsDir, "screenshots");

            let deletedCount = 0;

            for (const screenshot of oldScreenshots) {
                // Delete physical file
                const filename = screenshot.imageUrl.split("/").pop(); // extract uuid.webp

                if (filename) {
                    const localPath = path.join(screenshotsDir, filename);
                    try {
                        if (fs.existsSync(localPath)) {
                            await fs.promises.unlink(localPath);
                        }
                    } catch (err) {
                        console.error(`Failed to delete physical file for screenshot ${screenshot.id}:`, err);
                    }
                }

                // Delete from DB
                await prisma.screenshot.delete({
                    where: { id: screenshot.id }
                });

                deletedCount++;
            }

            console.log(`Successfully deleted ${deletedCount} old screenshots from storage and database.`);

        } catch (error) {
            console.error("Critical error in auto-delete cron job:", error);
        }
    });

    console.log("Auto-delete cron job scheduled (runs daily at 2:00 AM).");
}
