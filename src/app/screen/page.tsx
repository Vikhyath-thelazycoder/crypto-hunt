import type { Metadata } from "next";
import { ScreenApp } from "@/components/screen/Projector";

export const metadata: Metadata = { title: "Crypto Hunt · Projector" };

/** The audience view for the projector (P7): open it full screen on the laptop driving the projector. */
export default function ScreenPage() {
  return <ScreenApp />;
}
