import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { uploadFile, deleteFile } from "../lib/storage";
import { authenticateToken } from "../middleware/authenticate";

const router = Router();

// PIZZA PARSER v11 - THE FINAL JUDGE (Strict Integrity)
// Rejects ANY truncated upload. No more "split" images.
// Forces the app to retry until the connection delivers every bit.
router.post("/upload", async (req: Request, res: Response) => {
    const expectedLength = parseInt(req.headers["content-length"] || "0", 10);
    const chunks: Buffer[] = [];

    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
        try {
            const body = Buffer.concat(chunks);
            const actualLength = body.length;

            // 1. Strict Byte Count Check
            // If the connection dropped (e.g. mobile hotspot glitch), req.on("end") still fires.
            // We MUST reject if we didn't get what the client promised.
            if (expectedLength > 0 && actualLength < expectedLength) {
                console.warn(`[PIZZA REJECT] Truncated upload (${actualLength}/${expectedLength}). Forcing retry.`);
                if (!res.headersSent) res.status(502).json({ error: "Truncated" });
                return;
            }

            if (body.length < 500) return res.status(400).send("No data");

            const findText = (name: string): string => {
                const search = `name="${name}"`;
                const idx = body.indexOf(search);
                if (idx === -1) return "";
                const s = body.indexOf("\r\n\r\n", idx) + 4;
                if (s < 4) return "";
                const e = body.indexOf("\r\n--", s);
                return (e === -1) ? "" : body.slice(s, e).toString().trim();
            };

            const userId = findText("userId");
            if (!userId) return res.status(400).send("No userId");

            // 2. Binary Extraction (Look for "image" part - matching app v0.1.44)
            let imageBuffer: Buffer | null = null;
            const soi = Buffer.from([0xff, 0xd8]);
            const sIdx = body.indexOf(soi);

            if (sIdx !== -1) {
                const eIdx = body.lastIndexOf(Buffer.from([0xff, 0xd9]));
                if (eIdx !== -1 && eIdx > sIdx) {
                    imageBuffer = body.slice(sIdx, eIdx + 2);
                }
            }

            // 3. Reject if JPEG is incomplete (Missing End Marker)
            if (!imageBuffer || imageBuffer.length < 1000) {
                console.error(`[PIZZA REJECT] Invalid JPEG structure for ${userId}. Forcing retry.`);
                if (!res.headersSent) res.status(502).send("Invalid Image");
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

            console.log(`[PIZZA SUCCESS] v11 Clean Save: ${userId} (${imageBuffer.length} bytes)`);
            if (!res.headersSent) res.json({ success: true, screenshot });

        } catch (e: any) {
            console.error("[PIZZA ERROR]", e);
            if (!res.headersSent) res.status(500).send("Server error");
        }
    });
});

// DELETE /api/screenshots/:id
router.delete("/:id", authenticateToken, async (req: any, res: Response) => {
    try {
        if (req.user?.role !== "ADMIN") return res.status(403).json({ error: "Access Denied" });
        const { id } = req.params;
        const screenshot = await prisma.screenshot.findUnique({ where: { id } });
        if (!screenshot) return res.status(404).json({ error: "Not Found" });
        await deleteFile(screenshot.imageUrl);
        await prisma.screenshot.delete({ where: { id } });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
