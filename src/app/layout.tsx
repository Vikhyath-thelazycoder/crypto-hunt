import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IM_Fell_English_SC, Spectral } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const fell = IM_Fell_English_SC({ weight: "400", subsets: ["latin"], variable: "--font-fell" });
const spectral = Spectral({
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-spectral",
});
const plexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
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
