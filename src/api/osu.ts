import { osuRankIconUrl } from "../osuUiAssets";
import { OSU_API_VERSION_HEADER_FRIENDS, parseOsuFriendsJson } from "../parseOsuFriends";
import type {
  OsuBestScoreRow,
  OsuFriendUser,
  OsuMostPlayedRow,
  OsuUser,
  OsuUserProfile,
} from "../types";

/**
 * Пустой VITE_OSU_API_BASE → `/api/osu-v2`: в dev проксирует Vite, на VPS — nginx на osu.ppy.sh.
 * Прямые запросы с браузера на https://osu.ppy.sh ломаются (CORS / OPTIONS 401).
 */
function apiBase(): string {
  const fromEnv = import.meta.env.VITE_OSU_API_BASE?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "/api/osu-v2";
}

export async function fetchMe(token: string): Promise<OsuUser> {
  const r = await fetch(`${apiBase()}/me`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`GET /me: ${r.status}`);
  return (await r.json()) as OsuUser;
}

export async function fetchFriends(token: string): Promise<OsuFriendUser[]> {
  const r = await fetch(`${apiBase()}/friends`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "x-api-version": OSU_API_VERSION_HEADER_FRIENDS,
    },
  });
  if (!r.ok) throw new Error(`GET /friends: ${r.status}`);
  const raw = (await r.json()) as unknown;
  return parseOsuFriendsJson(raw);
}

type RawUserExtended = {
  id: number;
  username: string;
  avatar_url: string;
  location: string | null;
  country?: { code: string; name: string };
  statistics?: {
    pp?: number;
    global_rank?: number | null;
    play_time?: number | null;
  };
};

export async function fetchUserProfile(userId: number, token: string): Promise<OsuUserProfile> {
  const r = await fetch(`${apiBase()}/users/${userId}/osu`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`GET /users/${userId}: ${r.status}`);
  const u = (await r.json()) as RawUserExtended;
  const st = u.statistics;
  return {
    id: u.id,
    username: u.username,
    avatar_url: u.avatar_url,
    location: u.location ?? null,
    country: u.country?.code ? { code: u.country.code, name: u.country.name } : null,
    global_rank: st?.global_rank ?? null,
    pp: st?.pp ?? null,
    play_time: st?.play_time ?? null,
  };
}

function pickBeatmapsetCoverUrl(bs: Record<string, unknown> | null | undefined): string | null {
  if (!bs || typeof bs !== "object") return null;
  const covers = bs.covers as Record<string, string | undefined> | undefined;
  if (covers && typeof covers === "object") {
    const u =
      covers["list@2x"] ||
      covers.list ||
      covers["cover@2x"] ||
      covers.cover ||
      covers["card@2x"] ||
      covers.card;
    if (typeof u === "string" && u.length > 0) return u;
  }
  const id = bs.id;
  if (typeof id === "number") {
    return `https://assets.ppy.sh/beatmaps/${id}/covers/list@2x.jpg`;
  }
  return null;
}

/** Как в роутинге osu-web: /scores/{id} (solo) или /scores/{ruleset}/{legacy_score_id} */
const RULESET_ID_TO_SLUG: Record<number, string> = {
  0: "osu",
  1: "taiko",
  2: "fruits",
  3: "mania",
};

function positiveInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.floor(v);
  if (typeof v === "string" && /^\d+$/.test(v)) {
    const n = parseInt(v, 10);
    return n > 0 ? n : null;
  }
  return null;
}

function osuScorePageUrlFromRaw(o: Record<string, unknown>): string | null {
  const legacy = positiveInt(o.legacy_score_id);
  const rulesetId = typeof o.ruleset_id === "number" ? o.ruleset_id : 0;
  const slug = RULESET_ID_TO_SLUG[rulesetId] ?? "osu";
  if (legacy != null) {
    return `https://osu.ppy.sh/scores/${slug}/${legacy}`;
  }
  const id = positiveInt(o.id);
  if (id != null) {
    return `https://osu.ppy.sh/scores/${id}`;
  }
  return null;
}

function extractModAcronyms(modsRaw: unknown): string[] {
  if (!Array.isArray(modsRaw)) return [];
  const out: string[] = [];
  for (const m of modsRaw) {
    if (typeof m === "string" && m.trim()) {
      out.push(m.trim().toUpperCase());
      continue;
    }
    if (m && typeof m === "object" && typeof (m as { acronym?: string }).acronym === "string") {
      out.push((m as { acronym: string }).acronym.trim().toUpperCase());
    }
  }
  return out;
}

const LIST_LIMIT = 5;

export async function fetchUserBestScores(
  userId: number,
  token: string,
  limit = LIST_LIMIT,
): Promise<OsuBestScoreRow[]> {
  const r = await fetch(
    `${apiBase()}/users/${userId}/scores/best?mode=osu&limit=${limit}&legacy_only=0`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        /** Иначе может прийти старый формат Score без mods[] как в доке */
        "x-api-version": "20220705",
      },
    },
  );
  if (!r.ok) throw new Error(`GET best scores: ${r.status}`);
  const raw = (await r.json()) as unknown;
  if (!Array.isArray(raw)) return [];
  const out: OsuBestScoreRow[] = [];
  for (const row of raw.slice(0, limit)) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const bm = o.beatmap as Record<string, unknown> | undefined;
    const bs = (o.beatmapset ?? bm?.beatmapset) as Record<string, unknown> | undefined;
    const title =
      (typeof bs?.title === "string" && bs.title) ||
      (typeof bm?.beatmapset_id === "number" ? `Сет #${bm.beatmapset_id}` : "—");
    const version = typeof bm?.version === "string" ? bm.version : "—";
    const pp = typeof o.pp === "number" ? o.pp : null;
    const acc = typeof o.accuracy === "number" ? Math.round(o.accuracy * 10000) / 100 : 0;
    const rank = typeof o.rank === "string" ? o.rank : "—";
    const modAcronyms = extractModAcronyms(o.mods);
    out.push({
      pp,
      accuracyPct: acc,
      rank,
      rankIconUrl: rank !== "—" ? osuRankIconUrl(rank) : null,
      modAcronyms,
      title,
      version,
      coverUrl: pickBeatmapsetCoverUrl(bs ?? null),
      scorePageUrl: osuScorePageUrlFromRaw(o),
    });
  }
  return out;
}

export async function fetchUserMostPlayed(
  userId: number,
  token: string,
  limit = LIST_LIMIT,
): Promise<OsuMostPlayedRow[]> {
  const r = await fetch(`${apiBase()}/users/${userId}/beatmapsets/most_played?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`GET most_played: ${r.status}`);
  const raw = (await r.json()) as unknown;
  if (!Array.isArray(raw)) return [];
  const out: OsuMostPlayedRow[] = [];
  for (const row of raw.slice(0, limit)) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const count = typeof o.count === "number" ? o.count : 0;
    const bm = o.beatmap as Record<string, unknown> | undefined;
    const bs = (o.beatmapset ?? bm?.beatmapset) as Record<string, unknown> | undefined;
    const title =
      (typeof bs?.title === "string" && bs.title) ||
      (typeof bm?.beatmapset_id === "number" ? `Сет #${bm.beatmapset_id}` : "—");
    const version = typeof bm?.version === "string" ? bm.version : "—";
    out.push({
      playCount: count,
      title,
      version,
      coverUrl: pickBeatmapsetCoverUrl(bs ?? null),
    });
  }
  return out;
}
