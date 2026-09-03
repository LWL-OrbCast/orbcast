/** User-visible product name. Not the HIP-4 protocol, bundles, or schema. */
export const BRAND_NAME = 'OrbCast';
export const BRAND_DOMAIN = 'orbcast.xyz';
export const BRAND_SITE_URL = `https://${BRAND_DOMAIN}`;
export const BRAND_X_URL = 'https://x.com/HyperTrade_X';
export const BRAND_GITHUB_URL = 'https://github.com/LWL-OrbCast/orbcast';
export const BRAND_SUPPORT_EMAIL = `support@${BRAND_DOMAIN}`;

/** LWL whitepaper — served from Vite `web/public` at this path. */
export const BRAND_WHITEPAPER_PATH = '/whitepaper.pdf';
export const BRAND_WHITEPAPER_URL = `${BRAND_SITE_URL}${BRAND_WHITEPAPER_PATH}`;

/** HL `approveAgent` name — keep in sync across Expo + web. */
export const HL_AGENT_NAME = 'OrbCast';

/** EIP-712 domain for Bridge2 transfer intent — must match backend. */
export const WALLET_TRANSFER_INTENT_NAME = 'OrbCast Wallet Transfer';
