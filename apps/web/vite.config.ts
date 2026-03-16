import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  plugins: [react()],
  publicDir: path.resolve(__dirname, "../../public"),
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
