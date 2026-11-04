import type { Metadata, Viewport } from "next";
import { manrope, plexMono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  // Absolute base for share-card URLs; set NEXT_PUBLIC_SITE_URL when deploying.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "ShadowTrade — Private trading on Monad",
  description: "Trade perps on Perpl and spot on Kuru from a fresh wallet with no on-chain link to yours.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
