/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GATEWAY_URL?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Test-only escape hatch for the admin bar; never set in the production build env. */
  readonly VITE_E2E_ADMIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
