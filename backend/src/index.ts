import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";

// CRITICAL: Import screenshot route before any parsers
import screenshotsRoutes from "./routes/screenshots.routes";

import timeRoutes from "./routes/time.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import authRoutes from "./routes/auth.routes";
import tasksRoutes from "./routes/tasks.routes";
import staffRoutes from "./routes/staff.routes";
import usersRoutes from "./routes/users.routes";
import activityRoutes from "./routes/activity.routes";
import messagesRoutes from "./routes/messages.routes";
import debugRoutes from "./routes/debug.routes";

import { startAutoDeleteCron } from "./tasks/autoDelete";

const app = express();
const PORT = parseInt(process.env.PORT || "5000", 10);

app.use(cors());

// CRITICAL: Screenshot upload route FIRST - before any body parsers.
// The PIZZA rescue handler reads the raw request stream manually.
app.use("/api/screenshots", screenshotsRoutes);

// Body parsers for all other routes
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Static file serving - serve from Hetzner Storage Box first, then local fallback
app.use("/uploads/screenshots", express.static("/mnt/screenshots"));
app.use("/uploads/screenshots", express.static(path.join(__dirname, "../../uploads/screenshots")));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Other Routes
app.use("/api/time", timeRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/debug", debugRoutes);

// Health check
app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const server = app.listen(PORT, "::", () => {
    console.log(`\n🚀 GV Staff Monitor API running on port ${PORT} (IPv4 and IPv6)\n`);
    startAutoDeleteCron();
    console.log("Auto-delete cron job scheduled (runs daily at 2:00 AM).");
});

// Increase timeouts for large screenshot uploads over slow mobile connections
server.keepAliveTimeout = 600000;   // 10 minutes
server.headersTimeout = 605000;

export default app;
