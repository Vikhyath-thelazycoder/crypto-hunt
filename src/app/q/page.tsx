import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "@/components/player/parts";

export const metadata: Metadata = { title: "Crypto Hunt · Open the game" };

/**
 * Where a printed QR lands when a normal camera app opens it (T-302, SECURITY T2). It has no side effects:
 * /q/<token> redirects here (next.config.ts), so the token never stays in the address bar or history.
 */
export default function QrLanding() {
  return (
    <main className="ch-paper flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center text-ink">
      <Compass size={110} />
      <h1 className="m-0 font-display text-[40px] leading-none font-normal">A Crypto Hunt mark</h1>
      <p className="m-0 max-w-[320px] text-lg leading-[1.4] text-sepia-ink">
        Marks only count when you scan them inside the game. Open Crypto Hunt and use its scanner.
      </p>
      <Link
        href="/play"
        className="ch-wax mt-2 flex h-[58px] w-full max-w-[340px] items-center justify-center rounded-[14px] text-[22px] no-underline"
      >
        Open Crypto Hunt
      </Link>
    </main>
  );
}
