/** The admin logs in with a name (D-006); Supabase Auth needs an email, so the name maps to a synthetic one. */
export function adminEmail(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error("admin name needs at least one letter or digit");
  return `${slug}@admins.cryptohunt.app`;
}
