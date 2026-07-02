import "./style.css";
import {
  fetchFriends,
  fetchMe,
  fetchUserBestScores,
  fetchUserMostPlayed,
  fetchUserProfile,
} from "./api/osu";
import { contributeWorld, fetchWorldGraph } from "./api/world";
import { CircleGraph } from "./graph/CircleGraph";
import type { GraphViewMode } from "./graph/viewModes";
import { VIEW_MODE_LABELS } from "./graph/viewModes";
import type {
  OsuBestScoreRow,
  OsuFriendUser,
  OsuMostPlayedRow,
  OsuUser,
  OsuUserProfile,
} from "./types";
import {
  buildAuthorizeUrl,
  clearTokens,
  getStoredAccessToken,
  handleOAuthCallback,
} from "./oauth";
import { osuModDisplayName, osuModIconUrl } from "./osuUiAssets";

const MAX_SEARCH_TOKENS = 3;

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app");

app.innerHTML = `
  <div class="shell">
    <header class="bar">
      <h1 class="title title-bar-heading">
        <a class="brand-home-link" href="/" aria-label="прокат катамаранов — главная страница">
          <span class="brand-home-mark" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="36" height="36" style="display:block">
              <rect x="3" y="16" width="7" height="3" rx="1.2"/>
              <rect x="14" y="16" width="7" height="3" rx="1.2"/>
              <rect x="4" y="12" width="16" height="4" rx="1"/>
              <path d="M5 12 L7.5 7 L16.5 7 L19 12Z"/>
              <rect x="11.5" y="7" width="1" height="4"/>
            </svg>
          </span>
          <span class="title-app-name">прокат катамаранов</span>
        </a>
        <span class="wheel-wrap" aria-hidden="true">
          <svg class="steering-wheel" viewBox="0 0 100 100" width="32" height="32">
            <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" stroke-width="4" opacity="0.5"/>
            <circle cx="50" cy="50" r="8" fill="currentColor" opacity="0.4"/>
            <g stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity="0.5">
              <line x1="50" y1="8" x2="50" y2="20"/>
              <line x1="50" y1="80" x2="50" y2="92"/>
              <line x1="8" y1="50" x2="20" y2="50"/>
              <line x1="80" y1="50" x2="92" y2="50"/>
              <line x1="20.3" y1="20.3" x2="29.3" y2="29.3"/>
              <line x1="70.7" y1="70.7" x2="79.7" y2="79.7"/>
              <line x1="20.3" y1="79.7" x2="29.3" y2="70.7"/>
              <line x1="70.7" y1="29.3" x2="79.7" y2="20.3"/>
            </g>
          </svg>
        </span>
        <span class="minecraft-logo" aria-hidden="true">MINECRAFT</span>
      </h1>
      <div class="actions">
        <button type="button" class="btn primary" id="btn-login">⛵ Войти через osu!</button>
        <button type="button" class="btn ghost hidden" id="btn-logout">Отчалить ⛵</button>
      </div>
    </header>
    <nav class="tabs" aria-label="Режим графа">
      <button type="button" class="tab active" data-tab="friends">Мои друзья</button>
      <button type="button" class="tab" data-tab="world">Мировой океан</button>
    </nav>
    <div class="graph-mutual-options" id="graph-mutual-options">
      <div class="graph-mutual-row" id="friends-mutual-row">
        <label class="friends-mutual-label">
          <input type="checkbox" id="friends-mutual-only" />
          <span>Мои друзья: только взаимные</span>
        </label>
      </div>
      <div class="graph-mutual-row hidden" id="world-mutual-row">
        <label class="friends-mutual-label">
          <input type="checkbox" id="world-mutual-only" />
          <span>Мировой океан: только взаимные связи</span>
        </label>
      </div>
    </div>
    <div class="main-stage">
      <div class="graph-area">
        <canvas class="graph" id="graph-canvas" aria-label="Карта друзей"></canvas>
      </div>
    </div>
    <div class="floating-graph-tools">
      <label class="graph-search-micro graph-search-with-icon graph-search-wrap">
        <span class="visually-hidden">Фильтр по нику</span>
        <span class="graph-search-icon" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        </span>
        <input
          type="search"
          id="graph-search"
          class="graph-search graph-search--micro"
          placeholder="Enter nickname"
          title="До 3 фрагментов через запятую; подсказки при вводе"
          enterkeyhint="search"
          autocomplete="off"
          spellcheck="false"
        />
        <div
          id="graph-search-suggestions"
          class="graph-search-suggestions hidden"
          role="listbox"
          aria-label="Подсказки по нику"
        ></div>
      </label>
      <div class="player-floating-panel hidden" id="player-floating-panel">
        <aside class="player-card" id="player-card" aria-label="Карточка игрока">
          <div class="player-card-head">
            <span class="player-card-flag-wrap hidden" id="pc-flag-wrap" aria-hidden="true">
              <img class="player-card-flag" id="pc-flag" alt="" loading="lazy" decoding="async" />
            </span>
            <div class="player-card-head-text">
              <div class="player-card-name" id="pc-name">—</div>
              <div class="player-card-country" id="pc-country">—</div>
            </div>
            <img class="player-card-avatar" id="pc-avatar" alt="" width="56" height="56" loading="lazy" />
          </div>
          <div class="player-card-stats">
            <div class="player-card-row"><span class="player-card-label">Рейтинг (мир)</span><span class="player-card-value" id="pc-rank">—</span></div>
            <div class="player-card-row"><span class="player-card-label">PP (osu!)</span><span class="player-card-value" id="pc-pp">—</span></div>
            <div class="player-card-row"><span class="player-card-label">Время в игре</span><span class="player-card-value" id="pc-playtime">—</span></div>
            <div class="player-card-row"><span class="player-card-label">Локация</span><span class="player-card-value" id="pc-location">—</span></div>
          </div>
        </aside>
        <section class="player-subpanel" aria-labelledby="pc-best-head">
          <h3 class="player-subpanel-title" id="pc-best-head">Топ скоры</h3>
          <div class="player-subpanel-body" id="pc-best-scores-list"></div>
        </section>
        <section class="player-subpanel" aria-labelledby="pc-played-head">
          <h3 class="player-subpanel-title" id="pc-played-head">Чаще всего играл</h3>
          <div class="player-subpanel-body" id="pc-most-played-list"></div>
        </section>
      </div>
    </div>
    <div class="fish-deco fish-deco--1" aria-hidden="true"><div class="fish-swim">
      <svg viewBox="0 0 120 60" class="fish-svg"><path d="M0,30 L30,10 L30,20 L80,20 Q100,10 120,30 Q100,50 80,40 L30,40 L30,50 Z" fill="rgba(0,180,216,0.3)" stroke="rgba(0,180,216,0.4)" stroke-width="1.5"/><circle cx="85" cy="25" r="3" fill="rgba(255,255,255,0.35)"/><path d="M80,20 Q95,30 80,40" fill="none" stroke="rgba(0,180,216,0.35)" stroke-width="1.5"/></svg>
    </div></div>
    <div class="fish-deco fish-deco--2" aria-hidden="true"><div class="fish-swim">
      <svg viewBox="0 0 120 60" class="fish-svg"><path d="M0,30 Q15,10 40,10 Q80,10 110,30 Q80,50 40,50 Q15,50 0,30 Z" fill="rgba(231,111,81,0.25)" stroke="rgba(231,111,81,0.4)" stroke-width="1.5"/><circle cx="30" cy="25" r="3.5" fill="rgba(255,255,255,0.3)"/><path d="M95,15 L120,30 L95,45" fill="none" stroke="rgba(231,111,81,0.35)" stroke-width="2"/></svg>
    </div></div>
    <div class="fish-deco fish-deco--3" aria-hidden="true"><div class="fish-swim">
      <svg viewBox="0 0 100 50" class="fish-svg"><path d="M0,25 L20,8 Q55,8 80,25 Q55,42 20,42 Z" fill="rgba(233,196,106,0.25)" stroke="rgba(233,196,106,0.4)" stroke-width="1.5"/><circle cx="25" cy="20" r="2.5" fill="rgba(255,255,255,0.3)"/><path d="M72,15 Q90,25 72,35" fill="none" stroke="rgba(233,196,106,0.35)" stroke-width="2"/></svg>
    </div></div>
    <div class="fish-deco fish-deco--4" aria-hidden="true"><div class="fish-swim">
      <svg viewBox="0 0 130 70" class="fish-svg"><ellipse cx="50" cy="35" rx="45" ry="20" fill="rgba(0,119,182,0.25)" stroke="rgba(0,119,182,0.4)" stroke-width="1.5"/><circle cx="25" cy="28" r="3" fill="rgba(255,255,255,0.3)"/><path d="M90,20 L120,35 L90,50" fill="none" stroke="rgba(0,119,182,0.35)" stroke-width="2.5"/><path d="M50,35 Q65,15 90,20" fill="none" stroke="rgba(0,119,182,0.25)" stroke-width="1.5"/></svg>
    </div></div>
    <div class="fish-deco fish-deco--5" aria-hidden="true"><div class="fish-swim">
      <svg viewBox="0 0 100 50" class="fish-svg"><path d="M0,25 L25,8 L60,8 Q90,8 100,25 Q90,42 60,42 L25,42 Z" fill="rgba(0,180,216,0.2)" stroke="rgba(0,180,216,0.3)" stroke-width="1.5"/><circle cx="35" cy="20" r="2.5" fill="rgba(255,255,255,0.25)"/><path d="M60,15 Q75,25 60,35" fill="none" stroke="rgba(0,180,216,0.3)" stroke-width="1.5"/></svg>
    </div></div>
    <div class="fish-deco fish-deco--6" aria-hidden="true"><div class="fish-swim">
      <svg viewBox="0 0 110 55" class="fish-svg"><path d="M10,27 Q30,5 60,8 Q90,10 105,27 Q90,45 60,47 Q30,50 10,27 Z" fill="rgba(231,111,81,0.2)" stroke="rgba(231,111,81,0.3)" stroke-width="1.5"/><circle cx="35" cy="22" r="3" fill="rgba(255,255,255,0.25)"/></svg>
    </div></div>
    <div class="fish-deco fish-deco--7" aria-hidden="true"><div class="fish-swim">
      <svg viewBox="0 0 80 40" class="fish-svg"><path d="M0,20 Q12,5 35,5 Q60,5 75,20 Q60,35 35,35 Q12,35 0,20 Z" fill="rgba(0,180,216,0.18)" stroke="rgba(0,180,216,0.28)" stroke-width="1.5"/><circle cx="20" cy="16" r="2" fill="rgba(255,255,255,0.25)"/><path d="M55,12 L72,20 L55,28" fill="none" stroke="rgba(0,180,216,0.28)" stroke-width="1.8"/></svg>
    </div></div>
    <div class="fish-deco fish-deco--8" aria-hidden="true"><div class="fish-swim">
      <svg viewBox="0 0 140 70" class="fish-svg"><path d="M10,35 Q40,10 80,15 Q115,18 130,35 Q115,55 80,58 Q40,62 10,35 Z" fill="rgba(233,196,106,0.18)" stroke="rgba(233,196,106,0.28)" stroke-width="1.5"/><circle cx="45" cy="28" r="3.5" fill="rgba(255,255,255,0.25)"/><path d="M80,25 Q100,35 80,48" fill="none" stroke="rgba(233,196,106,0.28)" stroke-width="2"/></svg>
    </div></div>
    <div class="mc-item mc-item--diamond" aria-hidden="true">
      <svg viewBox="0 0 40 40" class="mc-svg"><polygon points="20,2 36,14 30,36 10,36 4,14" fill="#5dc8ec" stroke="#3b8cb5" stroke-width="1.5"/><polygon points="20,2 36,14 20,20 4,14" fill="#7ee4ff" opacity="0.6"/></svg>
    </div>
    <div class="mc-item mc-item--pickaxe" aria-hidden="true">
      <svg viewBox="0 0 40 40" class="mc-svg"><rect x="18" y="22" width="4" height="16" rx="1" fill="#6b4226" stroke="#4a2d18" stroke-width="1"/><polygon points="12,4 28,4 24,20 16,20" fill="#5dc8ec" stroke="#3b8cb5" stroke-width="1.5" transform="rotate(-15,20,12)"/></svg>
    </div>
    <div class="mc-item mc-item--grass" aria-hidden="true">
      <svg viewBox="0 0 40 40" class="mc-svg"><rect x="4" y="20" width="32" height="16" fill="#6b4226" stroke="#4a2d18" stroke-width="1.5"/><rect x="4" y="4" width="32" height="16" fill="#5da832" stroke="#4a2d18" stroke-width="1.5"/></svg>
    </div>
    <div class="mc-item mc-item--sword" aria-hidden="true">
      <svg viewBox="0 0 40 40" class="mc-svg"><rect x="17" y="4" width="6" height="22" rx="1" fill="#aaa" stroke="#777" stroke-width="1"/><rect x="14" y="26" width="12" height="4" rx="2" fill="#6b4226" stroke="#4a2d18" stroke-width="1"/><rect x="16" y="25" width="8" height="2" fill="#888"/></svg>
    </div>
    <div class="steve-character" aria-hidden="true">
      <div class="steve-waving-arm">
        <svg viewBox="0 0 40 50" class="steve-arm-svg">
          <rect x="14" y="5" width="12" height="24" rx="3" fill="#c8915c" stroke="#8b5e3c" stroke-width="0.8"/>
          <rect x="10" y="29" width="20" height="10" rx="3" fill="#66b5d1" stroke="#4a8ba3" stroke-width="0.8"/>
        </svg>
      </div>
      <svg viewBox="0 0 80 110" class="steve-head-svg">
        <rect x="20" y="4" width="40" height="6" rx="1" fill="#c8915c" stroke="#8b5e3c" stroke-width="0.8"/>
        <rect x="15" y="10" width="50" height="30" rx="2" fill="#c8915c" stroke="#8b5e3c" stroke-width="0.8"/>
        <rect x="22" y="16" width="9" height="8" rx="1" fill="#2a2a2a"/>
        <rect x="34" y="16" width="9" height="8" rx="1" fill="#2a2a2a"/>
        <rect x="23" y="17" width="7" height="2" fill="#fff" opacity="0.35"/>
        <rect x="35" y="17" width="7" height="2" fill="#fff" opacity="0.35"/>
        <rect x="24" y="29" width="17" height="4" rx="1" fill="#2a2a2a"/>
        <rect x="15" y="40" width="50" height="28" rx="2" fill="#66b5d1" stroke="#4a8ba3" stroke-width="0.8"/>
        <rect x="5" y="40" width="12" height="28" rx="2" fill="#66b5d1" stroke="#4a8ba3" stroke-width="0.8"/>
        <rect x="20" y="68" width="16" height="32" rx="2" fill="#3b5e8c" stroke="#2a4373" stroke-width="0.8"/>
        <rect x="44" y="68" width="16" height="32" rx="2" fill="#3b5e8c" stroke="#2a4373" stroke-width="0.8"/>
        <rect x="15" y="100" width="20" height="8" rx="2" fill="#5a3a1a" stroke="#3a2210" stroke-width="0.8"/>
        <rect x="45" y="100" width="20" height="8" rx="2" fill="#5a3a1a" stroke="#3a2210" stroke-width="0.8"/>
      </svg>
      <div class="speech-bubble">
        <span>Заходи, бро!</span>
      </div>
    </div>
    <div class="wave-divider" aria-hidden="true">
      <svg viewBox="0 0 1200 40" preserveAspectRatio="none" width="100%" height="40">
        <path d="M0,20 C200,0 400,40 600,20 C800,0 1000,40 1200,20 L1200,40 L0,40 Z" fill="rgba(0,180,216,0.06)"/>
        <path d="M0,30 C200,15 400,45 600,30 C800,15 1000,45 1200,30 L1200,40 L0,40 Z" fill="rgba(0,180,216,0.04)"/>
      </svg>
    </div>
    <div class="status-dock" id="status-dock">
      <div class="view-mode-toolbar" role="toolbar" aria-label="Вид графа">
        <button type="button" class="view-mode-btn view-mode-btn--active" data-view="force" aria-pressed="true">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="6" r="2.5"/><circle cx="6" cy="17" r="2.5"/><circle cx="18" cy="17" r="2.5"/><path d="M10.5 8L7 15m6.5-7 3.5 7"/></svg>
        </button>
        <button type="button" class="view-mode-btn" data-view="tree" aria-pressed="false">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 4v5M12 9H7M12 9h5M7 14v6M17 14v6"/></svg>
        </button>
        <button type="button" class="view-mode-btn" data-view="radial" aria-pressed="false">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/></svg>
        </button>
        <button type="button" class="view-mode-btn" data-view="grid" aria-pressed="false">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 4h6v6H4zm10 0h6v6h-6zm0 10h6v6h-6zm-10 0h6v6H4z"/></svg>
        </button>
      </div>
      <div class="status-bar" id="status-bar" role="status" aria-live="polite"></div>
    </div>
  </div>
`;

const brandHomeLink = app.querySelector<HTMLAnchorElement>(".brand-home-link");
if (brandHomeLink) {
  brandHomeLink.href = import.meta.env.BASE_URL;
}

const btnLogin = app.querySelector<HTMLButtonElement>("#btn-login")!;
const btnLogout = app.querySelector<HTMLButtonElement>("#btn-logout")!;
const statusBar = app.querySelector<HTMLElement>("#status-bar")!;
const tabButtons = app.querySelectorAll<HTMLButtonElement>(".tab");
const canvas = app.querySelector<HTMLCanvasElement>("#graph-canvas")!;

const playerFloatingPanel = app.querySelector<HTMLElement>("#player-floating-panel")!;
const pcBestScoresList = app.querySelector<HTMLElement>("#pc-best-scores-list")!;
const pcMostPlayedList = app.querySelector<HTMLElement>("#pc-most-played-list")!;
const pcFlagWrap = app.querySelector<HTMLElement>("#pc-flag-wrap")!;
const pcFlag = app.querySelector<HTMLImageElement>("#pc-flag")!;
const pcName = app.querySelector<HTMLElement>("#pc-name")!;
const pcCountry = app.querySelector<HTMLElement>("#pc-country")!;
const pcAvatar = app.querySelector<HTMLImageElement>("#pc-avatar")!;
const pcRank = app.querySelector<HTMLElement>("#pc-rank")!;
const pcPp = app.querySelector<HTMLElement>("#pc-pp")!;
const pcPlaytime = app.querySelector<HTMLElement>("#pc-playtime")!;
const pcLocation = app.querySelector<HTMLElement>("#pc-location")!;
const graphSearch = app.querySelector<HTMLInputElement>("#graph-search")!;
const graphSearchSuggestions = app.querySelector<HTMLDivElement>("#graph-search-suggestions")!;
const shellEl = app.querySelector<HTMLElement>(".shell")!;
const tabsEl = app.querySelector<HTMLElement>(".tabs")!;
const graphMutualOptions = app.querySelector<HTMLElement>("#graph-mutual-options")!;
const friendsMutualRow = app.querySelector<HTMLElement>("#friends-mutual-row")!;
const worldMutualRow = app.querySelector<HTMLElement>("#world-mutual-row")!;
const friendsMutualOnlyInput = app.querySelector<HTMLInputElement>("#friends-mutual-only")!;
const worldMutualOnlyInput = app.querySelector<HTMLInputElement>("#world-mutual-only")!;

function syncFloatingToolsTop(): void {
  let bottom = tabsEl.getBoundingClientRect().bottom;
  bottom = Math.max(bottom, graphMutualOptions.getBoundingClientRect().bottom);
  const gap = 8;
  const topPx = Math.round(bottom + gap);
  shellEl.style.setProperty("--floating-tools-top", `${topPx}px`);
  const reserveBottom = 20;
  const maxPanel = Math.max(200, Math.round(window.innerHeight - topPx - reserveBottom));
  shellEl.style.setProperty("--player-floating-max-h", `${maxPanel}px`);
}

function setListsPlaceholder(el: HTMLElement, text: string): void {
  el.replaceChildren();
  const p = document.createElement("p");
  p.className = "player-subpanel-empty";
  p.textContent = text;
  el.appendChild(p);
}

function renderBestScoresList(items: OsuBestScoreRow[]): void {
  pcBestScoresList.replaceChildren();
  if (items.length === 0) {
    setListsPlaceholder(pcBestScoresList, "Нет лучших скоров");
    return;
  }
  for (const it of items) {
    const row = document.createElement("div");
    row.className = "map-score-row";
    if (it.scorePageUrl) {
      row.classList.add("map-score-row--clickable");
      row.tabIndex = 0;
      row.setAttribute("role", "link");
      row.setAttribute("aria-label", `Скор на osu!: ${it.title}`);
      const openScore = (): void => {
        window.open(it.scorePageUrl!, "_blank", "noopener,noreferrer");
      };
      row.addEventListener("click", openScore);
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openScore();
        }
      });
    }
    const img = document.createElement("img");
    img.className = "map-score-row-cover";
    img.alt = "";
    img.loading = "lazy";
    if (it.coverUrl) img.src = it.coverUrl;
    else img.classList.add("map-score-row-cover--ph");
    const textCol = document.createElement("div");
    textCol.className = "map-score-row-text";
    const t = document.createElement("div");
    t.className = "map-score-row-title";
    t.textContent = it.title;
    const v = document.createElement("div");
    v.className = "map-score-row-version";
    v.textContent = it.version;
    textCol.append(t, v);
    if (it.modAcronyms.length > 0) {
      const modsRow = document.createElement("div");
      modsRow.className = "map-score-mods";
      modsRow.addEventListener("click", (e) => e.stopPropagation());
      for (const ac of it.modAcronyms) {
        const label = osuModDisplayName(ac);
        const iconUrl = osuModIconUrl(ac);
        if (iconUrl) {
          const wrap = document.createElement("span");
          wrap.className = "map-score-mod-wrap";
          wrap.title = label;
          const mi = document.createElement("img");
          mi.className = "map-score-mod-icon";
          mi.src = iconUrl;
          mi.alt = "";
          mi.loading = "lazy";
          mi.draggable = false;
          wrap.appendChild(mi);
          modsRow.appendChild(wrap);
        } else {
          const fb = document.createElement("span");
          fb.className = "map-score-mod-fallback";
          fb.textContent = ac;
          fb.title = label;
          modsRow.appendChild(fb);
        }
      }
      textCol.appendChild(modsRow);
    }
    const stat = document.createElement("div");
    stat.className = "map-score-row-stat";
    if (it.rankIconUrl) {
      const rankImg = document.createElement("img");
      rankImg.className = "map-score-rank";
      rankImg.src = it.rankIconUrl;
      rankImg.alt = it.rank;
      rankImg.loading = "lazy";
      stat.appendChild(rankImg);
    } else if (it.rank && it.rank !== "—") {
      const rankFb = document.createElement("span");
      rankFb.className = "map-score-rank-fallback";
      rankFb.textContent = it.rank;
      stat.appendChild(rankFb);
    }
    const metrics = document.createElement("div");
    metrics.className = "map-score-metrics";
    const ppStr = it.pp != null ? `${Math.round(it.pp)} pp` : "—";
    const ppEl = document.createElement("span");
    ppEl.className = "map-score-pp";
    ppEl.textContent = ppStr;
    const accEl = document.createElement("span");
    accEl.className = "map-score-acc";
    accEl.textContent = `${it.accuracyPct.toFixed(1)}%`;
    metrics.append(ppEl, accEl);
    stat.appendChild(metrics);
    row.append(img, textCol, stat);
    pcBestScoresList.appendChild(row);
  }
}

function renderMostPlayedList(items: OsuMostPlayedRow[]): void {
  pcMostPlayedList.replaceChildren();
  if (items.length === 0) {
    setListsPlaceholder(pcMostPlayedList, "Нет данных об играх");
    return;
  }
  for (const it of items) {
    const row = document.createElement("div");
    row.className = "map-score-row";
    const img = document.createElement("img");
    img.className = "map-score-row-cover";
    img.alt = "";
    img.loading = "lazy";
    if (it.coverUrl) img.src = it.coverUrl;
    else img.classList.add("map-score-row-cover--ph");
    const textCol = document.createElement("div");
    textCol.className = "map-score-row-text";
    const t = document.createElement("div");
    t.className = "map-score-row-title";
    t.textContent = it.title;
    const v = document.createElement("div");
    v.className = "map-score-row-version";
    v.textContent = it.version;
    textCol.append(t, v);
    const stat = document.createElement("div");
    stat.className = "map-score-row-stat";
    stat.textContent = `${it.playCount.toLocaleString("ru-RU")}×`;
    row.append(img, textCol, stat);
    pcMostPlayedList.appendChild(row);
  }
}

function formatPlayTime(sec: number | null): string {
  if (sec == null || sec <= 0) return "—";
  const h = Math.floor(sec / 3600);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d} д ${h % 24} ч`;
  if (h >= 1) return `${h} ч`;
  const m = Math.floor(sec / 60);
  return `${m} мин`;
}

/** Как в osu-web `flag-country.tsx`: SVG с osu.ppy.sh, не растровый CDN. */
function osuWebFlagSvgUrl(countryCode: string): string | null {
  const up = countryCode.trim().toUpperCase();
  if (up.length !== 2 || !/^[A-Z]{2}$/.test(up)) return null;
  const baseFileName = [...up]
    .map((c) => (c.charCodeAt(0) + 127397).toString(16))
    .join("-");
  return `https://osu.ppy.sh/assets/images/flags/${baseFileName}.svg`;
}

type CardProfileState = "idle" | "loading" | "ok" | "error" | "unauth";
let cardProfileUserId: number | null = null;
let cardProfileState: CardProfileState = "idle";
let profileRequestSeq = 0;

const graph = new CircleGraph(canvas, {
  onNodeClick(userId, username) {
    void openPlayerCard(userId, username);
  },
  onBackgroundClick: () => closePlayerCard(),
});

const viewModeButtons = app.querySelectorAll<HTMLButtonElement>(".view-mode-btn[data-view]");

function isGraphViewMode(v: string | undefined): v is GraphViewMode {
  return v === "force" || v === "tree" || v === "radial" || v === "grid";
}

function syncViewModeToolbar(): void {
  const m = graph.getViewMode();
  viewModeButtons.forEach((btn) => {
    const v = btn.dataset.view;
    if (!isGraphViewMode(v)) return;
    btn.title = VIEW_MODE_LABELS[v];
    btn.setAttribute("aria-label", VIEW_MODE_LABELS[v]);
    const on = v === m;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.classList.toggle("view-mode-btn--active", on);
  });
}

viewModeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const v = btn.dataset.view;
    if (!isGraphViewMode(v)) return;
    graph.setViewMode(v);
    syncViewModeToolbar();
  });
});

syncViewModeToolbar();

function syncPlayerCardProfileHits(): void {
  const on = cardProfileUserId != null;
  pcName.classList.toggle("player-card-profile-hit", on);
  pcAvatar.classList.toggle("player-card-profile-hit", on);
}

function openOsuProfileFromCard(): void {
  if (cardProfileUserId == null) return;
  window.open(`https://osu.ppy.sh/users/${cardProfileUserId}`, "_blank", "noopener,noreferrer");
}

pcName.addEventListener("click", () => {
  openOsuProfileFromCard();
});
pcAvatar.addEventListener("click", () => {
  openOsuProfileFromCard();
});

function closePlayerCard(): void {
  playerFloatingPanel.classList.add("hidden");
  pcBestScoresList.replaceChildren();
  pcMostPlayedList.replaceChildren();
  graph.setSelectedUserId(null);
  cardProfileUserId = null;
  cardProfileState = "idle";
  profileRequestSeq += 1;
  syncPlayerCardProfileHits();
}

function showCardLoading(username: string): void {
  playerFloatingPanel.classList.remove("hidden");
  pcName.textContent = username;
  pcCountry.textContent = "…";
  pcFlagWrap.classList.add("hidden");
  pcAvatar.classList.add("hidden");
  pcRank.textContent = "…";
  pcPp.textContent = "…";
  pcPlaytime.textContent = "…";
  pcLocation.textContent = "…";
  setListsPlaceholder(pcBestScoresList, "Загрузка…");
  setListsPlaceholder(pcMostPlayedList, "Загрузка…");
  syncPlayerCardProfileHits();
}

function fillPlayerCard(p: OsuUserProfile): void {
  pcName.textContent = p.username;
  if (p.country) {
    pcCountry.textContent = p.country.name;
    const flagUrl = osuWebFlagSvgUrl(p.country.code);
    if (flagUrl) {
      pcFlagWrap.classList.remove("hidden");
      pcFlagWrap.setAttribute("aria-hidden", "false");
      pcFlag.alt = p.country.name;
      pcFlag.src = flagUrl;
    } else {
      pcFlagWrap.classList.add("hidden");
      pcFlagWrap.setAttribute("aria-hidden", "true");
    }
  } else {
    pcCountry.textContent = "—";
    pcFlagWrap.classList.add("hidden");
    pcFlagWrap.setAttribute("aria-hidden", "true");
  }
  if (p.avatar_url) {
    pcAvatar.classList.remove("hidden");
    pcAvatar.src = p.avatar_url;
    pcAvatar.alt = p.username;
  } else {
    pcAvatar.classList.add("hidden");
  }
  pcRank.textContent =
    p.global_rank != null ? `#${p.global_rank.toLocaleString("ru-RU")}` : "нет в глобальном PP";
  pcPp.textContent = p.pp != null ? `${Math.round(p.pp).toLocaleString("ru-RU")} pp` : "—";
  pcPlaytime.textContent = formatPlayTime(p.play_time);
  pcLocation.textContent = p.location?.trim() || "—";
  syncPlayerCardProfileHits();
}

async function openPlayerCard(userId: number, fallbackName: string): Promise<void> {
  graph.setSelectedUserId(userId);

  const cardOpen = !playerFloatingPanel.classList.contains("hidden");
  if (cardOpen && userId === cardProfileUserId) {
    if (cardProfileState === "ok" || cardProfileState === "loading" || cardProfileState === "unauth") {
      return;
    }
  }

  const token = getStoredAccessToken();
  if (!token) {
    cardProfileUserId = userId;
    cardProfileState = "unauth";
    playerFloatingPanel.classList.remove("hidden");
    pcName.textContent = fallbackName;
    pcCountry.textContent = "Войдите, капитан!";
    pcFlagWrap.classList.add("hidden");
    pcFlagWrap.setAttribute("aria-hidden", "true");
    pcAvatar.classList.add("hidden");
    pcRank.textContent = "—";
    pcPp.textContent = "—";
    pcPlaytime.textContent = "—";
    pcLocation.textContent = "—";
    setListsPlaceholder(pcBestScoresList, "Войдите, капитан!");
    setListsPlaceholder(pcMostPlayedList, "Войдите, капитан!");
    syncPlayerCardProfileHits();
    return;
  }

  cardProfileUserId = userId;
  cardProfileState = "loading";
  const seq = ++profileRequestSeq;
  showCardLoading(fallbackName);
  try {
    const [p, bestRows, mostRows] = await Promise.all([
      fetchUserProfile(userId, token),
      fetchUserBestScores(userId, token, 5).catch(() => [] as OsuBestScoreRow[]),
      fetchUserMostPlayed(userId, token, 5).catch(() => [] as OsuMostPlayedRow[]),
    ]);
    if (seq !== profileRequestSeq) return;
    fillPlayerCard(p);
    renderBestScoresList(bestRows);
    renderMostPlayedList(mostRows);
    cardProfileState = "ok";
  } catch (e) {
    if (seq !== profileRequestSeq) return;
    cardProfileState = "error";
    pcName.textContent = fallbackName;
    const msgErr = e instanceof Error ? e.message : "";
    const is403 = msgErr.includes("403");
    pcCountry.textContent = is403
      ? "403: нужен скоп public. Выйдите из приложения и войдите через osu! снова (разрешите новые права)."
      : "Не удалось загрузить профиль.";
    pcFlagWrap.classList.add("hidden");
    pcFlagWrap.setAttribute("aria-hidden", "true");
    pcAvatar.classList.add("hidden");
    pcRank.textContent = "—";
    pcPp.textContent = "—";
    pcPlaytime.textContent = "—";
    pcLocation.textContent = "—";
    setListsPlaceholder(pcBestScoresList, "Не удалось загрузить");
    setListsPlaceholder(pcMostPlayedList, "Не удалось загрузить");
    syncPlayerCardProfileHits();
  }
}

let cache: { me: OsuUser; friends: OsuFriendUser[] } | null = null;
let worldRaw: {
  nodes: OsuUser[];
  edges: [number, number][];
  mutual_edges: [number, number][];
} | null = null;
let currentTab: "friends" | "world" = "friends";

/** Фильтр графа «Мои друзья»: только взаимная дружба (оба добавили друг друга в osu!). */
let friendsMutualOnly = false;

/** Фильтр «Весь мир»: только рёбра из взаимных пар (записано при contribute с mutual из API). */
let worldMutualOnly = false;

function getFriendsForGraphView(): OsuFriendUser[] {
  if (!cache) return [];
  if (!friendsMutualOnly) return cache.friends;
  return cache.friends.filter((f) => f.mutual === true);
}

/** Рёбра для вкладки «Весь мир». */
function getWorldEdgesForView(): [number, number][] {
  if (!worldRaw) return [];
  if (worldMutualOnly) {
    return worldRaw.mutual_edges ?? [];
  }
  return worldRaw.edges;
}

/** Рёбра из БД мира для вкладки «Друзья» (учитываем отдельный фильтр взаимных). */
function getFriendsTabWorldEdges(allowedIds: Set<number>): [number, number][] {
  if (!worldRaw) return [];
  const src =
    friendsMutualOnly && worldRaw.mutual_edges.length > 0
      ? worldRaw.mutual_edges
      : worldRaw.edges;
  return src.filter(([a, b]) => allowedIds.has(a) && allowedIds.has(b));
}

/** Подграф: выбранный игрок + соседи по рёбрам (после клика по подсказке). */
let searchSubgraphCenterId: number | null = null;

function findUserInLoadedData(userId: number): OsuUser | undefined {
  if (cache) {
    if (cache.me.id === userId) return cache.me;
    const f = cache.friends.find((u) => u.id === userId);
    if (f) return f;
  }
  return worldRaw?.nodes.find((n) => n.id === userId);
}

/** Узлы center + все соседи по рёбрам внутри pool. */
function neighborSubgraphFromEdges(
  centerId: number,
  poolUsers: OsuUser[],
  allEdges: [number, number][],
): { users: OsuUser[]; edges: [number, number][] } {
  const poolIds = new Set(poolUsers.map((u) => u.id));
  if (!poolIds.has(centerId)) {
    return { users: [], edges: [] };
  }
  const keep = new Set<number>([centerId]);
  for (const [a, b] of allEdges) {
    if (a === centerId && poolIds.has(b)) keep.add(b);
    else if (b === centerId && poolIds.has(a)) keep.add(a);
  }
  const users = poolUsers.filter((u) => keep.has(u.id));
  const allow = new Set(users.map((u) => u.id));
  const edges = allEdges.filter(([a, b]) => allow.has(a) && allow.has(b));
  return { users, edges };
}

/** Сегмент строки поиска, по которому ищем подсказки (после последней запятой). */
function getActiveSearchSegment(): string {
  const raw = graphSearch.value;
  const parts = raw.split(/[,;]+/);
  return (parts[parts.length - 1] ?? "").trim();
}

function syncSearchSubgraphFocus(): void {
  if (searchSubgraphCenterId === null) return;
  const u = findUserInLoadedData(searchSubgraphCenterId);
  if (!u) {
    searchSubgraphCenterId = null;
    return;
  }
  const seg = getActiveSearchSegment().toLowerCase();
  if (seg !== u.username.toLowerCase()) {
    searchSubgraphCenterId = null;
  }
}

function replaceActiveSearchSegmentWithUsername(username: string): void {
  const raw = graphSearch.value;
  const lastSep = Math.max(raw.lastIndexOf(","), raw.lastIndexOf(";"));
  if (lastSep === -1) {
    graphSearch.value = username;
    return;
  }
  graphSearch.value = `${raw.slice(0, lastSep + 1)} ${username}`;
}

/** Все кандидаты по сегменту, тот же порядок, что у автокомплита (первый = превью на графе). */
function getSortedSearchMatches(segmentLower: string): OsuUser[] {
  let candidates: OsuUser[] = [];
  if (currentTab === "friends") {
    if (!cache) return [];
    candidates = [cache.me, ...getFriendsForGraphView()];
  } else {
    if (!worldRaw?.nodes.length) return [];
    candidates = worldRaw.nodes;
  }
  const seg = segmentLower;
  return candidates
    .filter((u) => u.username.toLowerCase().includes(seg))
    .sort((a, b) => {
      const al = a.username.toLowerCase();
      const bl = b.username.toLowerCase();
      const as = al.startsWith(seg) ? 0 : 1;
      const bs = bl.startsWith(seg) ? 0 : 1;
      if (as !== bs) return as - bs;
      return a.username.localeCompare(b.username);
    });
}

function renderSearchSuggestions(): void {
  const seg = getActiveSearchSegment().toLowerCase();
  if (seg.length < 1) {
    graphSearchSuggestions.classList.add("hidden");
    graphSearchSuggestions.replaceChildren();
    return;
  }

  const sorted = getSortedSearchMatches(seg);
  if (sorted.length === 0) {
    graphSearchSuggestions.classList.add("hidden");
    graphSearchSuggestions.replaceChildren();
    return;
  }

  /** Один игрок и сегмент уже совпадает с полным ником — выбирать не из чего, список не показываем. */
  const sole = sorted[0];
  if (sorted.length === 1 && sole !== undefined && sole.username.toLowerCase() === seg) {
    graphSearchSuggestions.classList.add("hidden");
    graphSearchSuggestions.replaceChildren();
    return;
  }

  const matches = sorted.slice(0, 3);
  graphSearchSuggestions.replaceChildren();
  for (const u of matches) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "graph-search-suggestion";
    btn.setAttribute("role", "option");
    btn.textContent = u.username;
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      replaceActiveSearchSegmentWithUsername(u.username);
      searchSubgraphCenterId = u.id;
      graphSearchSuggestions.classList.add("hidden");
      graphSearchSuggestions.replaceChildren();
      void applyGraphFilter();
    });
    graphSearchSuggestions.appendChild(btn);
  }
  graphSearchSuggestions.classList.remove("hidden");
}

function parseSearchTokens(raw: string): string[] {
  return raw
    .split(/[,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, MAX_SEARCH_TOKENS);
}

function userMatchesAnyToken(u: OsuUser, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const name = u.username.toLowerCase();
  return tokens.some((t) => name.includes(t));
}

async function applyNeighborSubgraphAround(centerId: number): Promise<void> {
  if (currentTab === "friends") {
    if (!cache) {
      await graph.setWorldData([], []);
      return;
    }
    const { me } = cache;
    const friends = getFriendsForGraphView();
    const pool = [me, ...friends];
    const allowedIds = new Set(pool.map((u) => u.id));
    let edges = getFriendsTabWorldEdges(allowedIds);
    if (edges.length === 0 && friends.length > 0) {
      edges = friends.map((f): [number, number] => [me.id, f.id]);
    }
    const { users, edges: subEdges } = neighborSubgraphFromEdges(centerId, pool, edges);
    await graph.setWorldData(users, subEdges, { pinUserId: centerId });
    if (cardProfileUserId != null && !users.some((u) => u.id === cardProfileUserId)) {
      closePlayerCard();
    }
    return;
  }

  if (!worldRaw) {
    await graph.setWorldData([], []);
    return;
  }
  const { users, edges: subEdges } = neighborSubgraphFromEdges(
    centerId,
    worldRaw.nodes,
    getWorldEdgesForView(),
  );
  await graph.setWorldData(users, subEdges, { pinUserId: centerId });
  if (cardProfileUserId != null && !users.some((u) => u.id === cardProfileUserId)) {
    closePlayerCard();
  }
}

async function applyGraphFilter(): Promise<void> {
  syncSearchSubgraphFocus();

  const activeSeg = getActiveSearchSegment().toLowerCase();

  let centerId: number | null = null;
  if (searchSubgraphCenterId !== null) {
    const center = findUserInLoadedData(searchSubgraphCenterId);
    if (center && activeSeg === center.username.toLowerCase()) {
      centerId = searchSubgraphCenterId;
    }
  }
  if (centerId === null && activeSeg.length >= 1) {
    const sorted = getSortedSearchMatches(activeSeg);
    const head = sorted[0];
    if (head !== undefined) {
      centerId = head.id;
    }
  }

  if (centerId !== null) {
    await applyNeighborSubgraphAround(centerId);
    return;
  }

  const tokens = parseSearchTokens(graphSearch.value);

  if (currentTab === "friends") {
    if (!cache) {
      await graph.setWorldData([], []);
      return;
    }
    const { me } = cache;
    const friends = getFriendsForGraphView();
    const filteredFriends =
      tokens.length === 0 ? friends : friends.filter((f) => userMatchesAnyToken(f, tokens));
    const allowedIds = new Set<number>([me.id, ...filteredFriends.map((f) => f.id)]);
    const users: OsuUser[] = [me, ...filteredFriends];

    let edges = getFriendsTabWorldEdges(allowedIds);
    if (edges.length === 0 && filteredFriends.length > 0) {
      edges = filteredFriends.map((f): [number, number] => [me.id, f.id]);
    }

    await graph.setWorldData(users, edges, { pinUserId: me.id });
    if (
      cardProfileUserId != null &&
      cardProfileUserId !== me.id &&
      !filteredFriends.some((f) => f.id === cardProfileUserId)
    ) {
      closePlayerCard();
    }
    return;
  }

  if (!worldRaw) {
    await graph.setWorldData([], []);
    return;
  }
  const { nodes } = worldRaw;
  const baseEdges = getWorldEdgesForView();
  const filteredNodes =
    tokens.length === 0 ? nodes : nodes.filter((n) => userMatchesAnyToken(n, tokens));
  const idSet = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = baseEdges.filter(([a, b]) => idSet.has(a) && idSet.has(b));
  await graph.setWorldData(filteredNodes, filteredEdges);
  if (cardProfileUserId != null && !idSet.has(cardProfileUserId)) {
    closePlayerCard();
  }
}

let graphFilterDebounce: number | undefined;
let hideSearchSuggestionsTimer: number | undefined;

graphSearch.addEventListener("input", () => {
  syncSearchSubgraphFocus();
  renderSearchSuggestions();
  if (graphFilterDebounce != null) window.clearTimeout(graphFilterDebounce);
  graphFilterDebounce = window.setTimeout(() => void applyGraphFilter(), 140);
});

graphSearch.addEventListener("focus", () => {
  if (hideSearchSuggestionsTimer != null) {
    window.clearTimeout(hideSearchSuggestionsTimer);
    hideSearchSuggestionsTimer = undefined;
  }
  renderSearchSuggestions();
});

graphSearch.addEventListener("blur", () => {
  if (hideSearchSuggestionsTimer != null) window.clearTimeout(hideSearchSuggestionsTimer);
  hideSearchSuggestionsTimer = window.setTimeout(() => {
    graphSearchSuggestions.classList.add("hidden");
    hideSearchSuggestionsTimer = undefined;
  }, 200);
});

function setStatus(text: string, kind: "err" | "info" = "info"): void {
  statusBar.textContent = text;
  statusBar.classList.toggle("status-bar--err", kind === "err");
  if (!text) statusBar.classList.remove("status-bar--err");
}

function setAuthed(authed: boolean): void {
  btnLogin.classList.toggle("hidden", authed);
  btnLogout.classList.toggle("hidden", !authed);
}

function setActiveTab(tab: "friends" | "world"): void {
  currentTab = tab;
  tabButtons.forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  friendsMutualRow.classList.toggle("hidden", tab !== "friends");
  worldMutualRow.classList.toggle("hidden", tab !== "world");
  requestAnimationFrame(() => {
    syncFloatingToolsTop();
  });
}

async function renderFriendsTab(): Promise<void> {
  if (!cache) {
    setStatus("Войдите, капитан, чтобы увидеть карту друзей.");
    await applyGraphFilter();
    return;
  }
  const { friends } = cache;
  const view = getFriendsForGraphView();
  const mutualKnown = friends.some((f) => typeof f.mutual === "boolean");
  if (friends.length === 0) {
    setStatus("Друзей нет — на графе только вы");
  } else if (friendsMutualOnly) {
    if (!mutualKnown) {
      setStatus(
        "Фильтр «взаимные»: osu! не прислал поле mutual — граф пуст. Снимите галочку или перезайдите.",
      );
    } else if (view.length === 0) {
      setStatus(
        `Взаимных друзей нет (в списке ${friends.length}). Оба игрока должны добавить друг друга в osu!.`,
      );
    } else {
      setStatus(`Взаимных на графе: ${view.length} из ${friends.length} в списке`);
    }
  } else {
    setStatus(`Друзей: ${friends.length}`);
  }
  await applyGraphFilter();
}

function refreshWorldStatusBar(): void {
  if (!worldRaw) return;
  const m = worldRaw.mutual_edges.length;
  if (worldMutualOnly) {
    const e = getWorldEdgesForView().length;
    setStatus(
      e === 0 && m === 0
        ? `Взаимных связей в БД пока нет — зайдите на сайт с osu!, чтобы contribute записал mutual из API. Узлов: ${worldRaw.nodes.length}`
        : `Взаимные связи: ${e} рёбер (пар в БД: ${m}) · Узлов: ${worldRaw.nodes.length}`,
    );
  } else {
    setStatus(
      `Участников: ${worldRaw.nodes.length} · Связей: ${worldRaw.edges.length} · Взаимных пар в БД: ${m}`,
    );
  }
}

async function renderWorldTab(): Promise<void> {
    setStatus("Загружаем мировой океан…");
  try {
    const payload = await fetchWorldGraph();
    worldRaw = {
      nodes: payload.nodes,
      edges: payload.edges,
      mutual_edges: payload.mutual_edges ?? [],
    };
    if (worldRaw.nodes.length === 0) {
      setStatus("Общий граф пока пуст.");
    } else {
      refreshWorldStatusBar();
    }
  } catch (e) {
    const t = e instanceof Error ? e.message : String(e);
    setStatus(t, "err");
    worldRaw = null;
  }
  await applyGraphFilter();
}

async function applyCurrentTab(): Promise<void> {
  if (currentTab === "friends") await renderFriendsTab();
  else await renderWorldTab();
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab as "friends" | "world" | undefined;
    if (!tab) return;
    closePlayerCard();
    searchSubgraphCenterId = null;
    setActiveTab(tab);
    void applyCurrentTab();
  });
});

friendsMutualOnlyInput.addEventListener("change", () => {
  friendsMutualOnly = friendsMutualOnlyInput.checked;
  void renderFriendsTab();
});

worldMutualOnlyInput.addEventListener("change", () => {
  worldMutualOnly = worldMutualOnlyInput.checked;
  if (currentTab === "world" && worldRaw) {
    refreshWorldStatusBar();
    void applyGraphFilter();
  }
});

btnLogin.addEventListener("click", () => {
  try {
    window.location.href = buildAuthorizeUrl();
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), "err");
  }
});

btnLogout.addEventListener("click", () => {
  closePlayerCard();
  clearTokens();
  cache = null;
  worldRaw = null;
  searchSubgraphCenterId = null;
  graphSearch.value = "";
  graphSearchSuggestions.classList.add("hidden");
  graphSearchSuggestions.replaceChildren();
  setAuthed(false);
  setStatus("");
  friendsMutualOnlyInput.checked = false;
  friendsMutualOnly = false;
  worldMutualOnlyInput.checked = false;
  worldMutualOnly = false;
  setActiveTab("friends");
  void graph.setWorldData([], []);
});

async function bootstrap(): Promise<void> {
  if (await handleOAuthCallback()) {
    setStatus("Капитан на борту!");
  }

  const token = getStoredAccessToken();
  if (!token) {
    setAuthed(false);
    cache = null;
    await applyCurrentTab();
    return;
  }

  setAuthed(true);
  setStatus("Загрузка…");

  try {
    const emptyWorld = {
      nodes: [] as OsuUser[],
      edges: [] as [number, number][],
      mutual_edges: [] as [number, number][],
    };
    const [me, friends, worldPayload] = await Promise.all([
      fetchMe(token),
      fetchFriends(token),
      fetchWorldGraph().catch(() => emptyWorld),
    ]);
    cache = { me, friends };
    worldRaw = {
      nodes: worldPayload.nodes,
      edges: worldPayload.edges,
      mutual_edges: worldPayload.mutual_edges ?? [],
    };
    void contributeWorld(token);
    setActiveTab("friends");
    await applyCurrentTab();
  } catch (e) {
    const t = e instanceof Error ? e.message : String(e);
    setStatus(t, "err");
    cache = null;
    if (t.includes("401") || t.includes("403")) {
      clearTokens();
      setAuthed(false);
    }
  }
}

requestAnimationFrame(() => {
  syncFloatingToolsTop();
  requestAnimationFrame(syncFloatingToolsTop);
});
window.addEventListener("resize", syncFloatingToolsTop);
window.addEventListener("load", syncFloatingToolsTop);

bootstrap();
