import { notFound } from "next/navigation";
import { ProjectorPreview } from "@/components/screen/preview";
import { ScreenPreview } from "./preview";

// Development only: every player and projector screen with the mockups' sample data, for side-by-side checks against
// docs/design/screens. Not served in production.
export default async function DevScreens({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { s } = await searchParams;
  if (s?.startsWith("screen-")) return <ProjectorPreview name={s} />;
  return <ScreenPreview name={s ?? "solve"} />;
}
