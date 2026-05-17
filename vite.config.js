import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";

function loadRuntimeConfig() {
  try {
    return JSON.parse(fs.readFileSync("runtime-config.json", "utf8"));
  } catch {
    return {};
  }
}

const runtime = loadRuntimeConfig();
const clientPort = Number(process.env.CLIENT_PORT || runtime.clientPort || 5179);
const apiPort = Number(process.env.PORT || runtime.apiPort || 6397);

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: clientPort,
    proxy: {
      "/api": `http://127.0.0.1:${apiPort}`,
    },
  },
});
