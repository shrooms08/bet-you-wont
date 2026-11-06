import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Bet You Won't",
  description: "Dare your friends. Lock a bounty. Prove it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-neutral-950 text-neutral-100 font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
