/**
 * Characters used in printed QR keys and crew seal codes. 0/O and 1/I are left out so nobody misreads
 * a printed card (DESIGN.md › Interaction). 32 characters, 6 long ≈ 1.07 billion codes (SECURITY.md T5).
 */
export const KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const KEY_LENGTH = 6;

/** Uppercases and keeps only characters a key can contain. */
export function normalizeKey(raw: string): string {
  return raw
    .toUpperCase()
    .split("")
    .filter((c) => KEY_ALPHABET.includes(c))
    .join("");
}
