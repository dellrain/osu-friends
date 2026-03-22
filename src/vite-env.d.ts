/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEV_PORT?: string;
  readonly VITE_OSU_CLIENT_ID: string;
  readonly VITE_OSU_REDIRECT_URI: string;
  readonly VITE_OSU_TOKEN_ENDPOINT?: string;
  readonly VITE_OSU_API_BASE?: string;
  readonly VITE_WORLD_API_BASE?: string;
  readonly VITE_BASE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
