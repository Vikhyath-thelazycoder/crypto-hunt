import type { NextConfig } from "next";
import { staticSecurityHeaders } from "./src/lib/security/csp";

const nextConfig: NextConfig = {
  // `npm run dev` builds into .next-dev so verification builds (.next) never break a running dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  devIndicators: false,
  // A printed QR opened in a normal camera app: drop the token from the URL (SECURITY T2).
  async redirects() {
    return [{ source: "/q/:token", destination: "/q", permanent: false }];
  },
  async headers() {
    return [{ source: "/:path*", headers: staticSecurityHeaders() }];
  },
};

export default nextConfig;
