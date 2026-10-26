// Every server code a player can meet, in the hunt's voice (DESIGN.md › Content states).

const MESSAGES: Record<string, string> = {
  // Join
  BAD_NAME: "Use 2–40 letters or numbers for your name.",
  BAD_CODE: "No crew has that code. Check it with your captain.",
  TEAM_FULL: "That crew already has four hands.",
  TEAM_LOCKED: "That crew's hunt is over.",
  REGISTRATION_CLOSED: "Joining is closed right now. Ask the captain.",
  NAME_TAKEN: "Someone in that crew already uses that name.",
  RATE_LIMITED: "Too many tries at once. Wait a minute and try again.",
  SERVER: "The ship's log is jammed. Try again in a moment.",
  BAD_CLAIM: "That sign-in link expired. Join again.",
  // Session
  NOT_REGISTERED: "You're not in a crew yet.",
  SESSION_MOVED: "You joined on another phone, so this one was signed out.",
  NOT_AUTHENTICATED: "You're signed out. Join again.",
  // Scans
  BAD_QR: "That isn't a Crypto Hunt mark.",
  UNUSED_MARK: "This mark isn't part of this hunt. Leave it where it is and follow your clue.",
  NOT_YOURS: "This mark isn't yours. Read your clue again.",
  ALREADY_DONE: "You've already been here.",
  SOLVE_FIRST: "Found it early! Solve your riddles first, then come back.",
  ALREADY_CHECKED_IN: "Your seal is already on this mark.",
  NOT_SCANNED: "Scan the mark first, then type its key.",
  BAD_KEY: "That key doesn't fit. Check the card again.",
  BAD_SEAL: "That seal code isn't your crew's.",
  PAUSED: "The captain has paused the hunt.",
  NOT_RUNNING: "The hunt hasn't started.",
  ELIMINATED: "Your hunt is over.",
  FINISHED: "Your crew has already claimed its place.",
  INACTIVE: "The captain marked you inactive. Your crew continues without you.",
  // Answers
  BAD_ANSWER: "Pick one of the four choices.",
  NOT_OPEN: "Scan the start mark on the big screen to open your question.",
  ALREADY_SOLVED: "Your piece is already unlocked.",
  NOT_YOUR_TASK: "That question belongs to someone else.",
  HINTS_OFF: "Hints aren't open yet.",
  ALREADY_USED: "You've already taken your hint.",
  NO_HINT: "This question has no hint.",
  PENALTY_RUNNING: "The sand is still running.",
  NOT_READY: "Not yet.",
};

export function messageFor(code: string | undefined | null): string {
  return (code && MESSAGES[code]) || "Something went wrong. Try again.";
}

/** Codes that mean this phone is no longer a player: go back to Join. */
export const SIGNED_OUT = new Set(["NOT_REGISTERED", "SESSION_MOVED", "NOT_AUTHENTICATED"]);
