import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import "./globals.css";

// Fonts ship with the app (src/fonts, SIL OFL) so a build never depends on reaching Google Fonts.
const fell = localFont({
  src: "../fonts/im-fell-english-sc-400.woff2",
  weight: "400",
  variable: "--font-fell",
  display: "swap",
});
const spectral = localFont({
  src: [
    { path: "../fonts/spectral-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/spectral-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../fonts/spectral-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/spectral-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/spectral-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-spectral",
  display: "swap",
});
const plexMono = localFont({
  src: [
    { path: "../fonts/ibm-plex-mono-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/ibm-plex-mono-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/ibm-plex-mono-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Crypto Hunt",
  description: "A live team treasure hunt across the venue.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#EADBB8",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Reading request headers renders every page per request, so Next.js can stamp each response's
  // scripts with the CSP nonce set in middleware (static pages would be blocked by the CSP).
  await headers();
  return (
    <html lang="en" className={`${fell.variable} ${spectral.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
