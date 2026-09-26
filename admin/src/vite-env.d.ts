/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The deployed API origin. Unset in development - Vite proxies /api. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
