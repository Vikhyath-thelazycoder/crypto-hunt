// Who may see /admin (T-401, SECURITY.md T10, T17). RLS keeps every secret admin-only anyway; this decides where
// a visitor lands. Used by the guarded layout (server) and unit-tested.

export const LOGIN = "/admin/login";

/** null = let them in. Signed out → the login page; signed in but not the captain → login with a notice. */
export function adminGate(user: { id: string } | null, isAdmin: boolean): string | null {
  if (!user) return LOGIN;
  if (!isAdmin) return `${LOGIN}?denied=1`;
  return null;
}

/** After signing in, only ever return to an /admin page (never an outside URL). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/admin") || next.startsWith("//") || next.startsWith(LOGIN)) return "/admin";
  return next;
}
