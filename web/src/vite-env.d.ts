/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL: string;
  readonly VITE_PRIVY_APP_ID: string;
  readonly VITE_PRIVY_CLIENT_ID?: string;
  readonly VITE_HL_NETWORK?: string;
  readonly VITE_HL_BUILDER_ADDRESS?: string;
  readonly VITE_HL_BUILDER_FEE_TENTHS_BPS?: string;
  readonly VITE_ARBITRUM_RPC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Git commit SHA baked in at build time (empty string in local dev). */
declare const __COMMIT_SHA__: string;
