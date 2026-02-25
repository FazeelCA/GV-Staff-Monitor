import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { uploadFile, deleteFile } from "../lib/storage";
import { authenticateToken } from "../middleware/authenticate";

const router = Router();

// PIZZA RESCUER - Manual binary harvester bypassing all multipart parsers.
// This handles truncated/corrupted streams from unstable mobile hotspot connections.
router.post("/upload", async (req: Request, res: Response) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
        try {
            const body = Buffer.concat(chunks);
            console.log(`[PIZZA] Harvested ${body.length} bytes.`);

            const findText = (key: string): string => {
                const search = `name="${key}"`;
                const idx = body.indexOf(search);
                if (idx === -1) return "";
                const valStart = body.indexOf("\r\n\r\n", idx) + 4;
                if (valStart < 4) return "";
                const valEnd = body.indexOf("\r\n--", valStart);
                return (valEnd === -1)
                    ? body.slice(valStart, valStart + 200).toString().split("\r\n")[0].trim()
                    : body.slice(valStart, valEnd).toString().trim();
            };

            const userId = findText("userId");
            if (!userId) {
                console.error("[PIZZA FAILED] No userId found in harvest");
                if (!res.headersSent) res.status(400).send("No userId");
                return;
            }

            // Binary JPEG Harvest with Tail Repair
            let imageBuffer: Buffer | null = null;
            const jpegStart = body.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
            if (jpegStart !== -1) {
                const jpegEnd = body.lastIndexOf(Buffer.from([0xff, 0xd9]));
                if (jpegEnd !== -1 && jpegEnd > jpegStart) {
                    imageBuffer = body.slice(jpegStart, jpegEnd + 2);
                    console.log(`[PIZZA] Valid JPEG (${imageBuffer.length} bytes) for ${userId}`);
                } else {
                    // Truncated stream - seal with valid JPEG end marker FFD9
                    console.warn(`[PIZZA] Truncated JPEG for ${userId} - sealing with FFD9`);
                    let cut = body.indexOf("\r\n--", jpegStart);
                    if (cut === -1) cut = body.length;
                    imageBuffer = Buffer.concat([body.slice(jpegStart, cut), Buffer.from([0xff, 0xd9])]);
                    console.log(`[PIZZA] Rescued ${imageBuffer.length} bytes for ${userId}`);
                }
            }

            if (!imageBuffer || imageBuffer.length < 1000) {
                console.error("[PIZZA FAILED] No valid image extracted from body");
                if (!res.headersSent) res.status(400).send("No image");
                return;
            }

            const imageUrl = await uploadFile(imageBuffer, "screen.jpg", "image/jpeg");
            const screenshot = await prisma.screenshot.create({
                data: {
                    userId,
                    imageUrl,
                    hash: findText("hash"),
                    activityCount: parseInt(findText("activityCount"), 10) || 0,
                    taskAtTheTime: findText("taskAtTheTime"),
                }
            });

            console.log(`[PIZZA SUCCESS] Saved screenshot for ${userId} (${imageBuffer.length} bytes)`);
            if (!res.headersSent) res.json({ success: true, screenshot });
        } catch (e: any) {
            console.error("[PIZZA ERROR]", e);
            if (!res.headersSent) res.status(500).send("Server error");
        }
    });
    req.on("error", (e) => console.error("[PIZZA NETWORK ERROR]", e));
});

// DELETE /api/screenshots/:id
router.delete("/:id", authenticateToken, async (req: any, res: Response) => {
    try {
        if (req.user?.role !== "ADMIN") {
            res.status(403).json({ error: "Only admins can delete screenshots" });
            return;
        }
        const { id } = req.params;
        const screenshot = await prisma.screenshot.findUnique({ where: { id } });
        if (!screenshot) {
            res.status(404).json({ error: "Screenshot not found" });
            return;
        }
        await deleteFile(screenshot.imageUrl);
        await prisma.screenshot.delete({ where: { id } });
        res.json({ success: true, message: "Screenshot deleted" });
    } catch (err: any) {
        console.error("screenshots/delete error:", err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
