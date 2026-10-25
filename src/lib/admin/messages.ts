// Every code an admin RPC can raise, in plain words (DESIGN.md › Content states).

const MESSAGES: Record<string, string> = {
  NOT_ADMIN: "This account isn't the captain. Sign in with the admin name and passcode.",
  NOT_AUTHENTICATED: "You're signed out. Sign in again.",
  BAD_COUNT: "Create between 1 and 60 crews at a time.",
  GAME_STARTED: "Not while the hunt is running. End it or start a new game first.",
  NO_TEAM: "That crew no longer exists.",
  NO_TEAMS: "Create the crews first.",
  NO_PLAYER: "That player is no longer aboard.",
  REASON_REQUIRED: "Give a reason (at least 3 characters). It goes in the audit log.",
  BAD_PLAN: "The server refused this course.",
  NOT_READY: "The hunt can't start from here.",
  NO_PLAN: "Generate the course first.",
  TEAMS_INCOMPLETE: "Every crew needs exactly 4 members. Wait for them, or remove the crews that aren't full.",
  NOT_ENOUGH_QUESTIONS: "Not enough enabled questions: each round needs at least 4.",
  NOT_ENOUGH_ROUND_ONE_QRS: "Not enough round-I marks for every crew. Generate the course again.",
  NOT_RUNNING: "The hunt isn't running.",
  NOT_PAUSED: "The hunt isn't paused.",
  TOO_LONG: "Keep the message to 200 characters.",
  BAD_X: "Advance must be at least 1.",
  NO_ROUND: "That round isn't open.",
  ROUND_CLOSED: "That round is already sealed.",
  TEAM_NOT_ACTIVE: "That crew isn't racing.",
  QR_NOT_IN_ROUND: "Pick a mark from the crew's current round.",
  CONFIRM_REQUIRED: "Type NEW GAME to confirm.",
  BAD_LOCKOUT: "The lockout must be between 0:30 and 15:00.",
  // Table constraints (direct writes and renames)
  DUPLICATE: "That name is already taken.",
  INVALID: "That value isn't allowed. Check the lengths and numbers.",
  IN_USE: "This place holds a mark in the current course. Generate the course again without it first.",
  UPLOAD: "The map image didn't upload. Use a PNG, JPG or WebP under 10 MB.",
  RATE_LIMITED: "Too many sign-in tries. Wait a minute and try again.",
  SERVER: "The ship's log is jammed. Try again in a moment.",
};

export function adminMessage(code: string | undefined | null, detail?: string | null): string {
  const base = (code && MESSAGES[code]) || "Something went wrong. Try again.";
  return detail ? `${base} (${detail})` : base;
}
