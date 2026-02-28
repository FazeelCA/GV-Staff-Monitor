
import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";
import { authenticateToken, AuthRequest } from "../middleware/authenticate";
import { deleteFile } from "../lib/storage";

const router = Router();

// Protect all routes
router.use(authenticateToken);

// Middleware to check Admin role
function requireAdmin(req: Request, res: Response, next: Function) {
    const user = (req as AuthRequest).user;
    if (user?.role !== "ADMIN") {
        res.status(403).json({ error: "Forbidden: Admin access required" });
        return;
    }
    next();
}

// GET / - List all users
router.get("/", requireAdmin, async (_req: Request, res: Response) => {
    try {
        const users = await prisma.user.findMany({
            where: {
                role: {
                    not: "ADMIN",
                },
            },
            select: { id: true, name: true, email: true, role: true, expectedStartTime: true, createdAt: true },
            orderBy: { name: "asc" },
        });
        res.json(users);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST / - Create User
router.post("/", requireAdmin, async (req: Request, res: Response) => {
    try {
        const { name, email, password, role } = req.body;

        // Basic validation
        if (!email || !password || !name) {
            res.status(400).json({ error: "Name, email, and password are required" });
            return;
        }

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            res.status(400).json({ error: "Email already exists" });
            return;
        }

        const hash = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                name,
                email,
                passwordHash: hash,
                role: role || "STAFF",
            },
            select: { id: true, name: true, email: true, role: true, expectedStartTime: true },
        });

        res.json(user);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /:id - Delete User
router.delete("/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
        const { id } = req.params as { id: string };

        // 1. Find all screenshots associated with the user
        const screenshots = await prisma.screenshot.findMany({
            where: { userId: id },
            select: { imageUrl: true }
        });

        // 2. Physically delete the files off the server disk / S3
        await Promise.all(screenshots.map(s => deleteFile(s.imageUrl)));

        // 3. Delete the user (Prisma cascade schema will automatically wipe TimeLogs, ActivityLogs, Tasks, Messages, and DB Screenshot records)
        await prisma.user.delete({ where: { id } });

        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /:id/role - Edit User Permissions
router.put("/:id/role", requireAdmin, async (req: Request, res: Response) => {
    try {
        const { id } = req.params as { id: string };
        const { role } = req.body;

        if (!role || !["ADMIN", "STAFF"].includes(role)) {
            res.status(400).json({ error: "Invalid role specified. Must be ADMIN or STAFF." });
            return;
        }

        const user = await prisma.user.update({
            where: { id },
            data: { role },
            select: { id: true, name: true, email: true, role: true }
        });

        res.json(user);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /:id/password - Reset User Password
router.put("/:id/password", requireAdmin, async (req: Request, res: Response) => {
    try {
        const { id } = req.params as { id: string };
        const { password } = req.body;

        if (!password) {
            res.status(400).json({ error: "Password is required" });
            return;
        }

        const hash = await bcrypt.hash(password, 10);
        await prisma.user.update({
            where: { id },
            data: { passwordHash: hash },
        });

        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /:id/name - Edit User Name
router.put("/:id/name", requireAdmin, async (req: Request, res: Response) => {
    try {
        const { id } = req.params as { id: string };
        const { name } = req.body;

        if (!name || name.trim().length === 0) {
            res.status(400).json({ error: "Name is required" });
            return;
        }

        const user = await prisma.user.update({
            where: { id },
            data: { name: name.trim() },
            select: { id: true, name: true, email: true, role: true }
        });

        res.json(user);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /ping - Update last interaction time for online status
router.put("/ping", async (req: Request, res: Response) => {
    try {
        const userId = (req as AuthRequest).user?.userId;
        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        await prisma.user.update({
            where: { id: userId },
            data: { lastActiveAt: new Date() },
        });

        res.json({ success: true });
    } catch (err: any) {
        console.error("ping error:", err);
        res.status(500).json({ error: err.message });
    }
});

// GET /:id/history - Fetch detailed timeline for a user
router.get("/:id/history", requireAdmin, async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const dateParam = req.query.date as string;

        let startOfDay, endOfDay;
        if (dateParam) {
            startOfDay = new Date(dateParam);
            startOfDay.setHours(0, 0, 0, 0);
        } else {
            startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
        }
        endOfDay = new Date(startOfDay);
        endOfDay.setDate(startOfDay.getDate() + 1);

        const [timeLogs, screenshots, activityLogs] = await Promise.all([
            prisma.timeLog.findMany({
                where: { userId: id, timestamp: { gte: startOfDay, lt: endOfDay } },
                orderBy: { timestamp: "asc" }
            }),
            prisma.screenshot.findMany({
                where: { userId: id, timestamp: { gte: startOfDay, lt: endOfDay } },
                orderBy: { timestamp: "asc" }
            }),
            prisma.activityLog.findMany({
                where: { userId: id, startTime: { gte: startOfDay, lt: endOfDay } },
                orderBy: { startTime: "asc" }
            })
        ]);

        res.json({ timeLogs, screenshots, activityLogs });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /:id/time-logs/today - Reset User's Hours for Today
router.delete("/:id/time-logs/today", requireAdmin, async (req: Request, res: Response) => {
    try {
        const { id } = req.params as { id: string };
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        await prisma.timeLog.deleteMany({
            where: {
                userId: id,
                timestamp: {
                    gte: today,
                },
            },
        });

        res.json({ success: true, message: "Hours reset for today" });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /:id/start-time - Set Expected Start Time
router.put("/:id/start-time", requireAdmin, async (req: Request, res: Response) => {
    try {
        const { id } = req.params as { id: string };
        const { expectedStartTime } = req.body;

        if (!expectedStartTime) {
            res.status(400).json({ error: "expectedStartTime is required" });
            return;
        }

        await prisma.user.update({
            where: { id },
            data: { expectedStartTime },
        });

        res.json({ success: true, expectedStartTime });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
