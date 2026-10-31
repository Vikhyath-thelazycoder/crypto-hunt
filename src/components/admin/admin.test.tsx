import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { iso, member, snapshot, team } from "@/lib/admin/fixtures";
import type { Snapshot } from "@/lib/admin/types";

const nav = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav, usePathname: () => "/admin" }));

const api = vi.hoisted(() => {
  class AdminError extends Error {
    constructor(
      readonly code: string,
      readonly detail: string | null = null,
    ) {
      super(code);
    }
  }
  return {
    AdminError,
    adminSnapshot: vi.fn(),
    signInAdmin: vi.fn(),
    signOutAdmin: vi.fn(),
    pauseGame: vi.fn(),
    resumeGame: vi.fn(),
    startGame: vi.fn(),
    endGame: vi.fn(),
    setHints: vi.fn(),
    setAdvanceCount: vi.fn(),
    setRegistration: vi.fn(),
    broadcast: vi.fn(),
    ackAlert: vi.fn(),
    ackAllAlerts: vi.fn(),
    exportResults: vi.fn(),
    startNewGame: vi.fn(),
    setTeamCount: vi.fn(),
    setMemberInactive: vi.fn(),
    kickPlayer: vi.fn(),
    moveTeam: vi.fn(),
    repointTeam: vi.fn(),
    forceComplete: vi.fn(),
    disqualifyTeam: vi.fn(),
  };
});
vi.mock("@/lib/admin/api", () => api);

const hook = vi.hoisted(() => ({
  state: null as { kind: string; code?: string; snap?: { now?: string } } | null,
  refresh: vi.fn(),
}));
vi.mock("@/hooks/useAdminSnapshot", () => ({
  // Like the real hook: the clock offset puts "now" at the snapshot's server time, so the fixtures never go stale.
  useAdminSnapshot: () => ({
    state: hook.state,
    offset: hook.state?.snap?.now ? Date.parse(hook.state.snap.now) - Date.now() : 0,
    refresh: hook.refresh,
  }),
}));
// Re-pointing reads the round's marks straight from the database.
vi.mock("@/lib/supabase/client", () => {
  // Every query-builder step returns an empty result that can still be chained.
  const chain = (): unknown =>
    Object.assign(Promise.resolve({ data: [], error: null }), { select: chain, eq: chain, order: chain });
  return { getBrowserSupabase: () => ({ from: chain }) };
});

import { AdminLogin } from "./Login";
import { ControlBar } from "./ControlBar";
import { Crews } from "./Crews";
import { JoinQrButton } from "./JoinQr";
import { Dashboard } from "./Dashboard";
import { AdminHeader, ConfirmDialog } from "./parts";

const ready = (snap: Snapshot) => ({ kind: "ready", snap, live: true });

beforeEach(() => {
  Object.values(api).forEach(
    (f) => typeof f === "function" && "mockReset" in f && (f as ReturnType<typeof vi.fn>).mockReset(),
  );
  Object.values(nav).forEach((f) => f.mockReset());
  hook.refresh.mockReset();
  vi.useRealTimers();
});

describe("admin login (T-401)", () => {
  it("signs in with the admin name and passcode, then goes to the console", async () => {
    api.signInAdmin.mockResolvedValue("ok");
    render(<AdminLogin denied={false} next="/admin/generator" />);
    const button = screen.getByRole("button", { name: "Sign in" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(screen.getByLabelText("ADMIN NAME"), "Captain");
    await userEvent.type(screen.getByLabelText("PASSCODE"), "correct horse");
    await userEvent.click(button);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/admin/generator"));
    expect(api.signInAdmin).toHaveBeenCalledWith("Captain", "correct horse");
  });
  it("refuses a wrong passcode and a non-admin account in words", async () => {
    api.signInAdmin.mockResolvedValueOnce("wrong").mockResolvedValueOnce("not_admin");
    render(<AdminLogin denied={false} next={null} />);
    await userEvent.type(screen.getByLabelText("ADMIN NAME"), "Captain");
    await userEvent.type(screen.getByLabelText("PASSCODE"), "nope nope nope");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/don't match/);
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/isn't the captain/));
    expect(nav.replace).not.toHaveBeenCalled();
  });
  it("explains why a non-admin was sent back here", () => {
    render(<AdminLogin denied next={null} />);
    expect(screen.getByRole("alert").textContent).toMatch(/isn't the captain/);
  });
});

describe("typed confirm with a reason (T13)", () => {
  it("enables only with a 3+ character reason and the typed word", async () => {
    const onConfirm = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        title="End?"
        confirmLabel="End game"
        reason
        typed="END"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    const go = screen.getByRole("button", { name: "End game" }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText(/REASON/), "ok");
    await userEvent.type(screen.getByLabelText("TYPE END TO CONFIRM"), "end");
    expect(go.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText(/REASON/), "!");
    expect(go.disabled).toBe(false);
    await userEvent.click(go);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onConfirm).toHaveBeenCalledWith("ok!");
  });
});

describe("control bar (T-407): only valid actions", () => {
  it("before the hunt: Start is disabled with the reason until every crew is full", () => {
    const s = snapshot(
      { teams: [team(1, { status: "locked" }), team(2, { status: "forming", name: "Salt Wolves" })] },
      { status: "READY", started_at: null },
    );
    render(<ControlBar s={s} say={vi.fn()} onChanged={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Start Hunt" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Start: 1 crew isn't full yet \(Salt Wolves\)/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Pause/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "End game" })).toBeNull();
  });
  it("running: pause, hints and advance call the server", async () => {
    const onChanged = vi.fn();
    api.pauseGame.mockResolvedValue(undefined);
    api.setHints.mockResolvedValue(undefined);
    api.setAdvanceCount.mockResolvedValue(undefined);
    const s = snapshot({ teams: [1, 2, 3, 4, 5].map((n) => team(n)) });
    api.adminSnapshot.mockResolvedValue(s);
    render(<ControlBar s={s} say={vi.fn()} onChanged={onChanged} />);
    await userEvent.click(screen.getByRole("button", { name: /Pause/ }));
    expect(api.pauseGame).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("switch", { name: "Hints off" }));
    expect(api.setHints).toHaveBeenCalledWith(true);
    await userEvent.click(screen.getByRole("button", { name: "More crews advance" }));
    await waitFor(() => expect(api.setAdvanceCount).toHaveBeenCalledWith(1, 4));
    expect(screen.queryByRole("button", { name: "Start Hunt" })).toBeNull();
  });
  it("lowering X to the crews already sealed asks first: it eliminates the rest at once", async () => {
    api.setAdvanceCount.mockResolvedValue(undefined);
    const s = snapshot({ teams: [team(1, { round: 2, rounds_completed: 1 }), team(2), team(3)] });
    s.rounds[0]!.advance = 2;
    // The bar still shows 0 sealed, but the server already has 1: the fresh read decides.
    const fresh = structuredClone(s);
    fresh.rounds[0]!.completed = 1;
    api.adminSnapshot.mockResolvedValue(fresh);
    render(<ControlBar s={s} say={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Fewer crews advance" }));
    const dialog = await screen.findByRole("dialog");
    expect(api.setAdvanceCount).not.toHaveBeenCalled();
    expect(dialog.textContent).toMatch(/1 crew has sealed Round I/);
    expect(dialog.textContent).toMatch(/eliminates 2 crews/);
    await userEvent.type(within(dialog).getByLabelText("TYPE SEAL TO CONFIRM"), "SEAL");
    await userEvent.click(within(dialog).getByRole("button", { name: "Seal and eliminate 2" }));
    await waitFor(() => expect(api.setAdvanceCount).toHaveBeenCalledWith(1, 1));
  });
  it("paused: Resume instead of Pause; finished: New game, no End game", () => {
    const { unmount } = render(
      <ControlBar
        s={snapshot({}, { status: "PAUSED", paused_at: iso(10) })}
        say={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Resume/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Pause/ })).toBeNull();
    unmount();
    render(
      <ControlBar
        s={snapshot({}, { status: "FINISHED", finished_at: iso(100) })}
        say={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "New game" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "End game" })).toBeNull();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeTruthy();
  });
  it("New Game needs the typed confirmation and passes the regenerate choice", async () => {
    api.startNewGame.mockResolvedValue(undefined);
    render(
      <ControlBar
        s={snapshot({}, { status: "FINISHED", finished_at: iso(100) })}
        say={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "New game" }));
    const go = screen.getByRole("button", { name: "Wipe and start a new game" }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    await userEvent.click(screen.getByRole("checkbox", { name: /Regenerate every card/ }));
    await userEvent.type(screen.getByLabelText("TYPE NEW GAME TO CONFIRM"), "new game");
    await userEvent.click(go);
    await waitFor(() => expect(api.startNewGame).toHaveBeenCalledWith("NEW GAME", true, false));
  });
});

describe("live dashboard (T-406)", () => {
  it("shows round status, crews by progress, open alerts and the ship's log", () => {
    hook.state = ready(
      snapshot({
        teams: [
          team(1, {
            name: "Iron Gulls",
            phase: "CHECKING_IN",
            target: "R1-03",
            members: [member("A", { checked_in: true }), member("B"), member("C"), member("D")],
          }),
          team(2, { name: "Salt Wolves", round: 2, rounds_completed: 1, last_completed_at: iso(30_000) }),
          team(3, { name: "Grey Moths", status: "eliminated", eliminated_in_round: 1 }),
        ],
        alerts: [
          {
            id: 7,
            kind: "locked_scan",
            data: { qr: "R3-01", qr_round: 3, team_round: 1, own_future: true },
            at: iso(20_000),
            team_id: "t1",
            team: "Iron Gulls",
            player: "A",
            place: "Library",
          },
        ],
        open_alerts: 1,
        open_by_kind: { locked_scan: 1 },
        log: [
          {
            src: "event",
            id: 1,
            kind: "round_completed",
            data: { round: 1, order: 1 },
            at: iso(30_000),
            team: "Salt Wolves",
            player: null,
            reason: null,
            target: null,
            place: null,
          },
        ],
      }),
    );
    render(<Dashboard />);
    expect(screen.getByText("LIVE · ROUND I OF III")).toBeTruthy();
    expect(screen.getByText("ROUND I SEALED")).toBeTruthy();
    const crews = screen.getAllByRole("article").map((a) => within(a).getAllByText(/.+/)[0]!.textContent);
    expect(crews).toEqual(["Salt Wolves", "Iron Gulls", "Grey Moths"]);
    expect(screen.getByText("Check in 1/4")).toBeTruthy();
    expect(screen.getByText("Later-round scan")).toBeTruthy();
    expect(screen.getByText(/their own future mark/)).toBeTruthy();
    expect(screen.getByText("Salt Wolves sealed Round I · 1 of 3")).toBeTruthy();
    expect(screen.getByText("1 later-round scan")).toBeTruthy();
  });
  it("acknowledging an alert hides it at once and tells the server", async () => {
    api.ackAlert.mockResolvedValue(undefined);
    hook.state = ready(
      snapshot({
        alerts: [
          {
            id: 9,
            kind: "prank",
            data: { qr: "P-02" },
            at: iso(1),
            team_id: "t1",
            team: "Crew 1",
            player: "Ana",
            place: null,
          },
        ],
        open_alerts: 1,
        open_by_kind: { prank: 1 },
      }),
    );
    render(<Dashboard />);
    await userEvent.click(screen.getByRole("button", { name: "Acknowledge: Fell for a prank" }));
    expect(api.ackAlert).toHaveBeenCalledWith(9);
    expect(screen.queryByText("Fell for a prank")).toBeNull();
    expect(screen.getByText("No open alerts.")).toBeTruthy();
  });
  it("a crew card opens its overrides; each needs a reason", async () => {
    api.setMemberInactive.mockResolvedValue(undefined);
    hook.state = ready(snapshot({ teams: [team(1, { name: "Rust Anchors" })] }));
    render(<Dashboard />);
    await userEvent.click(screen.getByRole("button", { name: "Rust Anchors: open crew" }));
    const drawer = screen.getByRole("dialog", { name: "Rust Anchors" });
    await userEvent.click(within(drawer).getAllByRole("button", { name: "Mark inactive" })[0]!);
    const confirm = screen.getByRole("dialog", { name: "Mark Ana inactive?" });
    const go = within(confirm).getByRole("button", { name: "Mark inactive" }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    await userEvent.type(within(confirm).getByLabelText(/REASON/), "phone died");
    await userEvent.click(go);
    await waitFor(() => expect(api.setMemberInactive).toHaveBeenCalledWith("p-Ana", true, "phone died"));
  });
  it("sends a signed-out visitor to the login page", async () => {
    hook.state = { kind: "error", code: "NOT_ADMIN" };
    render(<Dashboard />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/admin/login"));
  });
});

describe("join QR (F2)", () => {
  it("shows a scannable code and the link to this site's /play, and copies the link", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true });
    render(<JoinQrButton />);
    await userEvent.click(screen.getByRole("button", { name: "Join QR" }));
    const qr = await screen.findByTestId("join-qr");
    expect(qr.getAttribute("data-url")).toBe(`${window.location.origin}/play`);
    expect(qr.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(write).toHaveBeenCalledWith(`${window.location.origin}/play`);
  });
});

describe("projector link (P7)", () => {
  it("every admin page's header opens /screen in a new tab", () => {
    render(<AdminHeader />);
    const link = screen.getByRole("link", { name: "Projector (opens in a new tab)" });
    expect(link.getAttribute("href")).toBe("/screen");
    expect(link.getAttribute("target")).toBe("_blank");
  });
});

describe("crew count (D-046)", () => {
  const crews = (n: number, joined = 0) =>
    Array.from({ length: n }, (_, i) =>
      team(i + 1, { status: "forming", members: i < joined ? [member("Ana")] : [] }),
    );

  it("the box is the total: 27 crews and 27 typed adds nothing; 30 adds 3; 25 removes 2 empty ones", async () => {
    api.setTeamCount.mockResolvedValue({ before: 27, after: 30 });
    hook.state = ready(snapshot({ teams: crews(27) }, { status: "REGISTRATION" }));
    render(<Crews />);
    const box = screen.getByLabelText("CREWS IN ALL") as HTMLInputElement;
    expect(box.value).toBe("27");
    expect((screen.getByRole("button", { name: "27 crews now" }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.clear(box);
    await userEvent.type(box, "30");
    await userEvent.click(screen.getByRole("button", { name: "Add 3 (27 → 30)" }));
    await waitFor(() => expect(api.setTeamCount).toHaveBeenCalledWith(30));
    await userEvent.clear(box);
    await userEvent.type(box, "25");
    expect(screen.getByRole("button", { name: "Remove 2 empty (27 → 25)" })).toBeTruthy();
  });

  it("after New Game wipes the crews, the box is empty: never the previous game's number", async () => {
    hook.state = ready(snapshot({ teams: crews(17) }, { status: "REGISTRATION" }));
    const { rerender } = render(<Crews />);
    expect((screen.getByLabelText("CREWS IN ALL") as HTMLInputElement).value).toBe("17");
    hook.state = ready(snapshot({ teams: [] }, { status: "SETUP" }));
    rerender(<Crews />);
    await waitFor(() => expect((screen.getByLabelText("CREWS IN ALL") as HTMLInputElement).value).toBe(""));
    expect((screen.getByRole("button", { name: "Create crews" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("won't remove crews that players have joined", async () => {
    hook.state = ready(snapshot({ teams: crews(3, 2) }, { status: "REGISTRATION" }));
    render(<Crews />);
    const box = screen.getByLabelText("CREWS IN ALL");
    await userEvent.clear(box);
    await userEvent.type(box, "1");
    expect(
      (screen.getByRole("button", { name: "Remove 2 empty (3 → 1)" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/Only 1 crew has no players yet/)).toBeTruthy();
  });

  it("New Game starts from zero crews unless 'keep the crews' is ticked", async () => {
    api.startNewGame.mockResolvedValue(undefined);
    render(
      <ControlBar
        s={snapshot({}, { status: "FINISHED", finished_at: iso(100) })}
        say={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "New game" }));
    expect(screen.getByText(/All crews are removed/)).toBeTruthy();
    await userEvent.click(screen.getByRole("checkbox", { name: /Keep the crews/ }));
    expect(screen.getByText(/Crews stay with/)).toBeTruthy();
    await userEvent.type(screen.getByLabelText("TYPE NEW GAME TO CONFIRM"), "NEW GAME");
    await userEvent.click(screen.getByRole("button", { name: "Wipe and start a new game" }));
    await waitFor(() => expect(api.startNewGame).toHaveBeenCalledWith("NEW GAME", false, true));
  });
});
