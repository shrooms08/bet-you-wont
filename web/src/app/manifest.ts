import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION } from "@/server/linkPreview";

// Web app manifest (/manifest.webmanifest) for "Add to Home Screen". Icons: scripts/icons.mjs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bet You Won't",
    short_name: "BYW",
    description: SITE_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#131317",
    background_color: "#131317",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
