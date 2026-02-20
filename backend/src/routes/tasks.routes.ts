
import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authenticateToken } from "../middleware/authenticate";

const router = Router();

router.use(authenticateToken);

// GET /api/tasks - Get all tasks (global)
router.get("/", async (_req: Request, res: Response) => {
    try {
        const tasks = await prisma.task.findMany({
            include: {
                user: {
                    select: { name: true, email: true }
                }
            },
            orderBy: { createdAt: "desc" },
            take: 100
        });
        res.json(tasks);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/tasks/user/:userId - Get tasks for specific user
router.get("/user/:userId", async (req: Request, res: Response) => {
    try {
        const { userId } = req.params as { userId: string };
        const { date } = req.query as { date?: string };

        const where: any = { userId };

        if (date) {
            const queryDate = new Date(date);
            const nextDay = new Date(queryDate);
            nextDay.setDate(queryDate.getDate() + 1);
            where.createdAt = {
                gte: queryDate,
                lt: nextDay
            };
        }

        const tasks = await prisma.task.findMany({
            where,
            orderBy: { createdAt: "desc" }
        });
        res.json(tasks);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
