import * as dotenv from 'dotenv';
dotenv.config();
import { deleteFile } from './src/lib/storage.ts';
import { prisma } from './src/lib/prisma.ts';

async function wipeData() {
    console.log('Starting data wipe process...');

    try {
        // 1. Fetch and delete all physical screenshot files
        const screenshots = await prisma.screenshot.findMany({
            select: { imageUrl: true }
        });

        console.log(`Found ${screenshots.length} screenshots to delete from disk.`);

        let deletedFiles = 0;
        for (const s of screenshots) {
            try {
                await deleteFile(s.imageUrl);
                deletedFiles++;
            } catch (err) {
                console.error(`Failed to delete file ${s.imageUrl}:`, err);
            }
        }
        console.log(`Successfully deleted ${deletedFiles} physical screenshot files.`);

        // 2. Wipe database tables (order matters for foreign keys, though Cascade handles most)
        console.log('Wiping database records...');

        await prisma.activityLog.deleteMany({});
        console.log('- Activity Logs deleted');

        await prisma.timeLog.deleteMany({});
        console.log('- Time Logs deleted');

        await prisma.screenshot.deleteMany({});
        console.log('- Screenshots (DB records) deleted');

        await prisma.adminMessage.deleteMany({});
        console.log('- Admin Messages deleted');

        await prisma.task.deleteMany({});
        console.log('- Tasks deleted');

        // Reset user stats if applicable
        await prisma.user.updateMany({
            data: {
                lastActiveAt: new Date()
            }
        });
        console.log('- User stats reset (users kept intact)');

        console.log('\\n✅ Data wipe completed successfully.');
        console.log('All historical data is gone, the system is ready for the new start.');

    } catch (error) {
        console.error('Error during data wipe:', error);
    } finally {
        await prisma.$disconnect();
    }
}

wipeData();
