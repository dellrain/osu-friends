import type { OsuUser } from "../types";

export type WorldGraphPayload = {
  nodes: OsuUser[];
  edges: [number, number][];
  /** Пары, где osu! API при contribute сообщил mutual (оба в друзьях друг у друга). */
  mutual_edges?: [number, number][];
};

/** Пустой env = тот же origin (dev: прокси Vite → world-api; prod: nginx → world-api). */
function worldBase(): string {
  const fromEnv = import.meta.env.VITE_WORLD_API_BASE?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "/api/world";
}

export async function fetchWorldGraph(): Promise<WorldGraphPayload> {
  const b = worldBase();
  const r = await fetch(`${b}/graph`, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`GET world graph: ${r.status}`);
  const data = (await r.json()) as WorldGraphPayload;
  if (!data.nodes || !Array.isArray(data.edges)) {
    return { nodes: [], edges: [], mutual_edges: [] };
  }
  if (!Array.isArray(data.mutual_edges)) {
    data.mutual_edges = [];
  }
  return data;
}

export async function contributeWorld(accessToken: string): Promise<void> {
  const b = worldBase();
  if (!b) return;
  try {
    const r = await fetch(`${b}/contribute`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    if (!r.ok && import.meta.env.DEV) {
      console.warn("world contribute:", r.status, await r.text());
    }
  } catch {
    /* ignore */
  }
}
