import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";

// After the run, delete every account the tests created (pooled players, admin, join-function users).
export async function teardown() {
  const env = loadEnv("", process.cwd(), ["TEST_"]);
  const service = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (let page = 1; page < 20; page++) {
    const { data } = await service.auth.admin.listUsers({ page, perPage: 200 });
    const users = data?.users ?? [];
    for (const u of users) {
      if (u.email?.endsWith("@itest.cryptohunt.dev") || u.email?.endsWith("@players.cryptohunt.app")) {
        await service.auth.admin.deleteUser(u.id);
      }
    }
    if (users.length < 200) break;
  }
}
