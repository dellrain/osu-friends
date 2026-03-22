/** Официальные ассеты osu-web (те же URL, что на osu.ppy.sh). */

const MOD_ICON_BASE = "https://osu.ppy.sh/images/badges/mods/";
const RANK_ICON_BASE = "https://osu.ppy.sh/images/badges/score-ranks-v2019/";

/** Acronym из API → имя файла mod-{slug}.svg (public/images/badges/mods/). */
const MOD_ACRONYM_TO_SLUG: Record<string, string> = {
  EZ: "easy",
  NF: "no-fail",
  HT: "half-time",
  DC: "daycore",
  HR: "hard-rock",
  SD: "sudden-death",
  PF: "perfect",
  DT: "double-time",
  NC: "nightcore",
  HD: "hidden",
  FL: "flashlight",
  SO: "spun-out",
  RX: "relax",
  AP: "autopilot",
  AT: "autopilot",
  TD: "touch-device",
  CL: "classic",
  MR: "mirror",
  FI: "fade-in",
  AC: "accuracy-challenge",
  DA: "difficulty-adjust",
  WU: "wind-up",
  WD: "wind-down",
  SV2: "score-v2",
  TC: "traceable",
  BL: "blinds",
  ST: "single-tap",
  TP: "target-practice",
  RD: "random",
  AL: "alternate",
  SG: "synesthesia",
  SY: "synesthesia",
  CN: "cinema",
  WG: "wiggle",
  SI: "spin-in",
  GR: "grow",
  BR: "barrel-roll",
  AD: "adaptive-speed",
  MU: "muted",
  NS: "no-scope",
  RP: "repel",
  FR: "freeze-frame",
  BU: "bubbles",
  DP: "depth",
  BM: "bloom",
  SR: "simplified-rhythm",
  SW: "swap",
  CS: "constant-speed",
  FF: "floating-fruits",
  NR: "no-release",
  CO: "cover",
  DS: "dual-stages",
  TR: "transform",
  AS: "approach-different",
  MG: "magnetised",
  MF: "muted",
};

export function osuModIconUrl(acronym: string): string | null {
  const slug = MOD_ACRONYM_TO_SLUG[acronym.toUpperCase()];
  if (!slug) return null;
  return `${MOD_ICON_BASE}mod-${slug}.svg`;
}

/** Подпись мода как на osu! (для title / тултипа). */
export function osuModDisplayName(acronym: string): string {
  const up = acronym.trim().toUpperCase();
  const slug = MOD_ACRONYM_TO_SLUG[up];
  if (!slug) return up;
  return slug
    .split("-")
    .map((part) => (part.length ? part.charAt(0).toUpperCase() + part.slice(1) : ""))
    .join(" ");
}

/** Буква ранга из API → GradeSmall-*.svg */
const RANK_TO_FILE: Record<string, string> = {
  X: "GradeSmall-SS.svg",
  XH: "GradeSmall-SS-Silver.svg",
  SS: "GradeSmall-SS.svg",
  SSH: "GradeSmall-SS-Silver.svg",
  S: "GradeSmall-S.svg",
  SH: "GradeSmall-S-Silver.svg",
  A: "GradeSmall-A.svg",
  B: "GradeSmall-B.svg",
  C: "GradeSmall-C.svg",
  D: "GradeSmall-D.svg",
  F: "GradeSmall-F.svg",
};

export function osuRankIconUrl(rank: string): string | null {
  const file = RANK_TO_FILE[rank.trim().toUpperCase()];
  if (!file) return null;
  return `${RANK_ICON_BASE}${file}`;
}
