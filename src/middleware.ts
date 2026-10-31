import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { buildCsp } from "@/lib/security/csp";

export async function middleware(request: NextRequest) {
  let env: ReturnType<typeof publicEnv>;
  try {
    env = publicEnv();
  } catch (e) {
    return misconfigured(e);
  }
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp({
    nonce,
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    dev: process.env.NODE_ENV === "development",
  });

  // Next.js reads the nonce from the request's CSP header and applies it to its own scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  // Only the admin pages read the session on the server. A player's page load must not reach Supabase Auth: it adds
  // load during a game, and a refresh here races the phone's own (a used refresh token signs the player out).
  if (!request.nextUrl.pathname.startsWith("/admin")) {
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  // Refresh the Supabase session cookie on admin requests.
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

/** Fail fast with the names of the bad variables (never their values) instead of crashing every request. */
function misconfigured(e: unknown) {
  const detail = (e instanceof Error ? e.message : "Invalid environment variables").replace(/[<>&]/g, "");
  const html = `<!doctype html><meta charset="utf-8"><title>Setup needed</title><body style="font-family:Georgia,serif;background:#EADBB8;color:#2A1D12;padding:32px;max-width:720px;margin:auto"><h1>Crypto Hunt needs setup</h1><p>The server's environment variables are missing or invalid:</p><pre style="white-space:pre-wrap;background:#D9C394;padding:16px;border-radius:12px">${detail}</pre><p>Set them in Vercel → Settings → Environment Variables, then <b>redeploy</b>. NEXT_PUBLIC_ variables only take effect after a new build.</p></body>`;
  return new NextResponse(html, { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|models/).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
