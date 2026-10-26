"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

/**
 * The finale chest (T-604) for the Victory screen and the projector (T-704): the 3D scene where the device can run
 * it, the rendered still otherwise (reduced motion, no WebGL, or while the model loads).
 */
export function ChestStage() {
  const [three, setThree] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let gl = false;
    try {
      const c = document.createElement("canvas");
      gl = !!(c.getContext("webgl2") ?? c.getContext("webgl"));
    } catch {
      gl = false;
    }
    setThree(!reduce && gl);
  }, []);
  return three ? <ChestFinale /> : <ChestStill />;
}

const ChestStill = () => (
  // eslint-disable-next-line @next/next/no-img-element -- a small static render shipped with the app
  <img src="/models/chest-open.webp" alt="" className="h-full w-full object-contain" />
);

const ChestFinale = dynamic(() => import("@/components/three/ChestFinale"), { ssr: false, loading: ChestStill });
