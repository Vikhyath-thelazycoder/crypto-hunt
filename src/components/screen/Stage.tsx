"use client";

import { useEffect, useState, type ReactNode } from "react";

/** The projector is drawn at 1920 × 1080 (DESIGN.md › Layout) and scaled to fit whatever the screen is, letterboxed. */
export function Stage({ children, background = "#0B0805" }: { children: ReactNode; background?: string }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background }}>
      <div
        className="absolute top-1/2 left-1/2"
        style={{ width: 1920, height: 1080, transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: "50% 50%" }}
      >
        {children}
      </div>
    </div>
  );
}
