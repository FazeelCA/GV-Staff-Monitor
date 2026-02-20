import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authenticateToken } from "../middleware/authenticate";

const router = Router();

// Apply middleware to all routes in this router
router.use(authenticateToken);

// Helper: derive current status from latest time log and ping
function deriveStatus(latestType?: string, lastActiveAt?: Date): "Working" | "On Break" | "Online" | "Offline" {
    if (!lastActiveAt) return "Offline";

    const threeMinsAgo = new Date(Date.now() - 3 * 60 * 1000);
    if (lastActiveAt < threeMinsAgo) return "Offline";

    if (latestType === "START" || latestType === "BREAK_END") return "Working";
    if (latestType === "BREAK_START") return "On Break";

    return "Online";
}

// GET /api/dashboard/users
router.get("/users", async (_req: Request, res: Response) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

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

            const totalHours = Math.round((totalMs / 3_600_000) * 100) / 100;

            return {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: deriveStatus(latestLog?.type, user.lastActiveAt),
                currentTask: latestLog?.currentTask || "",
                totalHoursToday: totalHours,
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
        const { userId, date } = req.query as { userId?: string; date?: string };

        const where: any = {};

        if (userId && userId !== 'ALL') {
            where.userId = userId;
        }

        if (date) {
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
            take: 200 // Limit to avoid crashing
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
        const { date } = req.query as { date?: string };

        const where: any = { userId };

        if (date) {
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
            orderBy: { timestamp: "asc" },
        });

        res.json(screenshots);
    } catch (err: any) {
        console.error("dashboard/screenshots error:", err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
