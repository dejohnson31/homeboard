import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Installable app on phones/tablets (skipped when embedded in a preview frame).
if ("serviceWorker" in navigator && window.top === window.self) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
