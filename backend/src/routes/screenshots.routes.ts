import { Router, Request, Response } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma";
import { uploadFile, deleteFile } from "../lib/storage";
import { authenticateToken } from "../middleware/authenticate";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10_000_000 } });

// POST /api/screenshots/upload
router.post("/upload", upload.single("image"), async (req: Request, res: Response) => {
    try {
        const { userId, taskAtTheTime, hash } = req.body;

        if (!userId) {
            res.status(400).json({ error: "userId is required" });
            return;
        }

        if (!req.file) {
            res.status(400).json({ error: "No file uploaded" });
            return;
        }

        const imageUrl = await uploadFile(
            req.file.buffer,
            req.file.originalname,
            req.file.mimetype
        );

        const screenshot = await prisma.screenshot.create({
            data: {
                userId,
                imageUrl,
                hash: hash || "",
                taskAtTheTime: taskAtTheTime || "",
            },
        });

        res.json({ success: true, screenshot });
    } catch (err: any) {
        console.error("screenshots/upload error:", err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/screenshots/:id
router.delete("/:id", authenticateToken, async (req: any, res: Response) => {
    try {
        if (req.user?.role !== "ADMIN") {
            res.status(403).json({ error: "Only admins can delete screenshots" });
            return;
        }

        const { id } = req.params;
        const screenshot = await prisma.screenshot.findUnique({
            where: { id }
        });

        if (!screenshot) {
            res.status(404).json({ error: "Screenshot not found" });
            return;
        }

        // 1. Delete from storage (S3 or local)
        await deleteFile(screenshot.imageUrl);

        // 2. Delete from database
        await prisma.screenshot.delete({
            where: { id }
        });

        res.json({ success: true, message: "Screenshot deleted" });
    } catch (err: any) {
        console.error("screenshots/delete error:", err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
