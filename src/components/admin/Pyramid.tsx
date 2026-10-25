"use client";

import { useMemo } from "react";
import { layoutPyramid, pathOf, VIEW } from "@/lib/admin/course";
import type { Plan } from "@/lib/generator";
import { roman } from "@/lib/player/format";

/**
 * The pyramid of marks (Generator.dc.html): round I at the bottom, the final at the top, every link, the spares
 * dashed, and one crew's path in wax red. Clicking a starting mark shows that crew's path.
 */
export function Pyramid({
  plan,
  spares,
  teamNames,
  pathTeam,
  onPickTeam,
}: {
  plan: Plan;
  spares: string[];
  teamNames: Map<string, string>;
  pathTeam: string | null;
  onPickTeam: (teamId: string) => void;
}) {
  const layout = useMemo(() => layoutPyramid(plan, spares), [plan, spares]);
  const rounds = plan.rounds.length;
  const path = pathTeam ? pathOf(plan, pathTeam) : [];
  const starter = new Map(plan.assignments.filter((a) => a.round === 1).map((a) => [a.qr, a.team_id]));
  const half = 11 * layout.scale;
  const seg = (from: string, to: string) => {
    const a = layout.byRef.get(from);
    const b = layout.byRef.get(to);
    if (!a || !b) return "";
    const top = b.final ? 20 * layout.scale : half;
    return `M${a.x.toFixed(1)},${(a.y - half).toFixed(1)} L${b.x.toFixed(1)},${(b.y + top).toFixed(1)}`;
  };
  const pathD = path.slice(1).map((ref, i) => seg(path[i]!, ref)).join(" ");
  const start = path[0] ? layout.byRef.get(path[0]) : undefined;
  const name = pathTeam ? teamNames.get(pathTeam) : undefined;
  const label = (r: (typeof plan.rounds)[number]) =>
    r.number === rounds ? `${r.qr_count} · top ${r.advance_count}` : `${r.qr_count} · ${r.advance_count} adv`;

  return (
    <svg
      viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
      role="img"
      aria-label={`Pyramid of marks: ${plan.rounds.map((r) => r.qr_count).join(", ")}. Each mark links to one mark in the next round. ${spares.length} round-one marks are spares.`}
      className="mt-2.5 block h-auto w-full"
    >
      <defs>
        <linearGradient id="ch-qbg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFBEF" />
          <stop offset="1" stopColor="#E4D2A8" />
        </linearGradient>
        <radialGradient id="ch-gold" cx="38%" cy="30%" r="80%">
          <stop offset="0" stopColor="#FFF4C4" />
          <stop offset=".5" stopColor="#E2B547" />
          <stop offset="1" stopColor="#7A5410" />
        </radialGradient>
      </defs>
      <g stroke="#B9975C" strokeWidth="1" strokeDasharray="2 5">
        {plan.rounds.map((r) => (
          <path key={r.number} d={`M60,${layout.rowY(r.number)} H800`} />
        ))}
      </g>
      <g fontFamily="IM Fell English SC, serif" fontSize="17" fill="#2A1D12">
        {plan.rounds.map((r) => (
          <text key={r.number} x="8" y={layout.rowY(r.number) + 6} fill={r.number === rounds ? "#8E1B1B" : undefined}>
            {roman(r.number)}
          </text>
        ))}
      </g>
      <g fontFamily="IBM Plex Mono, monospace" fontSize="13" fill="#5E3D20" textAnchor="end">
        {plan.rounds.map((r) => (
          <text key={r.number} x="836" y={layout.rowY(r.number) + 5} fill={r.number === rounds ? "#8E1B1B" : undefined}>
            {label(r)}
          </text>
        ))}
      </g>
      <path
        d={plan.links.map((l) => seg(l.from, l.to)).join(" ")}
        stroke="#6E4A2A"
        strokeWidth="1.3"
        fill="none"
        opacity=".7"
      />
      {pathD && <path d={pathD} stroke="#8E1B1B" strokeWidth="3" fill="none" strokeLinecap="round" />}
      {layout.nodes.map((n) => {
        const team = n.round === 1 ? starter.get(n.ref) : undefined;
        const title = `${n.ref}${n.spare ? " · spare" : ""}${team ? ` · ${teamNames.get(team) ?? "crew"} starts here` : ""}`;
        if (n.final)
          return (
            <g key={n.ref} transform={`translate(${n.x} ${n.y}) scale(${layout.scale})`}>
              <title>{title}</title>
              <circle r="20" fill="url(#ch-gold)" stroke="#5A400B" strokeWidth="1.4" />
              <path d="M0,-11 L3,-3.5 L11,-3.5 L4.5,1.5 L7,9.5 L0,4.5 L-7,9.5 L-4.5,1.5 L-11,-3.5 L-3,-3.5Z" fill="#5A400B" />
            </g>
          );
        return (
          <g
            key={n.ref}
            transform={`translate(${n.x} ${n.y}) scale(${layout.scale})`}
            style={team ? { cursor: "pointer" } : undefined}
            onClick={team ? () => onPickTeam(team) : undefined}
          >
            <title>{title}</title>
            {n.spare ? (
              <rect x="-11" y="-11" width="22" height="22" rx="4" fill="none" stroke="#6E4A2A" strokeWidth="1.4" strokeDasharray="3 2.5" />
            ) : (
              <>
                <rect x="-11" y="-11" width="22" height="22" rx="4" fill="url(#ch-qbg)" stroke="#2A1D12" strokeWidth="1.4" />
                <rect x="-7" y="-7" width="5" height="5" fill="#2A1D12" />
                <rect x="2" y="-7" width="5" height="5" fill="#2A1D12" />
                <rect x="-7" y="2" width="5" height="5" fill="#2A1D12" />
                <rect x="3" y="3" width="3" height="3" fill="#8E1B1B" />
              </>
            )}
          </g>
        );
      })}
      {start && name && (
        <g transform={`translate(${Math.min(VIEW.w - 50, Math.max(50, start.x))} ${start.y + 30})`}>
          <rect x={-Math.max(44, name.length * 4.2)} y="-9" width={Math.max(88, name.length * 8.4)} height="18" rx="9" fill="#8E1B1B" />
          <text y="4" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="11" fill="#F7E9C8">
            {name.toUpperCase()}
          </text>
        </g>
      )}
    </svg>
  );
}
