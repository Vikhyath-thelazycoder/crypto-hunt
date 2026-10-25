import type { PublicState } from "./types";

export type Podium = { rank: number; id: string; name: string }[];

/**
 * The top 3 for the Game over pop-up (D-040). The public state lists crews in standing order (finished by rank,
 * then by rounds completed and time, D-014), so the podium is its first three, never a disqualified crew.
 */
export function podium(pub: PublicState | null): Podium {
  return (pub?.teams ?? [])
    .filter((t) => t.status !== "disqualified")
    .slice(0, 3)
    .map((t, i) => ({ rank: i + 1, id: t.id, name: t.name }));
}
