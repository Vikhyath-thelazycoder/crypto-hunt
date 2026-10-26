/**
 * The public site address that players' QR codes point at: the join QR, the code slips and the printed QR cards.
 * NEXT_PUBLIC_SITE_URL (e.g. https://crypto-hunt.vercel.app) wins, so codes printed or shown from a laptop on
 * localhost still send phones to the live site; without it, the address this page was opened on.
 */
export function siteOrigin(configured = process.env.NEXT_PUBLIC_SITE_URL, here = window.location.origin): string {
  const v = configured?.trim().replace(/^["']+|["']+$/g, "").replace(/\/+$/, "");
  return v && /^https?:\/\/[^/\s]+$/.test(v) ? v : here;
}
