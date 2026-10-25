"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminError, signInAdmin, signOutAdmin } from "@/lib/admin/api";
import { safeNext } from "@/lib/admin/gate";
import { adminMessage } from "@/lib/admin/messages";
import { Compass } from "./parts";

/** /admin/login (F22, D-006): the admin name and passcode. */
export function AdminLogin({ denied, next }: { denied: boolean; next: string | null }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    denied ? "This account isn't the captain. Sign in with the admin name and passcode." : null,
  );

  const submit = async () => {
    if (busy || !name.trim() || !passcode) return;
    setBusy(true);
    setError(null);
    try {
      // A player's session on this browser would shadow the admin's: start clean.
      if (denied) await signOutAdmin();
      const r = await signInAdmin(name, passcode);
      if (r === "ok") {
        router.replace(safeNext(next));
        router.refresh();
        return;
      }
      setError(
        r === "not_admin"
          ? "That account isn't the captain."
          : "That name and passcode don't match. Check them and try again.",
      );
    } catch (e) {
      setError(adminMessage(e instanceof AdminError ? e.code : "SERVER"));
    }
    setBusy(false);
  };

  return (
    <main className="ch-admin flex items-center justify-center px-4 py-10">
      <form
        className="ch-asheet flex w-full max-w-[400px] flex-col gap-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex items-center gap-3">
          <Compass size={44} />
          <div>
            <h1 className="m-0 font-display text-[28px] leading-none font-normal">Crypto Hunt</h1>
            <p className="m-0 mt-1 text-sm text-[#5E3D20]">Captain&apos;s table · sign in</p>
          </div>
        </div>
        <div>
          <label htmlFor="admin-name" className="ch-lbl mb-1.5">
            ADMIN NAME
          </label>
          <input
            id="admin-name"
            className="ch-inp"
            autoComplete="username"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="admin-pass" className="ch-lbl mb-1.5">
            PASSCODE
          </label>
          <input
            id="admin-pass"
            type="password"
            className="ch-inp"
            autoComplete="current-password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="m-0 text-[15px] leading-snug text-[#8E1B1B]">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="ch-awax h-[50px] rounded-xl text-lg"
          disabled={busy || !name.trim() || !passcode}
        >
          {busy ? "Opening the chart…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
