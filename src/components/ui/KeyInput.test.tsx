import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KeyInput } from "./KeyInput";

function Harness({ onComplete }: { onComplete?: (v: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <>
      <KeyInput label="Secret key" value={value} onChange={setValue} onComplete={onComplete} />
      <output data-testid="value">{value}</output>
    </>
  );
}

const boxes = () => screen.getAllByRole("textbox");

describe("KeyInput", () => {
  it("renders six labelled boxes in a named group", () => {
    render(<Harness />);
    expect(boxes()).toHaveLength(6);
    expect(screen.getByRole("group", { name: "Secret key" })).toBeTruthy();
    expect(screen.getByLabelText("Secret key character 1")).toBeTruthy();
  });

  it("auto-advances, uppercases and completes", async () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    await userEvent.click(boxes()[0]!);
    await userEvent.keyboard("k7pwh9");
    expect(screen.getByTestId("value").textContent).toBe("K7PWH9");
    expect(onComplete).toHaveBeenCalledWith("K7PWH9");
  });

  it("ignores look-alike characters the alphabet doesn't use", async () => {
    render(<Harness />);
    await userEvent.click(boxes()[0]!);
    await userEvent.keyboard("0O1Ia");
    expect(screen.getByTestId("value").textContent).toBe("A");
    expect(document.activeElement).toBe(boxes()[1]);
  });

  it("fills every box from a paste", async () => {
    render(<Harness />);
    await userEvent.click(boxes()[0]!);
    await userEvent.paste("r3-04 kx");
    expect(screen.getByTestId("value").textContent).toBe("R34KX");
    expect(document.activeElement).toBe(boxes()[5]);
  });

  it("backspace clears and steps back", async () => {
    render(<Harness />);
    await userEvent.click(boxes()[0]!);
    await userEvent.keyboard("ABC{Backspace}{Backspace}");
    expect(screen.getByTestId("value").textContent).toBe("A");
    expect(document.activeElement).toBe(boxes()[1]);
  });
});
