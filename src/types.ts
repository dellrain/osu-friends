export type OsuUser = {
  id: number;
  username: string;
  avatar_url: string;
};

/** Друг из GET /friends: при разборе UserRelation есть признак взаимной подписки. */
export type OsuFriendUser = OsuUser & { mutual?: boolean };

export type GraphNode = OsuUser & {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  r: number;
};

export type GraphLink = { source: GraphNode; target: GraphNode };

export type OsuUserProfile = {
  id: number;
  username: string;
  avatar_url: string;
  location: string | null;
  country: { code: string; name: string } | null;
  global_rank: number | null;
  pp: number | null;
  play_time: number | null;
};

/** Элемент списка «лучшие скоры» (osu!) для UI */
export type OsuBestScoreRow = {
  pp: number | null;
  accuracyPct: number;
  rank: string;
  rankIconUrl: string | null;
  modAcronyms: string[];
  title: string;
  version: string;
  coverUrl: string | null;
  /** Страница этого скора на osu.ppy.sh (solo id или legacy ruleset/id) */
  scorePageUrl: string | null;
};

/** Элемент списка «чаще всего играл» */
export type OsuMostPlayedRow = {
  playCount: number;
  title: string;
  version: string;
  coverUrl: string | null;
};
