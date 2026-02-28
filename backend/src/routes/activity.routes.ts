
import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authenticateToken } from "../middleware/authenticate";

const router = Router();

// POST /api/activity/log
router.post("/log", authenticateToken, async (req: Request, res: Response) => {
    try {
        const { userId, title, appName, url } = req.body;

        if (!userId) {
            res.status(400).json({ error: "userId required" });
            return;
        }

        const now = new Date();

        // 1. Find last activity for this user
        const lastActivity = await prisma.activityLog.findFirst({
            where: { userId },
            orderBy: { startTime: 'desc' }
        });

        // 2. Check if same activity and recent (< 10 seconds gap allowed)
        // If the last activity was updated 5 seconds ago, and we get the same signal now.
        const timeDiff = lastActivity?.endTime
            ? now.getTime() - lastActivity.endTime.getTime()
            : (lastActivity ? now.getTime() - lastActivity.startTime.getTime() : 999999);

        const isSameActivity = lastActivity &&
            lastActivity.title === title &&
            lastActivity.appName === appName &&
            timeDiff < 20000; // 20 seconds tolerance

        if (isSameActivity) {
            // Update the existing activity
            const newDuration = Math.round((now.getTime() - lastActivity!.startTime.getTime()) / 1000);
            await prisma.activityLog.update({
                where: { id: lastActivity!.id },
                data: {
                    endTime: now,
                    duration: newDuration
                }
            });
            res.json({ status: "updated", id: lastActivity!.id });
        } else {
            // Create new activity
            const newLog = await prisma.activityLog.create({
                data: {
                    userId,
                    title,
                    appName,
                    url,
                    startTime: now,
                    endTime: now,
                    duration: 0
                }
            });
            res.json({ status: "created", id: newLog.id });
        }
    } catch (e: any) {
        console.error("Activity log error:", e);
        res.status(500).json({ error: e.message });
    }
});

// GET /api/activity/:userId
router.get("/:userId", authenticateToken, async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const { date, startDate, endDate } = req.query as { date?: string, startDate?: string, endDate?: string };

        const where: any = { userId };

        if (startDate && endDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            where.startTime = {
                gte: start,
                lte: end
            };
        } else if (date) {
            const queryDate = new Date(date);
            const nextDay = new Date(queryDate);
            nextDay.setDate(queryDate.getDate() + 1);
            where.startTime = {
                gte: queryDate,
                lt: nextDay
            };
        } else {
            // Default to today
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            where.startTime = { gte: today };
        }

        const logs = await prisma.activityLog.findMany({
            where,
            orderBy: { startTime: "desc" },
            take: 500
        });

        res.json(logs);
    } catch (e: any) {
        console.error("Get activity error:", e);
        res.status(500).json({ error: e.message });
    }
});

export default router;
