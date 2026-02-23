import { Router, Request, Response } from "express";

const router = Router();

// POST /api/debug/report — Receives client-side error reports
// This lets us see what's happening on remote Windows machines
router.post("/report", (req: Request, res: Response) => {
    const { userId, source, message, platform, appVersion } = req.body;
    console.error(
        `\n🔴 [CLIENT ERROR] user=${userId} platform=${platform} version=${appVersion} source=${source}\n   → ${message}\n`
    );
    res.json({ received: true });
});

// GET /api/debug/ping — Simple connectivity check
router.get("/ping", (_req: Request, res: Response) => {
    res.json({ pong: true, time: new Date().toISOString() });
});

export default router;
