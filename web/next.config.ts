import type { NextConfig } from "next";

// ---- security headers (AUDIT.md M-7) --------------------------------------------------------
// Enforced Content-Security-Policy = Privy's recommended base policy
// (docs.privy.io/security/implementation-guide/content-security-policy, "Base CSP configuration"
// + "Required domains") merged with what BYW itself needs. Every allowance beyond Privy's base is
// listed with its reason. Plus X-Frame-Options DENY / frame-ancestors 'none', nosniff, referrer and
// permissions policies, HSTS. Violations are reported to /api/csp-report (server logs) and the
// browser logs them to the console.
const isDev = process.env.NODE_ENV === "development";

// Local-only escape hatch for E2E checks of logged-in screens in a production build (?mock=1).
// Never set on Vercel: the build refuses it there.
if (process.env.NEXT_PUBLIC_E2E_MOCK === "1" && process.env.VERCEL) {
  throw new Error("NEXT_PUBLIC_E2E_MOCK must never be set on Vercel");
}

const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();

const PRIVY_FRAMES = ["https://auth.privy.io", "https://verify.walletconnect.com", "https://verify.walletconnect.org"];
const PRIVY_CONNECT = [
  "https://auth.privy.io",
  "wss://relay.walletconnect.com",
  "wss://relay.walletconnect.org",
  "wss://www.walletlink.org",
  "https://*.rpc.privy.systems",
  "https://explorer-api.walletconnect.com",
];
// BYW additions (beyond Privy's base):
//  - Supabase: avatars (public) and proof media (signed URLs) in img/media; the browser PUTs uploads
//    straight to a signed Supabase Storage URL (connect).
//  - Robinhood Chain public RPC: wagmi/viem read balances, simulate and wait for receipts in the browser.
const BYW_CONNECT = [supabaseOrigin, "https://rpc.mainnet.chain.robinhood.com", "https://rpc.testnet.chain.robinhood.com"].filter(Boolean);

const csp = [
  "default-src 'self'",
  // 'unsafe-inline': Next.js App Router streams its bootstrap/flight data as inline <script> tags.
  // Removing it needs per-request nonces, which would make every page dynamic (no static/PPR shells).
  // 'unsafe-eval' only in `next dev` (React Refresh). challenges.cloudflare.com: Privy's Turnstile.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin}`,
  // blob: plays back the in-app camera's recording before upload
  `media-src 'self' blob: ${supabaseOrigin}`,
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  `child-src ${PRIVY_FRAMES.join(" ")}`,
  `frame-src ${PRIVY_FRAMES.join(" ")} https://challenges.cloudflare.com`,
  `connect-src 'self' ${PRIVY_CONNECT.join(" ")} ${BYW_CONNECT.join(" ")}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "report-uri /api/csp-report",
  "report-to csp",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Reporting-Endpoints", value: 'csp="/api/csp-report"' },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // inlined at build time, so the ?mock branches are dead code in normal production builds
  env: { NEXT_PUBLIC_E2E_MOCK: process.env.NEXT_PUBLIC_E2E_MOCK === "1" ? "1" : "0" },
  /* config options here */
  cacheComponents: true,
  // The floating dev badge covers the bottom nav in screenshots.
  devIndicators: false,
  partialPrefetching: true,
  // The share-card routes read their fonts from disk; make sure they ship with the functions.
  outputFileTracingIncludes: {
    "/api/og/**": ["./src/assets/fonts/**", "./public/brand/byw-mark.svg"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // crews were renamed to wifies (3c-2b-2)
  async redirects() {
    return [{ source: "/crews", destination: "/wifies", permanent: true }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
