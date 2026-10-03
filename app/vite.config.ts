import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" lets the same build run from Home Assistant (/local/homeboard/),
// GitHub Pages, or any static host.
export default defineConfig({ base: "./", plugins: [react()] });
