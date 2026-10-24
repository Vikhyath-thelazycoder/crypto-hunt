import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Integration tests run against the crypto-hunt-test cloud project only (D-022). Never production.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["integration/**/*.test.ts"],
    env: loadEnv("", process.cwd(), ["TEST_", "NEXT_PUBLIC_"]),
    globalSetup: ["./integration/global-setup.ts"],
    fileParallelism: false,
    // One module context for all files, so harness.ts reuses signed-in accounts (Auth sign-in rate limits).
    isolate: false,
    testTimeout: 60_000,
    hookTimeout: 300_000,
  },
});
