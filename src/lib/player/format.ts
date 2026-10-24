const ROMAN: [number, string][] = [
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

/** Rounds are numbered like a chart: I, II, III … XX. */
export function roman(n: number): string {
  if (!Number.isInteger(n) || n < 1) return String(n);
  let out = "";
  let rest = n;
  for (const [value, glyph] of ROMAN) {
    while (rest >= value) {
      out += glyph;
      rest -= value;
    }
  }
  return out;
}

export function ordinal(n: number): { n: number; suffix: string } {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : (({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th");
  return { n, suffix };
}

/** Crew seal letters: "Iron Gulls" → "IG", "Ana" → "A". */
export function initials(name: string, max = 2): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, max)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** 7QX4MDKP2 → 7QX·4MD·KP2 */
export function groupKey(key: string, size = 3): string {
  return key.match(new RegExp(`.{1,${size}}`, "g"))?.join("·") ?? key;
}

export function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The in-site scanner reads either a bare token or the printed URL (`https://…/q/<token>`, which a normal
 * camera app opens as a harmless landing page). Returns the token or null.
 */
export function tokenFromScan(text: string): string | null {
  const raw = text.trim();
  const fromUrl = raw.match(/\/q\/([A-Za-z0-9_-]{16,64})\/?(?:[?#].*)?$/);
  if (fromUrl) return fromUrl[1]!;
  return /^[A-Za-z0-9_-]{16,64}$/.test(raw) ? raw : null;
}
