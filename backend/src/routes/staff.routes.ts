import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import jwt from "jsonwebtoken";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "gv-staff-monitor-secret-2026";

interface JwtPayload { userId: string; email: string; role: string; }

function auth(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
    try {
        (req as any).user = jwt.verify(header.slice(7), JWT_SECRET) as JwtPayload;
        next();
    } catch {
        res.status(401).json({ error: "Invalid or expired token" });
    }
}

// GET /api/staff/history?days=10
router.get("/history", auth, async (req: Request, res: Response) => {
    try {
        const { userId } = (req as any).user as JwtPayload;
        const days = Math.min(parseInt(req.query.days as string || "10", 10), 30);

        const results: Array<{
            date: string;
            totalWorkedSeconds: number;
            tasks: { id: string; title: string; note: string }[];
            sessions: { type: string; timestamp: string; currentTask: string }[];
        }> = [];

        for (let i = 0; i < days; i++) {
            const day = new Date();
            day.setDate(day.getDate() - i);
            day.setHours(0, 0, 0, 0);
            const nextDay = new Date(day);
            nextDay.setDate(day.getDate() + 1);

            // Fetch time logs for this day
            const logs = await prisma.timeLog.findMany({
                where: { userId, timestamp: { gte: day, lt: nextDay } },
                orderBy: { timestamp: "asc" },
            });

            // Calculate total worked seconds
            let totalMs = 0;
            let workStart: Date | null = null;

            for (const log of logs) {
                if ((log.type === "START" || log.type === "BREAK_END") && !workStart) {
                    workStart = log.timestamp;
                } else if ((log.type === "BREAK_START" || log.type === "STOP") && workStart) {
                    totalMs += log.timestamp.getTime() - workStart.getTime();
                    workStart = null;
                }
            }
            const userRecord = await prisma.user.findUnique({
                where: { id: userId },
                select: { lastActiveAt: true },
            });

            // Still working (no STOP/BREAK_START yet)
            if (workStart && i === 0) {
                const now = Date.now();
                const lastPing = userRecord?.lastActiveAt ? userRecord.lastActiveAt.getTime() : now;
                const isOffline = now - lastPing > 3 * 60 * 1000;

                // If offline for >3 mins without a STOP, cap at the last ping
                const effectiveEnd = isOffline ? lastPing : now;
                if (effectiveEnd > workStart.getTime()) {
                    totalMs += effectiveEnd - workStart.getTime();
                }
            }

            // Fetch tasks for this day
            const tasks = await prisma.task.findMany({
                where: { userId, date: { gte: day, lt: nextDay } },
                orderBy: { createdAt: "asc" },
                select: { id: true, title: true, note: true },
            });

            results.push({
                date: day.toISOString().split("T")[0],
                totalWorkedSeconds: Math.round(totalMs / 1000),
                tasks,
                sessions: logs.map((l) => ({
                    type: l.type,
                    timestamp: l.timestamp.toISOString(),
                    currentTask: l.currentTask,
                })),
            });
        }

        res.json(results);
    } catch (err: any) {
        console.error("staff/history error:", err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
