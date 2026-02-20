import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "gv-staff-monitor-secret-2026";

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            res.status(400).json({ error: "Email and password are required" });
            return;
        }

        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            res.status(401).json({ error: "Invalid email or password" });
            return;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            res.status(401).json({ error: "Invalid email or password" });
            return;
        }

        const token = jwt.sign(
            { userId: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: "30d" }
        );

        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    } catch (err: any) {
        console.error("auth/login error:", err);
        res.status(500).json({ error: err.message });
    }
});

// require authenticateToken for this route
import { authenticateToken, AuthRequest } from "../middleware/authenticate";

// PUT /api/auth/me
router.put("/me", authenticateToken, async (req: Request, res: Response) => {
    try {
        const authReq = req as AuthRequest;
        const userId = authReq.user?.userId;

        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        const { name, email, bio } = req.body;

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { name, email },
            select: { id: true, name: true, email: true, role: true }
        });

        res.json(updatedUser);
    } catch (err: any) {
        console.error("auth/me update error:", err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
