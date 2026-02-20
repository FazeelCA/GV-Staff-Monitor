import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { LogType } from "@prisma/client";

const router = Router();

// POST /api/time/log
router.post("/log", async (req: Request, res: Response) => {
    try {
        const { userId, type, currentTask } = req.body;

        if (!userId || !type) {
            res.status(400).json({ error: "userId and type are required" });
            return;
        }

        const validTypes: LogType[] = ["START", "BREAK_START", "BREAK_END", "STOP"];
        if (!validTypes.includes(type as LogType)) {
            res.status(400).json({ error: `type must be one of: ${validTypes.join(", ")}` });
            return;
        }

        const log = await prisma.timeLog.create({
            data: {
                userId,
                type: type as LogType,
                currentTask: currentTask || "",
            },
        });

        res.json({ success: true, log });
    } catch (err: any) {
        console.error("time/log error:", err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
