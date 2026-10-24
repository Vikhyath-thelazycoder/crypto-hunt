import type { Metadata } from "next";
import { PlayerApp } from "@/components/player/PlayerApp";

export const metadata: Metadata = { title: "Crypto Hunt · Play" };

export default function PlayPage() {
  return <PlayerApp />;
}
