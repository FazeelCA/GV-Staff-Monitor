import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { uploadFile, deleteFile } from "../lib/storage";
import { authenticateToken } from "../middleware/authenticate";
import sharp from "sharp";

const router = Router();

// PIZZA PARSER v14 - THE PEACEKEEPER (Resilient + Clean)
// Restores visibility for truncated streams while preventing "split" artifacts.
router.post("/upload", async (req: Request, res: Response) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
        try {
            const body = Buffer.concat(chunks);
            if (body.length < 500) return res.status(400).send("No data");

            const findText = (name: string): string => {
                const search = `name="${name}"`;
                const idx = body.indexOf(search);
                if (idx === -1) return "";
                const s = body.indexOf("\r\n\r\n", idx) + 4;
                const e = body.indexOf("\r\n--", s);
                return (e === -1) ? "" : body.slice(s, e).toString().trim();
            };

            const userId = findText("userId") || "unknown";

            // 1. Locate SOI (Start of Image)
            const soi = Buffer.from([0xff, 0xd8]);
            const sIdx = body.indexOf(soi);
            if (sIdx === -1) {
                console.error(`[PIZZA v14] No SOI found for ${userId}. Rejecting.`);
                return res.status(400).send("Invalid stream");
            }

            // 2. Locate EOI (End of Image)
            const eoi = Buffer.from([0xff, 0xd9]);
            const eIdx = body.lastIndexOf(eoi);

            let imageBuffer: Buffer;
            if (eIdx !== -1 && eIdx > sIdx) {
                // Perfect Case: Deliver bit-perfect slice
                imageBuffer = body.slice(sIdx, eIdx + 2);
            } else {
                // Truncated Case: Rescue and seal
                console.warn(`[PIZZA v14] Truncated JPEG from ${userId} (${body.length} bytes). Rescuing.`);

                // Find where the image part might end to avoid including boundary metadata
                let endOfPart = body.indexOf("\r\n--", sIdx);
                if (endOfPart === -1) endOfPart = body.length;

                // Take the raw pixels and add a fresh EOI to prevent "Split" appearance
                const rawPixels = body.slice(sIdx, endOfPart);
                imageBuffer = Buffer.concat([rawPixels, eoi]);
            }

            const imageUrl = await uploadFile(imageBuffer, "screen.jpg", "image/jpeg");

            let thumbnailUrl = null;
            try {
                const thumbnailBuffer = await sharp(imageBuffer)
                    .resize({ width: 400 })
                    .jpeg({ quality: 60 })
                    .toBuffer();
                thumbnailUrl = await uploadFile(thumbnailBuffer, "thumb.jpg", "image/jpeg");
            } catch (thumbErr) {
                console.error("[SHARP ERROR] Failed to generate thumbnail:", thumbErr);
            }

            const screenshot = await prisma.$transaction(async (tx) => {
                const createdScreenshot = await tx.screenshot.create({
                    data: {
                        userId,
                        imageUrl,
                        thumbnailUrl,
                        hash: findText("hash"),
                        activityCount: parseInt(findText("activityCount"), 10) || 0,
                        taskAtTheTime: findText("taskAtTheTime"),
                    }
                });

                await tx.user.update({
                    where: { id: userId },
                    data: { lastActiveAt: new Date() }
                });

                return createdScreenshot;
            });

            console.log(`[PIZZA SUCCESS] v14 saved ${userId} (${imageBuffer.length} bytes)`);
            res.json({ success: true, screenshot });

        } catch (e: any) {
            console.error("[PIZZA ERROR]", e);
            if (!res.headersSent) res.status(500).send("Server error");
        }
    });
});

// DELETE /api/screenshots/:id
router.delete("/:id", authenticateToken, async (req: any, res: Response) => {
    try {
        if (req.user?.role !== "ADMIN") return res.status(403).json({ error: "No permission" });
        const { id } = req.params;
        const screenshot = await prisma.screenshot.findUnique({ where: { id } });
        if (!screenshot) return res.status(404).json({ error: "Not found" });
        await deleteFile(screenshot.imageUrl);
        await prisma.screenshot.delete({ where: { id } });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
