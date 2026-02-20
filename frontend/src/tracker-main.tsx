import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import TrackerApp from "./TrackerApp";

createRoot(document.getElementById("tracker-root")!).render(
    <StrictMode>
        <TrackerApp />
    </StrictMode>
);
