// Runs the site locally against the TEST Supabase project (never production), on http://localhost:3000.
//   npm run dev:test
import { spawn } from "node:child_process";

const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error("TEST_SUPABASE_URL and TEST_SUPABASE_ANON_KEY must be set in .env.local");

const child = spawn("npx", ["next", "dev", "-p", process.env.PORT ?? "3000"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_DIST_DIR: ".next-dev",
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: key,
  },
});
child.on("exit", (code) => process.exit(code ?? 0));
