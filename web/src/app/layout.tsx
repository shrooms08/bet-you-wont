import type { Metadata, Viewport } from "next";
import { Archivo_Black, Bricolage_Grotesque, Caveat_Brush } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const archivoBlack = Archivo_Black({ weight: "400", subsets: ["latin"], variable: "--font-archivo-black", display: "swap" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const caveatBrush = Caveat_Brush({ weight: "400", subsets: ["latin"], variable: "--font-caveat-brush", display: "swap" });

export const metadata: Metadata = {
  title: "Bet You Won't",
  description: "Dare your friends. Lock a bounty in $wif. Post proof, your crew votes, you get paid.",
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
      <body className="min-h-full bg-bg text-cream">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
