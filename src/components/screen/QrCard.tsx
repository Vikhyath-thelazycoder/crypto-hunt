"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** A QR on a white card, readable across a hall (the universal start QR, or the players' join QR before the start). */
export function QrCard({ url, size, title, note }: { url: string; size: number; title: string; note?: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    void QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: size * 2, color: { dark: "#000000", light: "#ffffff" } }).then(
      (d) => live && setSrc(d),
    );
    return () => {
      live = false;
    };
  }, [url, size]);
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-2xl bg-white text-center text-[#2A1D12]"
      style={{ padding: size >= 400 ? 28 : 14, boxShadow: "0 0 0 3px rgba(226,190,114,.8), 0 24px 50px rgba(0,0,0,.7)" }}
    >
      <div className="font-display tracking-[.18em]" style={{ fontSize: size >= 400 ? 40 : 22 }}>
        {title}
      </div>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a data: URI made on this page
        <img src={src} alt={`QR code: ${title.toLowerCase()}`} width={size} height={size} data-testid="screen-qr" data-url={url} />
      ) : (
        <div style={{ width: size, height: size }} />
      )}
      {note && (
        <div className="text-[#5E3D20]" style={{ fontSize: size >= 400 ? 30 : 17 }}>
          {note}
        </div>
      )}
    </div>
  );
}
