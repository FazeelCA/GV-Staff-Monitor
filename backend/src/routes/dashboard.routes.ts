import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authenticateToken } from "../middleware/authenticate";

const router = Router();

// Apply middleware to all routes in this router
router.use(authenticateToken);

// Helper: derive current status from latest time log and ping
function deriveStatus(latestType?: string, lastActiveAt?: Date): "Working" | "On Break" | "Online" | "Offline" {
    const threeMinsAgo = new Date(Date.now() - 3 * 60 * 1000);
    const isRecentlyActive = lastActiveAt && lastActiveAt >= threeMinsAgo;

    // If we haven't seen a ping in 3 minutes, they are offline regardless of tracking state
    if (!isRecentlyActive) return "Offline";

    if (latestType === "START" || latestType === "BREAK_END") return "Working";
    if (latestType === "BREAK_START") return "On Break";

    // If recently active but not working/on break (e.g. tracking is STOPped but app is open)
    return "Online";
}

// GET /api/dashboard/users
router.get("/users", async (req: Request, res: Response) => {
    try {
        const { date, startDate, endDate } = req.query as { date?: string; startDate?: string; endDate?: string };
        let today: Date, tomorrow: Date;

        if (startDate && endDate) {
            const startParts = startDate.split('-');
            today = new Date(parseInt(startParts[0], 10), parseInt(startParts[1], 10) - 1, parseInt(startParts[2], 10));

            const endParts = endDate.split('-');
            tomorrow = new Date(parseInt(endParts[0], 10), parseInt(endParts[1], 10) - 1, parseInt(endParts[2], 10));
            tomorrow.setDate(tomorrow.getDate() + 1);
        } else if (date) {
            const parts = date.split('-');
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            today = new Date(year, month, day);
            tomorrow = new Date(year, month, day + 1);
        } else {
            today = new Date();
            today.setHours(0, 0, 0, 0);
            tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);
        }

        const users = await prisma.user.findMany({
            where: {
                role: {
                    not: "ADMIN",
                },
            },
            include: {
                timeLogs: {
                    where: { timestamp: { gte: today, lt: tomorrow } },
                    orderBy: { timestamp: "asc" },
                },
                screenshots: {
                    where: { timestamp: { gte: today, lt: tomorrow } },
                    orderBy: { timestamp: "asc" },
                    select: { id: true, hash: true, timestamp: true },
                },
            },
        });

        const result = users.map((user) => {
            const logs = user.timeLogs;
            const latestLog = logs[logs.length - 1];

            // Calculate total worked hours
            let totalMs = 0;
            let workStart: Date | null = null;

            for (const log of logs) {
                if ((log.type === "START" || log.type === "BREAK_END") && !workStart) {
                    workStart = log.timestamp;
                } else if (
                    (log.type === "BREAK_START" || log.type === "STOP") &&
                    workStart
                ) {
                    totalMs += log.timestamp.getTime() - workStart.getTime();
                    workStart = null;
                }
            }

            // If still working (no STOP/BREAK_START yet)
            if (workStart && latestLog?.type !== "BREAK_START" && latestLog?.type !== "STOP") {
                const now = Date.now();
                const lastPing = user.lastActiveAt ? user.lastActiveAt.getTime() : now;
                const isOffline = now - lastPing > 3 * 60 * 1000;

                // If offline, cap the work time at the last seen ping
                const effectiveEnd = isOffline ? lastPing : now;
                if (effectiveEnd > workStart.getTime()) {
                    totalMs += effectiveEnd - workStart.getTime();
                }
            }

            const firstStartLog = logs.find(l => l.type === "START");

            const checkedInHours = Math.round((totalMs / 3_600_000) * 100) / 100;

            // Calculate static time from screenshots
            let totalStaticMs = 0;
            const shots = user.screenshots;
            for (let i = 1; i < shots.length; i++) {
                const prev = shots[i - 1];
                const curr = shots[i];
                if (curr.hash && prev.hash && curr.hash === prev.hash) {
                    const diff = curr.timestamp.getTime() - prev.timestamp.getTime();
                    // Cap static deduction to 15 minutes between two screenshots to avoid huge gaps
                    if (diff > 0 && diff <= 15 * 60 * 1000) {
                        totalStaticMs += diff;
                    }
                }
            }

            const workedMs = Math.max(0, totalMs - totalStaticMs);
            const workedHours = Math.round((workedMs / 3_600_000) * 100) / 100;

            return {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: deriveStatus(latestLog?.type, user.lastActiveAt),
                currentTask: latestLog?.currentTask || "",
                totalHoursToday: checkedInHours, // Keep for backward compatibility or rename? Let's rename in frontend if possible, but keep here as fallback.
                totalCheckedInHoursToday: checkedInHours,
                totalWorkedHoursToday: workedHours,
                expectedStartTime: user.expectedStartTime,
                firstStartTime: firstStartLog ? firstStartLog.timestamp.toISOString() : null,
            };
        });

        res.json(result);
    } catch (err: any) {
        console.error("dashboard/users error:", err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/dashboard/all-screenshots
router.get("/all-screenshots", async (req: Request, res: Response) => {
    try {
        const { userId, date, startDate, endDate, page, limit, activityFilter } = req.query as any;
        const pageNum = parseInt(page as string) || 1;
        const limitNum = parseInt(limit as string) || 20;
        const skip = (pageNum - 1) * limitNum;

        const where: any = {};

        if (userId && userId !== 'ALL') {
            where.userId = userId;
        }

        if (activityFilter === 'Low Activity') {
            where.OR = [
                { activityCount: { lt: 50 } },
                { activityCount: null }
            ];
        }

        if (startDate && endDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            where.timestamp = {
                gte: start,
                lte: end
            };
        } else if (date) {
            const queryDate = new Date(date);
            const nextDay = new Date(queryDate);
            nextDay.setDate(queryDate.getDate() + 1);
            where.timestamp = {
                gte: queryDate,
                lt: nextDay
            };
        } else {
            // Default to today if no date provided? Or last 7 days? 
            // Let's default to today for performance, or allow fetching all if explicitly requested?
            // User asked for "check entire screenshots". 
            // Let's NOT limit by default if no date is provided, but maybe limit 'take'.
            // Actually, usually admin wants to see today's activity by default.
            // Let's stick to optional date filter. If not provided, fetch recent 100?
        }

        const screenshots = await prisma.screenshot.findMany({
            where,
            include: {
                user: {
                    select: { name: true, email: true }
                }
            },
            orderBy: { timestamp: "desc" },
            skip,
            take: limitNum,
        });

        res.json(screenshots);
    } catch (err: any) {
        console.error("dashboard/all-screenshots error:", err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/dashboard/screenshots/:userId
router.get("/screenshots/:userId", async (req: Request, res: Response) => {
    try {
        const { userId } = req.params as { userId: string };
        const { date, startDate, endDate, page, limit } = req.query as any;
        const pageNum = parseInt(page as string) || 1;
        const limitNum = parseInt(limit as string) || 20;
        const skip = (pageNum - 1) * limitNum;

        const where: any = { userId };

        if (startDate && endDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            where.timestamp = {
                gte: start,
                lte: end
            };
        } else if (date) {
            const queryDate = new Date(date);
            const nextDay = new Date(queryDate);
            nextDay.setDate(queryDate.getDate() + 1);
            where.timestamp = {
                gte: queryDate,
                lt: nextDay
            };
        } else {
            // Default to today if no date provided, to match previous behavior 
            // OR maybe return all if no filter? 
            // The previous code defaulted to "today". Let's keep it specific to "today" by default 
            // unless we want to load "all history" which might be heavy.
            // Actually, let's default to today to keep initial load light.
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);
            where.timestamp = { gte: today, lt: tomorrow };
        }

        const screenshots = await prisma.screenshot.findMany({
            where,
            orderBy: { timestamp: "desc" },
            skip,
            take: limitNum,
        });

        res.json(screenshots);
    } catch (err: any) {
        console.error("dashboard/screenshots error:", err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
