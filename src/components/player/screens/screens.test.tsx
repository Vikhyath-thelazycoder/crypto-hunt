import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { base, final, members, pub, seeking, solvedPieces } from "../fixtures";

const api = vi.hoisted(() => ({
  previewCrew: vi.fn(),
  joinCrew: vi.fn(),
  submitKey: vi.fn(),
  submitAnswer: vi.fn(),
  takeHint: vi.fn(),
  completeRound: vi.fn(),
}));
vi.mock("@/lib/player/api", () => api);
// jsdom has no camera.
vi.mock("../Scanner", async (orig) => ({
  ...(await orig<typeof import("../Scanner")>()),
  Scanner: ({ banner }: { banner?: React.ReactNode }) => <div data-testid="camera">{banner}</div>,
}));

import { CheckInScreen } from "./CheckIn";
import { EliminatedScreen, VictoryScreen } from "./Endings";
import { JoinScreen } from "./Join";
import { LobbyScreen } from "./Lobby";
import { PrankScreen, SealedScreen } from "./Results";
import { SeekScreen } from "./Seek";
import { SolveScreen } from "./Solve";

const noop = () => {};
beforeEach(() => Object.values(api).forEach((f) => f.mockReset()));

describe("Join", () => {
  it("previews the crew for a full code, then joins with the trimmed name", async () => {
    api.previewCrew.mockResolvedValue({
      ok: true,
      team: { name: "Iron Gulls", number: 7, status: "forming", members: ["A", "M"] },
    });
    api.joinCrew.mockResolvedValue({ ok: true });
    const onJoined = vi.fn();
    render(<JoinScreen reason={null} onJoined={onJoined} />);
    await userEvent.type(screen.getByLabelText("YOUR NAME"), "  Ravi ");
    await userEvent.click(screen.getByLabelText("Team code character 1"));
    await userEvent.keyboard("hx7rmk");
    expect(await screen.findByText("Crew found · 2 of 4 aboard")).toBeTruthy();
    expect(api.previewCrew).toHaveBeenCalledWith("HX7RMK");
    await userEvent.click(screen.getByRole("button", { name: "Join the crew" }));
    await waitFor(() => expect(onJoined).toHaveBeenCalled());
    expect(api.joinCrew).toHaveBeenCalledWith("Ravi", "HX7RMK");
  });

  it("explains a refused join and a moved session", async () => {
    api.previewCrew.mockResolvedValue({ ok: false, code: "BAD_CODE" });
    api.joinCrew.mockResolvedValue({ ok: false, code: "TEAM_FULL" });
    render(<JoinScreen reason="SESSION_MOVED" onJoined={noop} />);
    expect(screen.getByRole("alert").textContent).toMatch(/another phone/);
    await userEvent.type(screen.getByLabelText("YOUR NAME"), "Ravi");
    await userEvent.click(screen.getByLabelText("Team code character 1"));
    await userEvent.keyboard("ZZZZZZ");
    await userEvent.click(screen.getByRole("button", { name: "Join the crew" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/four hands/);
  });
});

describe("Lobby", () => {
  it("shows the muster count and the code to share until the crew is sealed", () => {
    const s = {
      ...base,
      round: null,
      phase: null,
      members: members(0, 0).slice(0, 3),
      game: { ...base.game, status: "REGISTRATION" as const },
    };
    const { rerender } = render(<LobbyScreen s={s} />);
    expect(screen.getByLabelText("3 of 4 aboard")).toBeTruthy();
    expect(screen.getByText("HX7RMK")).toBeTruthy();
    rerender(<LobbyScreen s={{ ...s, members: members(0, 0) }} />);
    expect(screen.queryByText("HX7RMK")).toBeNull();
    expect(screen.getByText("THE CREW IS SEALED")).toBeTruthy();
  });
});

describe("Solve", () => {
  it("asks for the start mark before round 1 opens", async () => {
    const onScanStart = vi.fn();
    render(
      <SolveScreen
        s={{ ...base, task: { ...base.task!, opened: false, text: null } }}
        onChanged={noop}
        onScanStart={onScanStart}
        say={noop}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Scan the start mark/ }));
    expect(onScanStart).toHaveBeenCalled();
    expect(screen.queryByPlaceholderText("Your answer")).toBeNull();
  });

  it("shows my question, the hint offer, and the four pieces with their holders", () => {
    render(<SolveScreen s={base} onChanged={noop} onScanStart={noop} say={noop} />);
    expect(screen.getByText(/Which river flows/)).toBeTruthy();
    expect(screen.getByText("YOUR QUESTION · PIECE II")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Take a hint · \+2:00/ })).toBeTruthy();
    expect(screen.getByText("Sealed until you answer")).toBeTruthy();
    expect(screen.getByText(/I · ANA/)).toBeTruthy();
    expect(screen.getByText("2 / 4 PIECES")).toBeTruthy();
  });

  it("submits an answer and reports a wrong one without penalty", async () => {
    api.submitAnswer.mockResolvedValue({ ok: true, correct: false });
    const say = vi.fn();
    render(<SolveScreen s={base} onChanged={noop} onScanStart={noop} say={say} />);
    await userEvent.type(screen.getByPlaceholderText("Your answer"), "Amazon{Enter}");
    await waitFor(() => expect(api.submitAnswer).toHaveBeenCalledWith("task", "Amazon"));
    expect(say).toHaveBeenCalledWith(expect.stringMatching(/no penalty/), "ink");
  });

  it("offers choices for a multiple-choice question and sends the index", async () => {
    api.submitAnswer.mockResolvedValue({ ok: true, correct: true });
    const s = {
      ...base,
      task: { ...base.task!, format: "mcq" as const, options: ["Nile", "Danube", "Amazon"] },
    };
    render(<SolveScreen s={s} onChanged={noop} onScanStart={noop} say={noop} />);
    await userEvent.click(screen.getByRole("button", { name: /Danube/ }));
    expect(api.submitAnswer).toHaveBeenCalledWith("task", "1");
  });
});

describe("Seek", () => {
  it("joins the clue and shows the crew seal code in the final round", () => {
    const { rerender } = render(<SeekScreen s={seeking} onScan={noop} />);
    expect(screen.getByText(/Where pages sleep in rows of oak, beneath the third arch/)).toBeTruthy();
    expect(screen.queryByLabelText("Crew seal code")).toBeNull();
    rerender(<SeekScreen s={final} onScan={noop} />);
    expect(screen.getByText("W7K·Q3T")).toBeTruthy();
  });
});

describe("Check in", () => {
  const props = {
    scanning: false,
    onToken: noop,
    onMarkLost: noop,
    onChanged: noop,
    onBack: noop,
    say: noop,
  };

  it("keeps the key boxes shut until the mark is scanned", () => {
    render(<CheckInScreen s={{ ...seeking, phase: "SEEKING" }} mark={null} {...props} />);
    expect((screen.getByLabelText("Secret key character 1") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Press my seal" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends the scanned token with the typed key", async () => {
    api.submitKey.mockResolvedValue({ ok: true, phase: "CHECKING_IN" });
    render(
      <CheckInScreen
        s={{ ...seeking, phase: "CHECKING_IN" }}
        mark={{ token: "tok", label: "R3-04" }}
        {...props}
      />,
    );
    expect(screen.getByText("Now type the key printed on it.")).toBeTruthy();
    await userEvent.click(screen.getByLabelText("Secret key character 1"));
    await userEvent.keyboard("k7pwh9");
    await userEvent.click(screen.getByRole("button", { name: "Press my seal" }));
    expect(api.submitKey).toHaveBeenCalledWith("tok", "K7PWH9", undefined);
  });

  it("needs both the printed key and the crew seal code at the final mark", async () => {
    api.submitKey.mockResolvedValue({ ok: false, code: "BAD_SEAL" });
    const say = vi.fn();
    render(
      <CheckInScreen
        s={{ ...final, phase: "CHECKING_IN" }}
        mark={{ token: "fin", label: "F-01" }}
        {...props}
        say={say}
      />,
    );
    const press = screen.getByRole("button", { name: "Press both seals" }) as HTMLButtonElement;
    await userEvent.click(screen.getByLabelText("Key on the mark character 1"));
    await userEvent.keyboard("H9TR4X");
    expect(press.disabled).toBe(true);
    await userEvent.click(screen.getByLabelText("Crew seal code character 1"));
    await userEvent.keyboard("AAAAAA");
    await userEvent.click(press);
    expect(api.submitKey).toHaveBeenCalledWith("fin", "H9TR4X", "AAAAAA");
    expect(say).toHaveBeenCalledWith(expect.stringMatching(/isn't your crew's/), "wax");
  });

  it("after my seal, waits for the crew with no key box", () => {
    const s = {
      ...seeking,
      phase: "CHECKING_IN" as const,
      members: members(0, 4).map((m) => ({ ...m, checked_in: m.me })),
    };
    render(<CheckInScreen s={s} mark={null} {...props} />);
    expect(screen.getByText("Your seal is pressed")).toBeTruthy();
    expect(screen.queryByLabelText("Secret key character 1")).toBeNull();
  });
});

describe("results", () => {
  it("a sealed later-round mark shows no clue and no key box (D-025)", () => {
    render(
      <SealedScreen
        s={{ ...base, round: { number: 1, total: 7, is_final: false, difficulty: 1 } }}
        onBack={noop}
        onRescan={noop}
      />,
    );
    expect(screen.getByText(/later round/)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText(/Where pages sleep/)).toBeNull();
  });

  it("a prank shows its fake key and the crew's real clue", () => {
    render(<PrankScreen s={{ ...base, pieces: solvedPieces }} fakeKey="ABCDEF" onBack={noop} />);
    expect(screen.getByText("ABCDEF")).toBeTruthy();
    expect(screen.getByText(/Where pages sleep/)).toBeTruthy();
  });

  it("elimination names the round, the X and the place; the crew picks a view", async () => {
    const onChoose = vi.fn();
    const s = { ...base, team: { ...base.team, status: "eliminated" as const, eliminated_in_round: 4 } };
    render(<EliminatedScreen s={s} pub={pub} onChoose={onChoose} />);
    expect(screen.getByText("ROUND IV HAS CLOSED")).toBeTruthy();
    expect(screen.getByText(/Seven crews sealed Round IV/)).toBeTruthy();
    expect(screen.getByText("of 10 crews")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Watch the race/ }));
    expect(onChoose).toHaveBeenCalledWith("spectator");
  });

  it("victory shows the place and the grouped completion key", () => {
    render(
      <VictoryScreen
        s={{
          ...base,
          team: { ...base.team, status: "finished", final_rank: 2, completion_key: "7QX4MDKP2" },
        }}
      />,
    );
    expect(screen.getByText("7QX·4MD·KP2")).toBeTruthy();
    expect(screen.getByText(/claim second place/)).toBeTruthy();
  });
});
