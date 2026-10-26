"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { siteOrigin } from "@/lib/site";
import { Modal } from "./parts";

/** Where players join: this site's /play. */
export const joinUrl = (origin: string) => `${origin}/play`;

/**
 * The players' join QR (F2): a big code for /play that phones scan with their normal camera to open the site. Show it
 * on the laptop, put it full screen on a projector, or copy the link to send to the crews.
 */
export function JoinQrButton({ className, label = "Join QR" }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && <JoinQrDialog onClose={() => setOpen(false)} />}
    </>
  );
}

export function JoinQrDialog({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const u = joinUrl(siteOrigin());
    setUrl(u);
    void QRCode.toDataURL(u, { errorCorrectionLevel: "M", margin: 2, width: 720, color: { dark: "#000000", light: "#ffffff" } }).then(
      setQr,
    );
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal title="Players join here" onClose={onClose} width={520}>
      <div ref={stage} className="ch-joinqr flex flex-col items-center gap-3 rounded-xl bg-white p-5 text-center text-[#2A1D12]">
        <p className="m-0 font-display text-lg tracking-[.2em]">SCAN TO JOIN THE HUNT</p>
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element -- a data: URI made on this page
          <img src={qr} alt={`QR code for ${url}`} data-testid="join-qr" data-url={url} className="h-auto w-full max-w-[360px]" />
        ) : (
          <div className="h-[360px] w-[360px]" />
        )}
        <p className="m-0 font-mono text-lg font-semibold break-all">{url.replace(/^https?:\/\//, "")}</p>
        <p className="m-0 text-sm">Open your phone camera, point it at the code, then type your name and your crew&apos;s code.</p>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" className="ch-plain h-10 rounded-[10px] px-4 text-[15px]" onClick={copy}>
          {copied ? "Copied" : "Copy link"}
        </button>
        <button
          type="button"
          className="ch-brass h-10 rounded-[10px] px-4 text-[15px]"
          onClick={() => void stage.current?.requestFullscreen?.().catch(() => {})}
        >
          Full screen
        </button>
      </div>
    </Modal>
  );
}
