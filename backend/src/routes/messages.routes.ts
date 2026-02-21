import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authenticateToken } from "../middleware/authenticate";
import { requireAdmin } from "../middleware/requireAdmin";

const router = Router();
router.use(authenticateToken);

// POST /api/messages/push/:userId - Admin only
router.post("/push/:userId", requireAdmin, async (req: Request, res: Response) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: "Message is required" });

        const msg = await prisma.adminMessage.create({
            data: {
                userId: req.params.userId,
                message,
            }
        });
        res.json({ success: true, message: msg });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/messages/unread - Staff
router.get("/unread", async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const messages = await prisma.adminMessage.findMany({
            where: { userId: user.id, isRead: false },
            orderBy: { createdAt: 'asc' }
        });
        res.json(messages);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/messages/:id/read - Staff
router.put("/:id/read", async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const msgId = req.params.id;

        const message = await prisma.adminMessage.findUnique({ where: { id: msgId } });
        if (!message) return res.status(404).json({ error: "Message not found" });
        if (message.userId !== user.id) return res.status(403).json({ error: "Forbidden" });

        await prisma.adminMessage.update({
            where: { id: msgId },
            data: { isRead: true }
        });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
