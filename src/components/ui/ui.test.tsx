import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ParchmentPanel, SealButton, StateWord } from "./index";

describe("SealButton", () => {
  it("is a real button that never submits forms by accident", () => {
    render(<SealButton>Press my seal</SealButton>);
    const btn = screen.getByRole("button", { name: "Press my seal" });
    expect(btn.getAttribute("type")).toBe("button");
    expect(btn.className).toContain("ch-wax");
  });

  it("renders the secondary looks", () => {
    render(
      <>
        <SealButton variant="ghost">Scan a different mark</SealButton>
        <SealButton variant="brass">Export CSV</SealButton>
      </>,
    );
    expect(screen.getByRole("button", { name: "Scan a different mark" }).className).toContain("ch-ghost");
    expect(screen.getByRole("button", { name: "Export CSV" }).className).toContain("ch-brass");
  });
});

describe("StateWord", () => {
  it("announces the state politely", () => {
    render(<StateWord>Sealed</StateWord>);
    const word = screen.getByRole("status");
    expect(word.getAttribute("aria-live")).toBe("polite");
    expect(word.textContent).toBe("Sealed");
  });
});

describe("ParchmentPanel", () => {
  it("is a named region", () => {
    render(<ParchmentPanel label="Crew check-in">4 seals</ParchmentPanel>);
    expect(screen.getByRole("region", { name: "Crew check-in" }).className).toContain("ch-panel");
  });

  it("matches the stored markup", () => {
    const { container } = render(
      <ParchmentPanel label="Hints used" className="px-4">
        <StateWord tone="ink">Penalty</StateWord>
      </ParchmentPanel>,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });
});
