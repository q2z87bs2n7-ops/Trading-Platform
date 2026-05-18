/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Injected at build time from the root VERSION file (see vite.config.ts).
declare const __APP_VERSION__: string;
