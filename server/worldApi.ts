/**
 * Бэкенд для продакшена и dev: граф «Весь мир» (SQLite) + обмен OAuth code→token (как /api/osu-token в Vite).
 * Запуск: npm run start:api | npm run dev:api
 */
import fs from "node:fs";
import path from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { config as loadEnv } from "dotenv";
import Database from "better-sqlite3";
import {
  OSU_API_VERSION_HEADER_FRIENDS,
  parseOsuFriendsJson,
} from "../src/parseOsuFriends";

// override: иначе пустые/битые значения из systemd EnvironmentFile не перезапишутся из .env
loadEnv({ override: true });

type WorldUser = { id: number; username: string; avatar_url: string };
type WorldFriend = WorldUser & { mutual?: boolean };

const DB_PATH = path.resolve(
  process.cwd(),
  process.env.WORLD_DATABASE_PATH?.trim() || "data/world.sqlite",
);
const PORT = (() => {
  const n = parseInt(process.env.WORLD_API_PORT ?? "8787", 10);
  return Number.isFinite(n) && n > 0 ? n : 8787;
})();

function ensureDataDir(): void {
  const dir = path.dirname(DB_PATH);
  fs.mkdirSync(dir, { recursive: true });
}

function openDb() {
  ensureDataDir();
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_users (
      osu_id INTEGER PRIMARY KEY,
      username TEXT NOT NULL,
      avatar_url TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS world_edges (
      user_a INTEGER NOT NULL,
      user_b INTEGER NOT NULL,
      PRIMARY KEY (user_a, user_b),
      CHECK (user_a < user_b)
    );
    CREATE TABLE IF NOT EXISTS world_mutual_edges (
      user_a INTEGER NOT NULL,
      user_b INTEGER NOT NULL,
      PRIMARY KEY (user_a, user_b),
      CHECK (user_a < user_b)
    );
  `);
  return db;
}

const db = openDb();

const upsertUser = db.prepare(`
  INSERT INTO world_users (osu_id, username, avatar_url, updated_at)
  VALUES (@osu_id, @username, @avatar_url, @updated_at)
  ON CONFLICT(osu_id) DO UPDATE SET
    username = excluded.username,
    avatar_url = excluded.avatar_url,
    updated_at = excluded.updated_at
`);

const insertEdge = db.prepare(`
  INSERT OR IGNORE INTO world_edges (user_a, user_b) VALUES (?, ?)
`);

const insertMutualEdge = db.prepare(`
  INSERT OR IGNORE INTO world_mutual_edges (user_a, user_b) VALUES (?, ?)
`);

function mergeWorldContribution(me: WorldUser, friends: WorldFriend[]): void {
  const now = Math.floor(Date.now() / 1000);
  const tx = db.transaction(() => {
    upsertUser.run({
      osu_id: me.id,
      username: me.username,
      avatar_url: me.avatar_url ?? "",
      updated_at: now,
    });
    for (const f of friends) {
      upsertUser.run({
        osu_id: f.id,
        username: f.username,
        avatar_url: f.avatar_url ?? "",
        updated_at: now,
      });
      const lo = Math.min(me.id, f.id);
      const hi = Math.max(me.id, f.id);
      insertEdge.run(lo, hi);
      if (f.mutual === true) {
        insertMutualEdge.run(lo, hi);
      }
    }
  });
  tx();
}

function worldGraphJson(): string {
  const nodes = db
    .prepare(
      `SELECT osu_id AS id, username, avatar_url FROM world_users ORDER BY osu_id`,
    )
    .all() as WorldUser[];
  const edges = db
    .prepare(`SELECT user_a, user_b FROM world_edges ORDER BY user_a, user_b`)
    .all() as { user_a: number; user_b: number }[];
  const edgePairs: [number, number][] = edges.map((e) => [e.user_a, e.user_b]);
  const mutualRows = db
    .prepare(`SELECT user_a, user_b FROM world_mutual_edges ORDER BY user_a, user_b`)
    .all() as { user_a: number; user_b: number }[];
  const mutualPairs: [number, number][] = mutualRows.map((e) => [e.user_a, e.user_b]);
  return JSON.stringify({ nodes, edges: edgePairs, mutual_edges: mutualPairs });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleContribute(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const rawAuth = req.headers.authorization;
  const auth = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    const meR = await fetch("https://osu.ppy.sh/api/v2/me", {
      headers: { Authorization: auth, Accept: "application/json" },
    });
    if (!meR.ok) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "osu /me failed" }));
      return;
    }
    const me = (await meR.json()) as WorldUser;
    const frR = await fetch("https://osu.ppy.sh/api/v2/friends", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "x-api-version": OSU_API_VERSION_HEADER_FRIENDS,
      },
    });
    if (!frR.ok) {
      res.statusCode = 403;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "osu /friends failed" }));
      return;
    }
    const frJson = (await frR.json()) as unknown;
    mergeWorldContribution(me, parseOsuFriendsJson(frJson));
    res.statusCode = 204;
    res.end();
    return;
  }

  let body: { me?: WorldUser; friends?: WorldUser[] };
  try {
    body = JSON.parse(await readBody(req)) as { me?: WorldUser; friends?: WorldUser[] };
  } catch {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }
  if (!body.me?.id || !Array.isArray(body.friends)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "Use Authorization: Bearer <token> or JSON { me, friends }",
      }),
    );
    return;
  }
  mergeWorldContribution(body.me, body.friends);
  res.statusCode = 204;
  res.end();
}

async function handleOsuToken(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const secret = process.env.OSU_CLIENT_SECRET?.trim();
  if (!secret) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "OSU_CLIENT_SECRET не задан в .env на сервере",
      }),
    );
    return;
  }
  let body: { code?: string; redirect_uri?: string };
  try {
    body = JSON.parse(await readBody(req)) as { code?: string; redirect_uri?: string };
  } catch {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }
  const clientId = (process.env.OSU_CLIENT_ID ?? process.env.VITE_OSU_CLIENT_ID)?.trim();
  if (!body.code || !body.redirect_uri || !clientId) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error:
          "code, redirect_uri или client id: задайте OSU_CLIENT_ID или VITE_OSU_CLIENT_ID в .env",
      }),
    );
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
}

const server = createServer(async (req, res) => {
  const pathOnly = req.url?.split("?")[0] ?? "";

  if (pathOnly === "/api/osu-token" && req.method === "POST") {
    await handleOsuToken(req, res);
    return;
  }

  if (pathOnly === "/api/world/graph" && req.method === "GET") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(worldGraphJson());
    return;
  }

  if (pathOnly === "/api/world/contribute" && req.method === "POST") {
    await handleContribute(req, res);
    return;
  }

  if (pathOnly.startsWith("/api/world")) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  res.statusCode = 404;
  res.end();
});

server.listen(PORT, "127.0.0.1", () => {
  console.info(`[world-api] SQLite ${DB_PATH}`);
  console.info(`[world-api] http://127.0.0.1:${PORT}/api/world/graph`);
  console.info(`[world-api] POST http://127.0.0.1:${PORT}/api/osu-token`);
});
