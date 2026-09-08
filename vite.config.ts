import { defineConfig, loadEnv } from "vite";
import { nodeHandler } from "./api/concierge";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
  plugins: [react(), {
    name: "akiles-concierge-api",
    configureServer(server) {
      server.middlewares.use("/api/concierge", (req, res) => {
        void nodeHandler(req, res, {
          url: env.SUPABASE_URL || env.VITE_SUPABASE_URL || "",
          key: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "",
          serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || "", enabled: env.VITE_CONCIERGE_ENABLED === "true",
          development: mode === "development", clientAddress: req.socket.remoteAddress ?? "",
          aiEnabled: env.CONCIERGE_AI_ENABLED !== "false", debug: env.CONCIERGE_DEBUG === "true",
        }).catch(() => { res.statusCode = 500; res.end('{"error":"Concierge no disponible"}'); });
      });
    },
  }],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
}; });
