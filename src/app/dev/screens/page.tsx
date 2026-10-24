import { notFound } from "next/navigation";
import { ScreenPreview } from "./preview";

// Development only: every player screen with the mockups' sample data, for side-by-side checks against
// docs/design/screens. Not served in production.
export default async function DevScreens({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { s } = await searchParams;
  return <ScreenPreview name={s ?? "solve"} />;
}
