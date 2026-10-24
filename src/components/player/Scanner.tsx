"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { tokenFromScan } from "@/lib/player/format";

type Props = {
  /** Called with a scanned token; scanning pauses while `busy`. */
  onToken: (token: string) => void;
  busy?: boolean;
  /** Shown over the camera at the bottom (e.g. "Your mark · R3-04"). */
  banner?: ReactNode;
  /** Stop the camera (e.g. once the mark is scanned) and show `banner` on the dark box. */
  paused?: boolean;
  height?: number;
};

/** In-site QR scanner (F3, T-302) inside the Check in mockup's camera box. */
export function Scanner({ onToken, busy, banner, paused, height = 236 }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const busyRef = useRef(busy);
  const lastToken = useRef<{ token: string; at: number } | null>(null);
  busyRef.current = busy;

  useEffect(() => {
    if (paused) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    setProblem(null);
    void (async () => {
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        if (cancelled || !video.current) return;
        const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 150 });
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } }, audio: false },
          video.current,
          (result) => {
            if (!result || busyRef.current) return;
            const token = tokenFromScan(result.getText());
            if (!token) return;
            const prev = lastToken.current;
            if (prev && prev.token === token && Date.now() - prev.at < 3000) return;
            lastToken.current = { token, at: Date.now() };
            navigator.vibrate?.(40);
            onToken(token);
          },
        );
        if (cancelled) controls.stop();
        else stop = () => controls.stop();
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        setProblem(
          name === "NotAllowedError"
            ? "Camera blocked. Allow the camera for this site in your browser settings, then try again."
            : name === "NotFoundError"
              ? "No camera found on this device."
              : "The camera didn't start. Try again.",
        );
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [paused, attempt, onToken]);

  return (
    <section
      aria-label="Camera"
      className="relative overflow-hidden rounded-[18px]"
      style={{
        height,
        background: "radial-gradient(90% 80% at 50% 45%, #4A4134 0%, #2A251D 55%, #12100D 100%)",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,.6), 0 16px 26px -14px rgba(18,16,13,.9)",
      }}
    >
      {!paused && (
        <video
          ref={video}
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
          aria-label="Camera view"
        />
      )}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(178deg, rgba(255,255,255,.025) 0 22px, rgba(0,0,0,.05) 22px 46px)",
        }}
      />
      <span
        className="ch-bracket"
        style={{ left: "24%", top: 30, borderWidth: "3px 0 0 3px", borderRadius: "8px 0 0 0" }}
      />
      <span
        className="ch-bracket"
        style={{ right: "24%", top: 30, borderWidth: "3px 3px 0 0", borderRadius: "0 8px 0 0" }}
      />
      <span
        className="ch-bracket"
        style={{ left: "24%", bottom: 30, borderWidth: "0 0 3px 3px", borderRadius: "0 0 0 8px" }}
      />
      <span
        className="ch-bracket"
        style={{ right: "24%", bottom: 30, borderWidth: "0 3px 3px 0", borderRadius: "0 0 8px 0" }}
      />
      {problem && (
        <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 rounded-xl bg-black/70 p-3 text-center text-sm text-[#F4F0DC]">
          <p className="m-0">{problem}</p>
          <button
            type="button"
            className="ch-brass mt-2 h-10 rounded-[10px] px-4 text-sm"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Try again
          </button>
        </div>
      )}
      {banner && <div className="absolute inset-x-3 bottom-3">{banner}</div>}
    </section>
  );
}

/** Green "found" bar from the Check in mockup. */
export function FoundBanner({ title, label, note }: { title: string; label?: string; note: string }) {
  return (
    <div
      role="status"
      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[#F4F0DC]"
      style={{
        background: "linear-gradient(180deg, #5E8549, #3F5F30)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.25), 0 6px 14px rgba(0,0,0,.5)",
      }}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#F4F0DC"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
      <div className="text-[15px] leading-[1.2] font-semibold">
        {title}
        {label && <span className="font-mono font-medium"> · {label}</span>}
        <br />
        <span className="text-[13px] font-normal">{note}</span>
      </div>
    </div>
  );
}
