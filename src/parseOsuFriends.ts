import type { OsuFriendUser, OsuUser } from "./types";

/**
 * osu-web FriendsController@index: без заголовка x-api-version (или версия &lt; 20241022) API
 * отдаёт только массив User без mutual. С версией 20241022+ — UserRelation: mutual + target.
 */
export const OSU_API_VERSION_HEADER_FRIENDS = "20241022";

/**
 * Разбор GET /api/v2/friends: osu! отдаёт либо UserRelation ({ target, mutual }),
 * либо плоский User с полем mutual на том же объекте.
 */
export function parseOsuFriendsJson(raw: unknown): OsuFriendUser[] {
  const items: unknown[] = Array.isArray(raw)
    ? raw
    : raw &&
        typeof raw === "object" &&
        "data" in raw &&
        Array.isArray((raw as { data: unknown }).data)
      ? (raw as { data: unknown[] }).data
      : [];
  const out: OsuFriendUser[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const nested = o.target ?? (o as { user?: unknown }).user;
    if (nested && typeof nested === "object") {
      const t = nested as OsuUser;
      if (typeof t.id !== "number" || typeof t.username !== "string") continue;
      const mutual = typeof o.mutual === "boolean" ? o.mutual : undefined;
      out.push(mutual !== undefined ? { ...t, mutual } : { ...t });
      continue;
    }
    if (typeof o.id === "number" && typeof o.username === "string") {
      const mutual = typeof o.mutual === "boolean" ? o.mutual : undefined;
      const base: OsuUser = {
        id: o.id,
        username: o.username,
        avatar_url: typeof o.avatar_url === "string" ? o.avatar_url : "",
      };
      out.push(mutual !== undefined ? { ...base, mutual } : base);
    }
  }
  return out;
}
