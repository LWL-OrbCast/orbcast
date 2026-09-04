import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const frontendLib = path.resolve(root, '../frontend/src/lib');
const nktkasEsm = path.join(root, 'node_modules/@nktkas/hyperliquid/esm');

/**
 * hip4.ts lives under frontend/. Vite would otherwise resolve its deps via
 * `require` (CJS `script/*.js`) which has no named ESM exports — e.g.
 * `formatPrice` from `@nktkas/hyperliquid/utils`.
 */
function resolveSharedLibDeps(): Plugin {
  const lib = frontendLib.replace(/\\/g, '/');
  return {
    name: 'resolve-shared-lib-deps',
    enforce: 'pre',
    async resolveId(id, importer, opts) {
      if (!importer) return null;
      if (!importer.replace(/\\/g, '/').startsWith(lib)) return null;
      if (id.startsWith('.') || id.startsWith('\0') || path.isAbsolute(id)) return null;
      if (id === '@nktkas/hyperliquid/utils') {
        return path.join(nktkasEsm, 'utils/mod.js');
      }
      if (id === '@nktkas/hyperliquid') {
        return path.join(nktkasEsm, 'mod.js');
      }
      return this.resolve(id, path.join(root, 'src/main.tsx'), { ...opts, skipSelf: true });
    },
  };
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/**
 * Strict CSP — the agent key lives in IndexedDB, so any XSS is a fund-loss
 * event; this is the primary defence. Allowlist:
 *  - Hyperliquid REST/WS (orders, catalog),
 *  - Privy iframe + API (auth.privy.io, *.rpc.privy.systems) and the
 *    WalletConnect endpoints Privy's CSP guide requires,
 *  - our backend + the configured Arbitrum RPC,
 *  - Supabase Storage signed avatar URLs (`*.supabase.co`, img-src only),
 *  - API-Sports team/league crests on the EPL featured card (`*.api-sports.io`),
 *  - Google Fonts (stylesheet in index.html).
 * `frame-ancestors` is invalid inside a <meta> tag — it ships via HTTP headers
 * (public/_headers + the dev/preview servers below).
 */
function buildCsp(env: Record<string, string>): string {
  const backendOrigin = originOf((env.VITE_BACKEND_URL ?? '').trim());
  const rpcOrigin =
    originOf((env.VITE_ARBITRUM_RPC_URL ?? '').trim()) || 'https://arb1.arbitrum.io';
  const privyFrames = [
    'https://auth.privy.io',
    'https://verify.walletconnect.com',
    'https://verify.walletconnect.org',
  ];
  const connect = [
    "'self'",
    'https://api.hyperliquid.xyz',
    'wss://api.hyperliquid.xyz',
    'https://api.hyperliquid-testnet.xyz',
    'wss://api.hyperliquid-testnet.xyz',
    'https://auth.privy.io',
    'https://*.rpc.privy.systems',
    'wss://relay.walletconnect.com',
    'wss://relay.walletconnect.org',
    'https://explorer-api.walletconnect.com',
    rpcOrigin,
    backendOrigin,
  ].filter(Boolean);
  const supabaseOrigin = originOf((env.VITE_SUPABASE_URL ?? '').trim());
  const img = [
    "'self'",
    'data:',
    'blob:',
    backendOrigin,
    supabaseOrigin || 'https://*.supabase.co',
    'https://*.api-sports.io',
  ].filter(Boolean);
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    `img-src ${img.join(' ')}`,
    `connect-src ${connect.join(' ')}`,
    `frame-src ${privyFrames.join(' ')}`,
    `child-src ${privyFrames.join(' ')}`,
    "worker-src 'self' blob:",
  ].join('; ');
}

/** Injected only on `vite build` — the dev server needs inline HMR scripts. */
function cspMetaPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'orbcast-csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: buildCsp(env) },
            injectTo: 'head-prepend',
          },
        ],
      };
    },
  };
}

/** Header-only protections (meta CSP cannot express frame-ancestors). */
const FRAME_HEADERS = {
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
} as const;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, 'VITE_');
  // Vercel injects VERCEL_GIT_COMMIT_SHA at build time; anyone can verify the
  // served bundle against https://github.com/LWL-OrbCast/orbcast/commit/<sha>.
  const commitSha = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').trim();
  return {
    define: {
      __COMMIT_SHA__: JSON.stringify(commitSha),
    },
    plugins: [
      // Privy signTypedData uses Node `buffer` in the browser bundle.
      // https://docs.privy.io/basics/troubleshooting/react-frameworks#vite
      nodePolyfills({
        include: ['buffer', 'process'],
        globals: { Buffer: true, process: true, global: true },
      }),
      resolveSharedLibDeps(),
      react(),
      tailwindcss(),
      cspMetaPlugin(env),
    ],
    resolve: {
      alias: [
        { find: /^@hip4$/, replacement: path.join(frontendLib, 'hip4.ts') },
        { find: '@hip4/catalog', replacement: path.join(frontendLib, 'marketCatalog.ts') },
        { find: '@hip4/symbol', replacement: path.join(frontendLib, 'marketSymbol.ts') },
        { find: '@hip4/endpoints', replacement: path.join(frontendLib, 'hlEndpoints.ts') },
        { find: '@hip4/runtime', replacement: path.join(frontendLib, 'hip4Runtime.ts') },
        { find: '@theme/colors', replacement: path.resolve(root, '../frontend/src/theme/colors.ts') },
      ],
      conditions: ['import', 'module', 'browser', 'default'],
      dedupe: ['react', 'react-dom', '@nktkas/hyperliquid', 'viem'],
    },
    optimizeDeps: {
      include: [
        '@nktkas/hyperliquid',
        '@nktkas/hyperliquid/utils',
        '@privy-io/react-auth',
        'buffer',
        'viem',
      ],
    },
    server: {
      port: 5173,
      strictPort: true,
      headers: { ...FRAME_HEADERS },
      fs: {
        allow: [root, path.resolve(root, '..')],
      },
    },
    preview: {
      port: 5173,
      headers: { ...FRAME_HEADERS },
    },
  };
});
