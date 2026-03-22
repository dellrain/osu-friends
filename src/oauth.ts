const STORAGE_ACCESS = "osu_access_token";
const STORAGE_REFRESH = "osu_refresh_token";
const STORAGE_STATE = "osu_oauth_state";

function randomState(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function getStoredAccessToken(): string | null {
  return sessionStorage.getItem(STORAGE_ACCESS);
}

export function clearTokens(): void {
  sessionStorage.removeItem(STORAGE_ACCESS);
  sessionStorage.removeItem(STORAGE_REFRESH);
}

export function buildAuthorizeUrl(): string {
  const clientId = import.meta.env.VITE_OSU_CLIENT_ID;
  const redirectUri = import.meta.env.VITE_OSU_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new Error("Задайте VITE_OSU_CLIENT_ID и VITE_OSU_REDIRECT_URI в .env");
  }
  const state = randomState();
  sessionStorage.setItem(STORAGE_STATE, state);
  const u = new URL("https://osu.ppy.sh/oauth/authorize");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "identify friends.read public");
  u.searchParams.set("state", state);
  return u.toString();
}

export async function handleOAuthCallback(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const err = params.get("error");
  if (err) {
    console.error("OAuth error:", err, params.get("error_description"));
    window.history.replaceState({}, "", window.location.pathname);
    return false;
  }
  if (!code || !state) return false;
  const expected = sessionStorage.getItem(STORAGE_STATE);
  sessionStorage.removeItem(STORAGE_STATE);
  if (!expected || state !== expected) {
    console.error("OAuth state mismatch");
    window.history.replaceState({}, "", window.location.pathname);
    return false;
  }

  const redirectUri = import.meta.env.VITE_OSU_REDIRECT_URI;
  const endpoint = import.meta.env.VITE_OSU_TOKEN_ENDPOINT?.trim();
  const tokenUrl = endpoint || "/api/osu-token";

  const r = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  });
  const data = (await r.json()) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };
  window.history.replaceState({}, "", window.location.pathname);

  if (!r.ok || !data.access_token) {
    console.error("Token exchange failed:", data);
    return false;
  }
  sessionStorage.setItem(STORAGE_ACCESS, data.access_token);
  if (data.refresh_token) sessionStorage.setItem(STORAGE_REFRESH, data.refresh_token);
  return true;
}
