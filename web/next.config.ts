import type { NextConfig } from "next";

// ---- security headers (AUDIT.md M-7) --------------------------------------------------------
// Enforced: no framing (X-Frame-Options + CSP frame-ancestors), nosniff, referrer and permissions
// policies. The full Content-Security-Policy ships REPORT-ONLY first so a missed host can't break
// login (Privy) or wallets; promote it to enforced once the browser console shows no violations.
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();
const RPC = ["https://rpc.mainnet.chain.robinhood.com", "https://rpc.testnet.chain.robinhood.com"];
const PRIVY = ["https://auth.privy.io", "https://*.privy.io", "https://*.privy.systems"];
const WALLETCONNECT_HTTP = ["https://*.walletconnect.com", "https://*.walletconnect.org", "https://*.web3modal.org", "https://*.reown.com"];
const WALLETCONNECT_WS = ["wss://relay.walletconnect.com", "wss://relay.walletconnect.org", "wss://www.walletlink.org"];

const reportOnlyCsp = [
  "default-src 'self'",
  // Next.js inline bootstrap scripts; Cloudflare Turnstile (Privy bot check)
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin} ${PRIVY.join(" ")} ${WALLETCONNECT_HTTP.join(" ")}`,
  `media-src 'self' blob: ${supabaseOrigin}`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${RPC.join(" ")} ${PRIVY.join(" ")} ${WALLETCONNECT_HTTP.join(" ")} ${WALLETCONNECT_WS.join(" ")}`,
  `frame-src ${PRIVY.join(" ")} https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com`,
  `child-src ${PRIVY.join(" ")} https://verify.walletconnect.com https://verify.walletconnect.org`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
]
  .join("; ")
  .replace(/\s+/g, " ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Content-Security-Policy-Report-Only", value: reportOnlyCsp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
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
