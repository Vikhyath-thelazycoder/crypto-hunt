import { z } from "zod";

/** A secret key in a NEXT_PUBLIC_ slot would ship to every phone (SECURITY.md T16). */
function isSecretKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  // Legacy keys are JWTs; the service-role one says so in its payload.
  const payload = key.split(".")[1];
  if (!payload) return false;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return json?.role === "service_role";
  } catch {
    return false;
  }
}

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1)
    .refine((k) => !isSecretKey(k), "must be the publishable (anon) key, never a secret key"),
});

export type PublicEnv = z.infer<typeof publicSchema>;

/** Forgives the usual copy-paste slips in hosting dashboards: surrounding spaces and quotes. */
function clean(value: string | undefined): string | undefined {
  const v = value
    ?.trim()
    .replace(/^["']+|["']+$/g, "")
    .trim();
  return v ? v : undefined;
}

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const cleaned = Object.fromEntries(Object.entries(source).map(([k, v]) => [k, clean(v)]));
  const result = publicSchema.safeParse(cleaned);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment variables:\n${problems.join("\n")}\nSee .env.example.`);
  }
  return result.data;
}

// NEXT_PUBLIC_* values are inlined at build time, so they must be read by their literal names.
export const publicEnv = (): PublicEnv =>
  parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
