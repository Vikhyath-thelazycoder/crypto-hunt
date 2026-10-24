// Content-Security-Policy and static security headers (SECURITY.md T15, T16).

export function buildCsp({
  nonce,
  supabaseUrl,
  dev,
}: {
  nonce: string;
  supabaseUrl: string;
  dev: boolean;
}): string {
  const supabase = new URL(supabaseUrl).host;
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    // React and motion set style attributes, which cannot carry a nonce.
    "style-src": ["'self'", "'unsafe-inline'"],
    // Venue map image comes from Supabase Storage; QR codes render as data: URIs.
    "img-src": ["'self'", "data:", "blob:", `https://${supabase}`],
    // Fonts are self-hosted by next/font at build time.
    "font-src": ["'self'"],
    "connect-src": ["'self'", `https://${supabase}`, `wss://${supabase}`, ...(dev ? ["ws:"] : [])],
    "media-src": ["'self'", "blob:"],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export function staticSecurityHeaders(): { key: string; value: string }[] {
  return [
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    // The in-site QR scanner needs the camera; nothing else is allowed.
    {
      key: "Permissions-Policy",
      value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    },
  ];
}
