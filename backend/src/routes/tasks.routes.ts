
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

// POST /api/tasks - Create a new task
router.post("/", async (req: Request, res: Response) => {
    try {
        const { title, note } = req.body;
        const userId = (req as any).user?.userId;

        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        if (!title) {
            res.status(400).json({ error: "Title is required" });
            return;
        }

        const task = await prisma.task.create({
            data: {
                title,
                note: note || "",
                userId,
            }
        });

        res.json({ task });
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

// DELETE /api/tasks/:id - Delete a task
router.delete("/:id", async (req: Request, res: Response) => {
    try {
        const { id } = req.params as { id: string };
        const userId = (req as any).user?.userId;

        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        // Make sure the user owns the task
        const task = await prisma.task.findUnique({ where: { id } });
        if (!task || task.userId !== userId) {
            res.status(404).json({ error: "Task not found" });
            return;
        }

        await prisma.task.delete({ where: { id } });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
