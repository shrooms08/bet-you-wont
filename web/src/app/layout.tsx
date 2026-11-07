import type { Metadata, Viewport } from "next";
import { Archivo_Black, Bricolage_Grotesque, Caveat_Brush } from "next/font/google";
import "./globals.css";
import { FxLayer } from "@/components/fx/FxLayer";
import { DEFAULT_OG_IMAGE, SITE_DESCRIPTION, SITE_TITLE } from "@/server/linkPreview";
import { Providers } from "./providers";

const archivoBlack = Archivo_Black({ weight: "400", subsets: ["latin"], variable: "--font-archivo-black", display: "swap" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const caveatBrush = Caveat_Brush({ weight: "400", subsets: ["latin"], variable: "--font-caveat-brush", display: "swap" });

// Absolute base for og:image URLs: NEXT_PUBLIC_APP_URL, else Vercel's production domain, else local.
function siteUrl(): URL {
  if (process.env.NEXT_PUBLIC_APP_URL) return new URL(process.env.NEXT_PUBLIC_APP_URL);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  return new URL("http://localhost:3000");
}

// Every page gets the generic preview; /d/<id> overrides it for public-wifie dares.
export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: { type: "website", siteName: SITE_TITLE, title: SITE_TITLE, description: SITE_DESCRIPTION, images: [{ ...DEFAULT_OG_IMAGE }] },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION, images: [{ url: DEFAULT_OG_IMAGE.url, alt: DEFAULT_OG_IMAGE.alt }] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#131317",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-harmony="comp"
      className={`${archivoBlack.variable} ${bricolage.variable} ${caveatBrush.variable} h-full`}
    >
      <body className="min-h-full text-cream">
        <Providers>{children}</Providers>
        <FxLayer />
      </body>
    </html>
  );
}
