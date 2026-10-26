import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import type { PublicState } from "@/lib/player/types";
import { finalePub, screenPub } from "./fixtures";

// The projector reads public_state through the browser client: a stub whose reads the tests control.
const db = vi.hoisted(() => ({
  reads: [] as { data: unknown; event_seq: number }[],
  onUpdate: null as null | ((p: { new: unknown }) => void),
}));
vi.mock("@/lib/supabase/client", () => ({
  getBrowserSupabase: () => ({
    storage: {
      from: (bucket: string) => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://db.test/storage/v1/object/public/${bucket}/${path}` } }),
      }),
    },
    from: () => ({
      select: () => ({ single: async () => ({ data: db.reads.shift() ?? null, error: null }) }),
    }),
    channel: () => {
      const ch = {
        on: (_e: string, _f: unknown, cb: (p: { new: unknown }) => void) => {
          db.onUpdate = cb;
          return ch;
        },
        subscribe: () => ch,
      };
      return ch;
    },
    removeChannel: async () => {},
  }),
}));
// jsdom has no canvas for the QR image.
vi.mock("qrcode", () => ({ default: { toDataURL: async (t: string) => `data:image/png;base64,${btoa(t)}` } }));

import { usePublicState } from "@/hooks/usePublicState";
import { LiveScreen } from "./LiveScreen";
import { Projector } from "./Projector";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("live screen (T-701, T-702)", () => {
  it("shows the round, the leaderboard at 48 px and one ship per racing crew, with no place names", () => {
    render(<LiveScreen pub={screenPub()} qr={null} />);
    expect(screen.getByRole("heading", { name: "Round IV" })).toBeTruthy();
    expect(screen.getByText("Four crews advance")).toBeTruthy();
    const names = screen.getAllByTestId("board-row").map((r) => r.children[1] as HTMLElement);
    expect(names.slice(0, 6).every((n) => n.style.fontSize === "48px")).toBe(true);
    expect(screen.getAllByTestId("ship").map((s) => s.dataset.crew)).toEqual([
      "Salt Wolves",
      "Black Tide",
      "Iron Gulls",
      "Night Herons",
      "Copper Owls",
      "Rust Anchors",
    ]);
    expect(screen.getByText(/Night Herons serving a 4:00 penalty/)).toBeTruthy();
    expect(document.body.innerHTML).not.toMatch(/map_x|place_no|completion_key|final_code/);
  });

  it("shows the captain's broadcast in the ticker, and Paused over the map", () => {
    const p = { ...screenPub(), status: "PAUSED" as const, paused: true, broadcast: "Tea break", broadcast_at: new Date().toISOString() };
    render(<LiveScreen pub={p} qr={null} />);
    expect(screen.getByText("FROM THE CAPTAIN")).toBeTruthy();
    expect(screen.getByText("Tea break")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Paused");
  });

  it("shows the join QR before the start", async () => {
    render(<LiveScreen pub={{ ...screenPub(), status: "REGISTRATION" }} qr={null} joinUrl="https://hunt.example/play" />);
    expect((await screen.findByTestId("screen-qr")).dataset.url).toBe("https://hunt.example/play");
  });
});

describe("projector splashes and finale (T-703, T-704)", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setInterval", "setTimeout", "Date"] }));

  it("the universal QR fills the screen at the start, pointing at the /q landing", async () => {
    const p: PublicState = { ...screenPub(), universal_token: "UniTok3nUniTok3nUniTok3n", started_at: new Date().toISOString() };
    p.rounds[0]!.closed = false;
    render(<Projector pub={p} />);
    await act(async () => {});
    expect(screen.getByText("SCAN TO BEGIN")).toBeTruthy();
    expect(screen.getByTestId("screen-qr").dataset.url).toMatch(/\/q\/UniTok3nUniTok3nUniTok3n$/);
  });

  it("a round closing shows its splash, which clears after a few seconds", async () => {
    const before = screenPub();
    const { rerender } = render(<Projector pub={before} />);
    const after = structuredClone(before);
    after.rounds[3]!.closed = true;
    Object.assign(after.teams.find((t) => t.id === "c6")!, { status: "eliminated", eliminated_in_round: 4 });
    rerender(<Projector pub={after} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByRole("alert").textContent).toContain("Round IV sealed");
    expect(screen.getByRole("alert").textContent).toContain("Rust Anchors");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("each finish plays the finale with the podium, then returns to the race", async () => {
    const { rerender } = render(<Projector pub={screenPub()} />);
    rerender(<Projector pub={finalePub(false)} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByRole("heading", { name: "Second to the treasure" })).toBeTruthy();
    expect(screen.getByTestId("podium-1").textContent).toContain("Iron Gulls");
    expect(screen.getByTestId("podium-3").textContent).toContain("Still racing");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(26_000);
    });
    expect(screen.queryByTestId("podium-1")).toBeNull();
    expect(screen.getAllByTestId("board-row").length).toBeGreaterThan(0);
  });

  it("the game ending shows Game over with the top 3 and stays on the finale", async () => {
    const { rerender } = render(<Projector pub={finalePub(false)} />);
    rerender(<Projector pub={finalePub(true)} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    const alert = screen.getByRole("alert").textContent!;
    expect(alert).toContain("Game over");
    expect(alert).toContain("Return to the starting point");
    expect(alert).toMatch(/Iron Gulls.*Black Tide.*Salt Wolves/);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByRole("heading", { name: "The treasure is claimed" })).toBeTruthy();
    expect(screen.getByText("GAME OVER · RETURN TO THE STARTING POINT")).toBeTruthy();
  });
});

describe("public state feed (T-701)", () => {
  it("recovers from a missed Realtime event within 10 s, and never goes back to an older state", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "setTimeout"] });
    const first = screenPub();
    const later = { ...screenPub(), status: "PAUSED" as const, paused: true };
    db.reads = [{ data: first, event_seq: 5 }];
    const { result } = renderHook(() => usePublicState());
    await act(async () => {});
    expect(result.current.pub?.status).toBe("RUNNING");
    // The UPDATE for seq 6 never arrives; the 10 s re-read picks it up.
    db.reads = [{ data: later, event_seq: 6 }];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(result.current.pub?.status).toBe("PAUSED");
    // A late push of an older state is ignored.
    act(() => db.onUpdate!({ new: { data: first, event_seq: 5 } }));
    expect(result.current.pub?.status).toBe("PAUSED");
  });
});
