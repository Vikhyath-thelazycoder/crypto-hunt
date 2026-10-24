import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const report = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
vi.mock("@/lib/player/api", () => ({ reportFocusEvent: report }));
import { useFocusGuard } from "./useFocusGuard";

const setVisibility = (state: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
};

describe("useFocusGuard (D-017)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    report.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("reports leaving while a question is open and warns on return", () => {
    const { result } = renderHook(() => useFocusGuard("task-1"));
    act(() => setVisibility("hidden"));
    act(() => vi.advanceTimersByTime(34_000));
    act(() => setVisibility("visible"));
    expect(report).toHaveBeenCalledWith("task-1", "hidden", 34_000);
    expect(result.current.warned).toBe(true);
    act(() => result.current.dismiss());
    expect(result.current.warned).toBe(false);
  });

  it("ignores a flick shorter than 1.5 s", () => {
    const { result } = renderHook(() => useFocusGuard("task-1"));
    act(() => setVisibility("hidden"));
    act(() => vi.advanceTimersByTime(800));
    act(() => setVisibility("visible"));
    expect(report).not.toHaveBeenCalled();
    expect(result.current.warned).toBe(false);
  });

  it("does nothing when no question is open", () => {
    renderHook(() => useFocusGuard(null));
    act(() => setVisibility("hidden"));
    act(() => vi.advanceTimersByTime(10_000));
    act(() => setVisibility("visible"));
    expect(report).not.toHaveBeenCalled();
  });
});
