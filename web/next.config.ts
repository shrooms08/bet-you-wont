import type { NextConfig } from "next";

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
