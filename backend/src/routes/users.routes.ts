
import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";
import { authenticateToken, AuthRequest } from "../middleware/authenticate";

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
            select: { id: true, name: true, email: true, role: true, createdAt: true },
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
            select: { id: true, name: true, email: true, role: true },
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
        await prisma.user.delete({ where: { id } });
        res.json({ success: true });
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

export default router;
