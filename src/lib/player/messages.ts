// Every server code a player can meet, in the hunt's voice (DESIGN.md › Content states).

const MESSAGES: Record<string, string> = {
  // Join
  BAD_NAME: "Use 2–40 letters or numbers for your name.",
  BAD_CODE: "No crew has that code. Check it with your captain.",
  TEAM_FULL: "This crew already has a lead. Type the lead's name exactly to log back in.",
  TEAM_LOCKED: "That crew's hunt is over.",
  REGISTRATION_CLOSED: "Joining is closed right now. Ask the captain.",
  NAME_TAKEN: "That name is already used in this crew.",
  BAD_MEMBERS: "Type all 3 teammates' names (2–40 letters or numbers each).",
  // Naming the crew (D-044)
  BAD_CREW_NAME: "Use 2–24 letters, numbers or spaces for your own team name.",
  CREW_NAME_TAKEN: "Another crew already sails under that name. Pick another.",
  ALREADY_NAMED: "Your crew already has its name.",
  GAME_STARTED: "The hunt has started: the crew name is set.",
  RATE_LIMITED: "Too many tries at once. Wait a minute and try again.",
  SERVER: "The ship's log is jammed. Try again in a moment.",
  BAD_CLAIM: "That sign-in link expired. Join again.",
  // Session
  NOT_REGISTERED: "You're not in a crew yet.",
  SESSION_MOVED: "You joined on another phone, so this one was signed out.",
  NOT_AUTHENTICATED: "You're signed out. Join again.",
  // Scans
  BAD_QR: "That isn't a Crypto Hunt code. Check it and try again.",
  ASK_SEAL: "Now type your crew's seal code.",
  UNUSED_MARK: "This mark isn't part of this hunt. Leave it where it is and follow your clue.",
  NOT_YOURS: "This mark isn't yours. Read your clue again.",
  ALREADY_DONE: "You've already been here.",
  SOLVE_FIRST: "Found it early! Answer your question first, then come back.",
  BAD_SEAL: "That seal code isn't your crew's.",
  PAUSED: "The captain has paused the hunt.",
  NOT_RUNNING: "The hunt hasn't started.",
  ELIMINATED: "Your hunt is over.",
  FINISHED: "Your crew has already claimed its place.",
  INACTIVE: "The captain has stopped this phone. Speak to the captain.",
  // Answers
  BAD_ANSWER: "Pick one of the four choices.",
  NOT_OPEN: "Your question isn't open yet.",
  ALREADY_SOLVED: "You've already answered this one.",
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
