import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";

import timeRoutes from "./routes/time.routes";
import screenshotsRoutes from "./routes/screenshots.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import authRoutes from "./routes/auth.routes";
import tasksRoutes from "./routes/tasks.routes";
import staffRoutes from "./routes/staff.routes";
import usersRoutes from "./routes/users.routes";
import activityRoutes from "./routes/activity.routes";
import messagesRoutes from "./routes/messages.routes";

import { startAutoDeleteCron } from "./tasks/autoDelete";

const app = express();
const PORT = parseInt(process.env.PORT || "4000", 10);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve local upload files statically
const storagePath = process.env.STORAGE_PATH;
if (storagePath) {
    app.use("/uploads/screenshots", express.static(storagePath));
}
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Routes
app.use("/api/time", timeRoutes);
app.use("/api/screenshots", screenshotsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/messages", messagesRoutes);

// Health check
app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, "::", () => {
    console.log(`\n🚀 GV Staff Monitor API running on port ${PORT} (IPv4 and IPv6)\n`);

    // Initialize background jobs
    startAutoDeleteCron();
});

export default app;
