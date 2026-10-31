import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { base, final, pub, seeking } from "../fixtures";

const api = vi.hoisted(() => ({
  previewCrew: vi.fn(),
  joinCrew: vi.fn(),
  checkIn: vi.fn(),
  submitAnswer: vi.fn(),
  takeHint: vi.fn(),
  completeRound: vi.fn(),
  setupCrew: vi.fn(),
}));
vi.mock("@/lib/player/api", () => api);
// The map image URL comes from the Storage client (no Supabase keys in unit tests).
vi.mock("@/lib/supabase/client", () => ({
  getBrowserSupabase: () => ({
    storage: {
      from: (bucket: string) => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://db.test/storage/v1/object/public/${bucket}/${path}` } }),
      }),
    },
  }),
}));
// jsdom has no camera.
vi.mock("../Scanner", async (orig) => ({
  ...(await orig<typeof import("../Scanner")>()),
  Scanner: ({ banner }: { banner?: React.ReactNode }) => <div data-testid="camera">{banner}</div>,
}));

import { CheckInScreen } from "./CheckIn";
import { EliminatedScreen, GameOverNotice, VictoryScreen } from "./Endings";
import { JoinScreen } from "./Join";
import { LobbyScreen } from "./Lobby";
import { SealedScreen } from "./Results";
import { SeekScreen } from "./Seek";
import { ClueText } from "../parts";
import { RoundTransition } from "../RoundTransition";
import { QuestionText, SolveScreen } from "./Solve";

const noop = () => {};
beforeEach(() => Object.values(api).forEach((f) => f.mockReset()));

describe("Solve", () => {
  it("shows the crew's question and the hint offer", () => {
    render(<SolveScreen s={base} onChanged={noop} say={noop} />);
    expect(screen.getByText("YOUR QUESTION")).toBeTruthy();
  });

  it("submits an answer and reports a wrong one without penalty", async () => {
    api.submitAnswer.mockResolvedValue({ ok: true, correct: false });
    const say = vi.fn();
    render(<SolveScreen s={base} onChanged={noop} say={say} />);
    await userEvent.type(screen.getByPlaceholderText("Your answer"), "Amazon{Enter}");
    await waitFor(() => expect(api.submitAnswer).toHaveBeenCalledWith("task", "Amazon"));
    expect(say).toHaveBeenCalledWith(expect.stringMatching(/3 more misses before \+1:00/), "ink");
  });

  it("offers choices for a multiple-choice question and sends the index", async () => {
    api.submitAnswer.mockResolvedValue({ ok: true, correct: true });
    const s = {
      ...base,
      task: { ...base.task!, format: "mcq" as const, options: ["Nile", "Danube", "Amazon"] },
    };
    render(<SolveScreen s={s} onChanged={noop} say={noop} />);
    await userEvent.click(screen.getByRole("button", { name: /Danube/ }));
    expect(api.submitAnswer).toHaveBeenCalledWith("task", "1");
  });
});

describe("Solve · multiple choice (D-029)", () => {
  const mcq = {
    ...base,
    task: {
      ...base.task!,
      format: "mcq" as const,
      options: ["Nile", "Danube", "Amazon", "Volga"],
      has_hint: false,
    },
  };

  it("says one pick, offers no hint, and deals a new question after a wrong pick", async () => {
    api.submitAnswer.mockResolvedValue({
      ok: true,
      correct: false,
      replaced: true,
      strikes: 1,
      penalized: false,
    });
    const say = vi.fn();
    const onChanged = vi.fn();
    render(<SolveScreen s={mcq} onChanged={onChanged} say={say} />);
    expect(screen.getByText(/One pick/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Take a hint/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Volga/ }));
    expect(api.submitAnswer).toHaveBeenCalledWith("task", "3");
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(say).toHaveBeenCalledWith(
      expect.stringMatching(/new question — 2 more misses before \+1:00/),
      "wax",
    );
  });

  it("shows misses left and keeps the choices open after a third miss (D-041: no lockout)", async () => {
    api.submitAnswer.mockResolvedValue({
      ok: true,
      correct: false,
      replaced: true,
      strikes: 0,
      penalized: true,
    });
    const say = vi.fn();
    render(
      <SolveScreen
        s={{ ...mcq, task: { ...mcq.task, strikes: 2 } }}
        onChanged={noop}
       
        say={say}
      />,
    );
    expect(screen.getByLabelText("1 of 3 misses left before a penalty")).toBeTruthy();
    expect(screen.getByText(/Every 3rd miss adds \+1:00 at check-in/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Volga/ }));
    await waitFor(() => expect(say).toHaveBeenCalledWith(expect.stringMatching(/Third miss.*\+1:00/), "wax"));
    expect(screen.getByRole("button", { name: /Volga/ })).toBeTruthy();
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

describe("game over (D-040)", () => {
  it("names the top 3, marks my crew, says where to go, and closes", async () => {
    const onClose = vi.fn();
    const over = { ...pub, status: "FINISHED" as const, finished_at: "2026-10-25T12:00:00Z" };
    render(<GameOverNotice pub={over} mine="x1" onClose={onClose} />);
    expect(screen.getByRole("alertdialog", { name: "The hunt is over" })).toBeTruthy();
    const winners = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(winners).toEqual(["11st · Salt Wolves", "22nd · Black Tide (your crew)", "33rd · Night Herons"]);
    expect(screen.getByText("Come back to the venue.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("Join (T-1201)", () => {
  const crewForm = async (user: ReturnType<typeof userEvent.setup>, code: string) => {
    await user.type(screen.getByLabelText(/YOUR NAME/), "  Ana ");
    await user.click(screen.getByLabelText("Team code character 1"));
    await user.keyboard(code);
  };
  it("sends the lead, then the team name and all 3 teammates", async () => {
    api.previewCrew.mockResolvedValue({ ok: true, team: { name: "Crew 7", number: 7, status: "forming", members: [] } });
    api.joinCrew.mockResolvedValue({ ok: true });
    api.setupCrew.mockResolvedValue({ ok: true });
    const onJoined = vi.fn();
    const user = userEvent.setup();
    render(<JoinScreen reason={null} onJoined={onJoined} />);
    await crewForm(user, "HX7RMK");
    await user.type(screen.getByLabelText("TEAM NAME"), "Night Owls");
    for (const [i, n] of ["Bo", "Cy", "Di"].entries()) await user.type(screen.getByLabelText(`TEAMMATE ${i + 1}`), n);
    await user.click(screen.getByRole("button", { name: "Join the hunt" }));
    await waitFor(() => expect(onJoined).toHaveBeenCalled());
    expect(api.joinCrew).toHaveBeenCalledWith("Ana", "HX7RMK");
    expect(api.setupCrew).toHaveBeenCalledWith("Night Owls", ["Bo", "Cy", "Di"]);
  });
  it("needs all 3 teammates before it joins", async () => {
    api.previewCrew.mockResolvedValue({ ok: true, team: { name: "Crew 7", number: 7, status: "forming", members: [] } });
    const user = userEvent.setup();
    render(<JoinScreen reason={null} onJoined={noop} />);
    await crewForm(user, "HX7RMK");
    await user.type(screen.getByLabelText("TEAM NAME"), "Night Owls");
    await user.click(screen.getByRole("button", { name: "Join the hunt" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/3 teammates/);
    expect(api.joinCrew).not.toHaveBeenCalled();
  });
  it("a taken team name keeps the seat: the second try only resends the form", async () => {
    api.previewCrew.mockResolvedValue({ ok: true, team: { name: "Crew 7", number: 7, status: "forming", members: [] } });
    api.joinCrew.mockResolvedValue({ ok: true });
    api.setupCrew.mockResolvedValueOnce({ ok: false, code: "CREW_NAME_TAKEN" }).mockResolvedValueOnce({ ok: true });
    const onJoined = vi.fn();
    const user = userEvent.setup();
    render(<JoinScreen reason={null} onJoined={onJoined} />);
    await crewForm(user, "HX7RMK");
    await user.type(screen.getByLabelText("TEAM NAME"), "Night Owls");
    for (const [i, n] of ["Bo", "Cy", "Di"].entries()) await user.type(screen.getByLabelText(`TEAMMATE ${i + 1}`), n);
    await user.click(screen.getByRole("button", { name: "Join the hunt" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Another crew/);
    await user.click(screen.getByRole("button", { name: "Join the hunt" }));
    await waitFor(() => expect(onJoined).toHaveBeenCalled());
    expect(api.joinCrew).toHaveBeenCalledTimes(1);
  });
  it("a crew with a lead asks only for the lead's name, to log back in", async () => {
    api.previewCrew.mockResolvedValue({ ok: true, team: { name: "Owls", number: 7, status: "locked", members: ["A"] } });
    api.joinCrew.mockResolvedValue({ ok: true });
    const onJoined = vi.fn();
    const user = userEvent.setup();
    render(<JoinScreen reason={null} onJoined={onJoined} />);
    await user.click(screen.getByLabelText("Team code character 1"));
    await user.keyboard("HX7RMK");
    expect(await screen.findByText(/already has its lead/)).toBeTruthy();
    expect(screen.queryByLabelText("TEAM NAME")).toBeNull();
    await user.type(screen.getByLabelText(/LEAD'S NAME/), "Ana");
    await user.click(screen.getByRole("button", { name: "Log back in" }));
    await waitFor(() => expect(onJoined).toHaveBeenCalled());
    expect(api.setupCrew).not.toHaveBeenCalled();
  });
});

describe("Lobby (T-1201)", () => {
  it("lists the lead and teammates and waits for Start Hunt", () => {
    const s = { ...base, game: { ...base.game, status: "READY" as const }, round: null, phase: null, team: { ...base.team, named: true, can_name: false, crew: ["Bo", "Cy", "Di"] } };
    render(<LobbyScreen s={s} />);
    for (const n of ["Bo", "Cy", "Di", s.player.name]) expect(screen.getByText(n)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Waiting for Start Hunt/ })).toHaveProperty("disabled", true);
  });
});

describe("Riddle and check-in (T-1202)", () => {
  it("shows the riddle with no map, and the seal code in the final round", () => {
    const pieces = [{ index: 0, solved: true, text: "Where books sleep", by: null, mine: true, hint: false }];
    render(<SeekScreen s={{ ...final, pieces, seal_code: "SEAL99" }} onScan={noop} />);
    expect(screen.getByText("Where books sleep")).toBeTruthy();
    expect(screen.getByLabelText("Crew seal code")).toBeTruthy();
    expect(screen.queryByRole("img", { name: /map/i })).toBeNull();
  });
  it("a typed code goes through the same check-in as the camera", async () => {
    const onCode = vi.fn();
    const user = userEvent.setup();
    render(<CheckInScreen s={seeking} busy={false} onCode={onCode} onBack={noop} />);
    expect(screen.getByTestId("camera")).toBeTruthy();
    const press = screen.getByRole("button", { name: "Check in" });
    expect(press).toHaveProperty("disabled", true);
    await user.click(screen.getByLabelText("Code on the card character 1"));
    await user.keyboard("KEY234");
    await user.click(press);
    expect(onCode).toHaveBeenCalledWith("KEY234", undefined);
  });
  it("the final mark sends the seal code too, filled in from the crew's riddle", async () => {
    const onCode = vi.fn();
    const user = userEvent.setup();
    render(<CheckInScreen s={{ ...final, seal_code: "SEAL99" }} busy={false} onCode={onCode} onBack={noop} />);
    await user.click(screen.getByLabelText("Code on the card character 1"));
    await user.keyboard("KEY234");
    await user.click(screen.getByRole("button", { name: "Check in" }));
    expect(onCode).toHaveBeenCalledWith("KEY234", "SEAL99");
  });
});

describe("question text", () => {
  it("shows code lines as a code block, indentation kept", () => {
    render(<QuestionText text={"What does this print?\nfor i in range(2):\n    print(i)"} />);
    expect(screen.getByText("What does this print?")).toBeTruthy();
    expect(screen.getByLabelText("Code").textContent).toBe("for i in range(2):\n    print(i)");
  });

  it("a one-line question has no code block", () => {
    render(<QuestionText text="Capital of Japan?" />);
    expect(screen.queryByLabelText("Code")).toBeNull();
  });
});

describe("ClueText (T-503)", () => {
  it("shows `code` parts of a clue as code and the rest as text", () => {
    render(
      <p data-testid="clue">
        <ClueText text="Climb: `floor = 2 - 1`. Wing `chr(65)`." />
      </p>,
    );
    const codes = screen.getByTestId("clue").querySelectorAll("code");
    expect([...codes].map((c) => c.textContent)).toEqual(["floor = 2 - 1", "chr(65)"]);
    expect(screen.getByTestId("clue").textContent).toBe("Climb: floor = 2 - 1. Wing chr(65).");
  });
});

describe("Round transition (T-605)", () => {
  it("rolls up the sealed round and unrolls the next when the round goes up, then gets out of the way", () => {
    vi.useFakeTimers();
    const { rerender } = render(<RoundTransition round={1} total={7} />);
    expect(screen.queryByRole("status")).toBeNull();
    rerender(<RoundTransition round={2} total={7} />);
    expect(screen.getByRole("status").textContent).toMatch(/Round 1 sealed\. Round 2 begins\./);
    act(() => vi.advanceTimersByTime(2700));
    expect(screen.queryByRole("status")).toBeNull();
    rerender(<RoundTransition round={7} total={7} />);
    expect(screen.getByRole("status").textContent).toMatch(/THE FINAL ROUND/);
    vi.useRealTimers();
  });
});

describe("Victory chest (T-604)", () => {
  it("shows the rendered still where WebGL can't run (jsdom has none) or motion is reduced", () => {
    render(<VictoryScreen s={{ ...final, team: { ...final.team, status: "finished", final_rank: 1, completion_key: "7QX4MDKP2" } }} />);
    const chest = screen.getByRole("img", { name: "An open treasure chest overflowing with gold coins" });
    expect(chest.querySelector("img")?.getAttribute("src")).toBe("/models/chest-open.webp");
    expect(chest.querySelector("canvas")).toBeNull();
  });
});

