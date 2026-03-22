import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv } from "vite";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const base = env.VITE_BASE ?? "./";
  const devPort = env.VITE_DEV_PORT ? parseInt(env.VITE_DEV_PORT, 10) : 5173;
  const port = Number.isFinite(devPort) && devPort > 0 ? devPort : 5173;
  const worldApiPortParsed = env.WORLD_API_PORT ? parseInt(env.WORLD_API_PORT, 10) : 8787;
  const worldApiPort =
    Number.isFinite(worldApiPortParsed) && worldApiPortParsed > 0 ? worldApiPortParsed : 8787;

  return {
    base,
    server: {
      port,
      /** Не молча переключаться на 5174 — иначе OAuth в .env (5173) ломается и «Весь мир» уходит не на тот сервер */
      strictPort: true,
      proxy: {
        "/api/osu-v2": {
          target: "https://osu.ppy.sh",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/osu-v2/, "/api/v2"),
        },
        /** Персистентный граф: отдельный процесс `npm run dev:api` (SQLite) */
        "/api/world": {
          target: `http://127.0.0.1:${worldApiPort}`,
          changeOrigin: true,
        },
      },
    },
    plugins: [
      {
        name: "osu-oauth-token-dev",
        configureServer(server) {
          server.middlewares.use(
            "/api/osu-token",
            async (req: IncomingMessage, res: ServerResponse, next) => {
              if (req.method !== "POST") {
                next();
                return;
              }
              const secret = env.OSU_CLIENT_SECRET;
              if (!secret) {
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(
                  JSON.stringify({
                    error: "OSU_CLIENT_SECRET не задан в .env (только для dev)",
                  }),
                );
                return;
              }
              let body: { code?: string; redirect_uri?: string };
              try {
                body = JSON.parse(await readBody(req)) as {
                  code?: string;
                  redirect_uri?: string;
                };
              } catch {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: "Invalid JSON" }));
                return;
              }
              const clientId = env.VITE_OSU_CLIENT_ID;
              if (!body.code || !body.redirect_uri || !clientId) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "code, redirect_uri, client_id required" }));
                return;
              }
              const params = new URLSearchParams({
                client_id: clientId,
                client_secret: secret,
                code: body.code,
                grant_type: "authorization_code",
                redirect_uri: body.redirect_uri,
              });
              const r = await fetch("https://osu.ppy.sh/oauth/token", {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                  Accept: "application/json",
                },
                body: params.toString(),
              });
              const text = await r.text();
              res.statusCode = r.status;
              res.setHeader("Content-Type", "application/json");
              res.end(text);
            },
          );
        },
      },
    ],
  };
});
