"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { check, AdminError } from "@/lib/admin/api";
import { adminMessage } from "@/lib/admin/messages";
import { placeLine } from "@/lib/admin/place";
import type { Location, VenueMap } from "@/lib/admin/types";
import { prankCount, pyramidCounts } from "@/lib/engine";
import { roman } from "@/lib/player/format";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { AdminHeader, AdminPage, attempt, ConfirmDialog, Trouble, Unrolling, useToast, type Say } from "./parts";

const BUCKET = "venue";
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];
/** Default drawing size when no venue image is uploaded yet. */
const BLANK = { width: 800, height: 600 };
const RADIUS = { min: 0.02, max: 0.3, step: 0.005, initial: 0.08 };

type Draft = {
  id: string | null;
  name: string;
  /** D-043: typed as text, saved as a whole number 1–999 or nothing. */
  place_no: string;
  building: string;
  floor: string;
  landmark: string;
  notes: string;
  pieces: [string, string, string, string];
  hint: string;
  map_x: number | null;
  map_y: number | null;
  reveal_radius: number;
};

const toDraft = (l: Location): Draft => ({
  id: l.id,
  name: l.name,
  place_no: l.place_no === null ? "" : String(l.place_no),
  building: l.building ?? "",
  floor: l.floor ?? "",
  landmark: l.landmark ?? "",
  notes: l.notes ?? "",
  pieces: [0, 1, 2, 3].map((i) => l.clue_pieces[i] ?? "") as Draft["pieces"],
  hint: l.hint ?? "",
  map_x: l.map_x === null ? null : r3(l.map_x),
  map_y: l.map_y === null ? null : r3(l.map_y),
  reveal_radius: r3(l.reveal_radius),
});
const blankDraft = (): Draft => ({
  id: null,
  name: "",
  place_no: "",
  building: "",
  floor: "",
  landmark: "",
  notes: "",
  pieces: ["", "", "", ""],
  hint: "",
  map_x: null,
  map_y: null,
  reveal_radius: RADIUS.initial,
});
const same = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);
/** Stored as float4: keep 3 decimals so a saved value reads back identical. */
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const filled = (l: Pick<Location, "clue_pieces">) => l.clue_pieces.filter((p) => p.trim()).length;
const FLOORS = ["Ground floor", "1st floor", "2nd floor", "Outdoor"];
/** Numbered places first, in number order (D-043); then the rest as added. */
const byNumber = (a: Location, b: Location) =>
  (a.place_no ?? Infinity) - (b.place_no ?? Infinity) ||
  a.created_at.localeCompare(b.created_at) ||
  a.name.localeCompare(b.name, undefined, { numeric: true });

/** /admin/locations (MapEditor.dc.html, T-403, F11). Locations are kept across games. */
export function Locations() {
  const { say, toast } = useToast();
  const [locs, setLocs] = useState<Location[] | null>(null);
  const [map, setMap] = useState<VenueMap | null>(null);
  const [needed, setNeeded] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getBrowserSupabase();
    try {
      const [l, m, teams, marks] = await Promise.all([
        supabase.from("locations").select("*").order("created_at").order("name"),
        supabase.from("venue_map").select("*").eq("id", 1).maybeSingle(),
        supabase.from("teams").select("id", { count: "exact", head: true }),
        supabase.from("qr_codes").select("id", { count: "exact", head: true }).neq("kind", "universal"),
      ]);
      // Same-moment rows (a batch import) in natural order: Spot 2 before Spot 10.
      setLocs((check(l) as Location[]).sort(byNumber));
      setMap((check(m) as VenueMap | null) ?? null);
      // Marks of the generated course, or what the default pyramid needs for the crews so far.
      const n = teams.count ?? 0;
      if ((marks.count ?? 0) > 0) setNeeded(marks.count!);
      else if (n > 0) {
        const pyramid = pyramidCounts(n).reduce((a, b) => a + b, 0);
        setNeeded(pyramid + prankCount(pyramid));
      } else setNeeded(null);
      setError(null);
    } catch (e) {
      setError(e instanceof AdminError ? e.code : "SERVER");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const header = (
    <AdminHeader
      right={
        locs && (
          <span className="font-mono text-sm text-[#BFA77F]">
            {locs.length} locations{needed !== null ? ` · ${needed} needed` : ""}
          </span>
        )
      }
    />
  );
  if (error) return <AdminPage header={header}><Trouble code={error} onRetry={load} /></AdminPage>;
  if (!locs) return <AdminPage header={header}><Unrolling /></AdminPage>;
  return (
    <AdminPage header={header}>
      <Editor locs={locs} map={map} say={say} reload={load} />
      {toast}
    </AdminPage>
  );
}

function Editor({ locs, map, say, reload }: { locs: Location[]; map: VenueMap | null; say: Say; reload: () => Promise<void> }) {
  const [selected, setSelected] = useState<string | null>(locs[0]?.id ?? null);
  const [draft, setDraft] = useState<Draft>(locs[0] ? toDraft(locs[0]) : blankDraft());
  const [wanted, setWanted] = useState<string | "new" | null>(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [remove, setRemove] = useState(false);
  const searchId = useId();

  const base = useMemo(() => {
    const l = locs.find((x) => x.id === selected);
    return l ? toDraft(l) : blankDraft();
  }, [locs, selected]);
  const dirty = !same(draft, base);
  // The pin and list number is the place number (D-043); a place without one shows its position in the list.
  const number = new Map(locs.map((l, i) => [l.id, String(l.place_no ?? i + 1).padStart(2, "0")]));
  const q = query.trim().toLowerCase();
  const shown = locs.filter((l) =>
    [l.name, l.building, l.floor, l.place_no === null ? null : `#${l.place_no}`].some((v) => v?.toLowerCase().includes(q)),
  );
  const buildings = [...new Set(locs.map((l) => l.building?.trim()).filter((b): b is string => !!b))].sort();

  const open = (id: string | "new") => {
    if (dirty) return setWanted(id);
    setWanted(null);
    if (id === "new") {
      setSelected(null);
      setDraft(blankDraft());
    } else {
      setSelected(id);
      const l = locs.find((x) => x.id === id);
      if (l) setDraft(toDraft(l));
    }
  };
  // A place removed (here or in another tab): move to the first one left.
  useEffect(() => {
    const id = draft.id ?? selected;
    if (id && !locs.some((l) => l.id === id)) {
      setSelected(locs[0]?.id ?? null);
      setDraft(locs[0] ? toDraft(locs[0]) : blankDraft());
    }
  }, [locs, selected, draft.id]);

  const save = async (): Promise<boolean> => {
    const name = draft.name.trim();
    if (name.length < 1 || name.length > 80) {
      say("Give the place a name (up to 80 characters).", "wax");
      return false;
    }
    const no = draft.place_no.trim();
    const place_no = no ? Number(no) : null;
    if (place_no !== null && !(Number.isInteger(place_no) && place_no >= 1 && place_no <= 999)) {
      say("The place number is a whole number from 1 to 999.", "wax");
      return false;
    }
    const taken = place_no !== null && locs.find((l) => l.place_no === place_no && l.id !== draft.id);
    if (taken) {
      say(`Place #${place_no} is already ${taken.name}. Give this place another number.`, "wax");
      return false;
    }
    setSaving(true);
    const row = {
      name,
      place_no,
      building: draft.building.trim() || null,
      floor: draft.floor.trim() || null,
      landmark: draft.landmark.trim() || null,
      notes: draft.notes.trim() || null,
      clue_pieces: draft.pieces.map((p) => p.trim()),
      hint: draft.hint.trim() || null,
      map_x: draft.map_x,
      map_y: draft.map_y,
      reveal_radius: draft.reveal_radius,
    };
    const supabase = getBrowserSupabase();
    let savedId = draft.id;
    const ok = await attempt(async () => {
      if (draft.id) check(await supabase.from("locations").update(row).eq("id", draft.id).select("id").single());
      else savedId = (check(await supabase.from("locations").insert(row).select("id").single()) as { id: string }).id;
    }, say, `${name} saved.`);
    setSaving(false);
    if (ok) {
      await reload();
      setSelected(savedId);
      setDraft({
        ...draft,
        id: savedId,
        name,
        place_no: place_no === null ? "" : String(place_no),
        building: row.building ?? "",
        floor: row.floor ?? "",
        landmark: row.landmark ?? "",
        notes: row.notes ?? "",
        hint: row.hint ?? "",
        pieces: row.clue_pieces as Draft["pieces"],
      });
    }
    return ok;
  };

  // Pins save as they drop (saved places); a new place keeps its pin in the draft until Save.
  const movePin = async (id: string | null, x: number, y: number) => {
    const map_x = r3(Math.min(1, Math.max(0, x)));
    const map_y = r3(Math.min(1, Math.max(0, y)));
    if (id === draft.id) setDraft((d) => ({ ...d, map_x, map_y }));
    if (!id) return;
    await attempt(async () => {
      check(await getBrowserSupabase().from("locations").update({ map_x, map_y }).eq("id", id).select("id").single());
    }, say);
    await reload();
  };

  const removeNow = async () => {
    if (!draft.id) return true;
    const ok = await attempt(async () => {
      check(await getBrowserSupabase().from("locations").delete().eq("id", draft.id!).select("id").single());
    }, say, `${draft.name} removed.`);
    if (ok) await reload();
    return ok;
  };

  return (
    <div className="flex flex-wrap items-start gap-[22px] px-7 pt-[26px] pb-8">
      <section className="ch-asheet min-w-0 px-3 py-4" aria-label="Location list" style={{ flex: "1 1 250px" }}>
        <div className="flex gap-2 px-1 pb-2.5">
          <label htmlFor={searchId} className="sr-only">
            Search locations
          </label>
          <input id={searchId} className="ch-inp" placeholder={`Search ${locs.length} places`} value={query} onChange={(e) => setQuery(e.target.value)} />
          <button
            type="button"
            className="ch-brass flex h-10 w-10 flex-none items-center justify-center rounded-lg"
            aria-label="Add location"
            onClick={() => open("new")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2A1D12" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
        {locs.length === 0 && (
          <p className="m-0 px-2.5 py-2 text-[15px] text-[#4A2F18]">
            No places yet. Press + to add the first spot where a QR will hide.
          </p>
        )}
        <div className="max-h-[70vh] overflow-y-auto">
          {shown.map((l) => (
            <button key={l.id} type="button" className="ch-loc" aria-current={l.id === selected ? "true" : undefined} onClick={() => open(l.id)}>
              <span className="ch-pinno" data-unpinned={l.map_x === null || undefined}>
                {number.get(l.id)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{l.name}</span>
                {(l.building || l.floor) && (
                  <span className="block truncate text-[12px] text-[#5E3D20]">
                    {[l.building, l.floor].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
              <span className="font-mono text-[11px] text-[#5E3D20]">
                {filled(l) === 0 ? "no clue" : `${filled(l)}/4`}
                {l.map_x === null ? " · no pin" : ""}
              </span>
            </button>
          ))}
        </div>
        <p className="m-0 mt-2.5 px-2.5 text-[13px] text-[#5E3D20]">Locations stay between games</p>
      </section>

      <section className="ch-asheet min-w-0 p-4" aria-label="Venue map" style={{ flex: "999 1 560px" }}>
        <MapPanel
          locs={locs}
          map={map}
          number={number}
          draft={draft}
          onPin={movePin}
          onRadius={(r) => setDraft((d) => ({ ...d, reveal_radius: r }))}
          onSelect={(id) => open(id)}
          say={say}
          reload={reload}
        />
      </section>

      <section className="ch-asheet flex min-w-0 flex-col gap-3 px-[18px] pt-[18px] pb-5" aria-label="Edit location" style={{ flex: "1 1 330px" }}>
        {wanted !== null && (
          <div role="alert" className="rounded-[10px] bg-[rgba(142,27,27,.1)] p-3 text-[15px] shadow-[inset_0_0_0_1px_rgba(142,27,27,.45)]">
            Unsaved changes to <b>{draft.name.trim() || "this place"}</b>.
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="ch-awax h-9 rounded-lg px-3 text-sm"
                onClick={async () => {
                  const next = wanted;
                  if (await save()) {
                    setWanted(null);
                    if (next === "new") {
                      setSelected(null);
                      setDraft(blankDraft());
                    } else {
                      const l = locs.find((x) => x.id === next);
                      setSelected(next);
                      if (l) setDraft(toDraft(l));
                    }
                  }
                }}
              >
                Save
              </button>
              <button
                type="button"
                className="ch-plain h-9 rounded-lg px-3 text-sm"
                onClick={() => {
                  const next = wanted;
                  setWanted(null);
                  if (next === "new") {
                    setSelected(null);
                    setDraft(blankDraft());
                  } else {
                    setSelected(next);
                    const l = locs.find((x) => x.id === next);
                    if (l) setDraft(toDraft(l));
                  }
                }}
              >
                Discard
              </button>
            </div>
          </div>
        )}
        <LocationForm draft={draft} setDraft={setDraft} number={draft.id ? (number.get(draft.id) ?? "—") : "new"} buildings={buildings} />
        <div className="mt-1 flex gap-2.5">
          <button type="button" className="ch-awax h-[46px] flex-1 rounded-[11px] text-base" disabled={saving || (!dirty && !!draft.id)} onClick={() => void save()}>
            {saving ? "Saving…" : draft.id ? "Save location" : "Add location"}
          </button>
          {draft.id ? (
            <button type="button" className="ch-plain h-[46px] rounded-[11px] px-4" onClick={() => setRemove(true)}>
              Remove
            </button>
          ) : (
            locs.length > 0 && (
              <button type="button" className="ch-plain h-[46px] rounded-[11px] px-4" onClick={() => open(locs[0]!.id)}>
                Cancel
              </button>
            )
          )}
        </div>
      </section>
      {remove && (
        <ConfirmDialog
          title={`Remove ${draft.name}?`}
          body="Its clue pieces and pin are deleted. A place that holds a mark in the current course can't be removed until the course is generated again."
          confirmLabel="Remove location"
          onConfirm={removeNow}
          onClose={() => setRemove(false)}
        />
      )}
    </div>
  );
}

function LocationForm({
  draft,
  setDraft,
  number,
  buildings,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  number: string;
  buildings: string[];
}) {
  const ids = {
    name: useId(),
    no: useId(),
    building: useId(),
    buildings: useId(),
    floor: useId(),
    floors: useId(),
    landmark: useId(),
    note: useId(),
    hint: useId(),
    rad: useId(),
  };
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <>
      <div className="flex items-center gap-2.5">
        <span className="ch-pinno h-[30px] w-[30px] text-[13px]" data-unpinned={draft.map_x === null || undefined}>
          {number === "new" ? "+" : number}
        </span>
        <h2 className="m-0 truncate font-display text-2xl font-normal">{draft.name.trim() || "New place"}</h2>
      </div>
      {draft.map_x === null && (
        <p className="m-0 text-sm text-[#8E1B1B]">No pin yet: click the map where this place is.</p>
      )}
      <div>
        <label className="ch-lbl mb-[5px]" htmlFor={ids.name}>
          NAME
        </label>
        <input id={ids.name} className="ch-inp" value={draft.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />
      </div>
      {/* D-043: printed on the card's cut-off stub, so whoever hides it knows exactly where it goes. */}
      <div className="flex gap-2.5">
        <div className="w-[84px] flex-none">
          <label className="ch-lbl mb-[5px]" htmlFor={ids.no}>
            PLACE #
          </label>
          <input id={ids.no} className="ch-inp" inputMode="numeric" value={draft.place_no} maxLength={3} placeholder="12" onChange={(e) => set({ place_no: e.target.value.replace(/\D/g, "") })} />
        </div>
        <div className="min-w-0 flex-1">
          <label className="ch-lbl mb-[5px]" htmlFor={ids.floor}>
            FLOOR
          </label>
          <input id={ids.floor} className="ch-inp" list={ids.floors} value={draft.floor} maxLength={30} placeholder="Ground floor · Outdoor" onChange={(e) => set({ floor: e.target.value })} />
          <datalist id={ids.floors}>
            {FLOORS.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </div>
      </div>
      <div>
        <label className="ch-lbl mb-[5px]" htmlFor={ids.building}>
          BUILDING
        </label>
        <input id={ids.building} className="ch-inp" list={ids.buildings} value={draft.building} maxLength={60} placeholder="e.g. Main Engineering Block" onChange={(e) => set({ building: e.target.value })} />
        <datalist id={ids.buildings}>
          {buildings.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      </div>
      <div>
        <label className="ch-lbl mb-[5px]" htmlFor={ids.note}>
          WHERE TO HIDE IT · ONLY FOR BIG PLACES
        </label>
        <input id={ids.note} className="ch-inp" value={draft.notes} maxLength={200} placeholder="e.g. behind computer 12 · empty for a normal room" onChange={(e) => set({ notes: e.target.value })} />
      </div>
      <div>
        <label className="ch-lbl mb-[5px]" htmlFor={ids.landmark}>
          LANDMARK
        </label>
        <input id={ids.landmark} className="ch-inp" value={draft.landmark} maxLength={160} placeholder="e.g. next to the main stairs" onChange={(e) => set({ landmark: e.target.value })} />
      </div>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="ch-lbl mb-[5px] p-0">CLUE · ONE PIECE PER MEMBER</legend>
        {draft.pieces.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-[26px] font-display text-base">{roman(i + 1)}</span>
            <input
              className="ch-inp"
              aria-label={`Clue piece ${i + 1}`}
              value={p}
              maxLength={200}
              onChange={(e) => {
                const pieces = [...draft.pieces] as Draft["pieces"];
                pieces[i] = e.target.value;
                set({ pieces });
              }}
            />
          </div>
        ))}
      </fieldset>
      <div>
        <label className="ch-lbl mb-[5px]" htmlFor={ids.hint}>
          HINT · COSTS 1:00
        </label>
        <textarea id={ids.hint} className="ch-inp" rows={2} value={draft.hint} maxLength={300} onChange={(e) => set({ hint: e.target.value })} />
      </div>
      <div>
        <label className="ch-lbl mb-[5px]" htmlFor={ids.rad}>
          FOG LIFTS OVER
        </label>
        <input
          id={ids.rad}
          type="range"
          min={RADIUS.min}
          max={RADIUS.max}
          step={RADIUS.step}
          value={draft.reveal_radius}
          onChange={(e) => set({ reveal_radius: r3(Number(e.target.value)) })}
          className="w-full accent-[#8E1B1B]"
        />
        <div className="flex justify-between text-[13px] text-[#5E3D20]">
          <span>Exact spot</span>
          <span>Whole quarter</span>
        </div>
      </div>
    </>
  );
}

/**
 * The venue image with every pin. Coordinates are stored 0–1 across the image (map_x, map_y); the reveal radius is
 * a fraction of the image width. Click the map to pin the place being edited; drag any pin to move it.
 */
function MapPanel({
  locs,
  map,
  number,
  draft,
  onPin,
  onRadius,
  onSelect,
  say,
  reload,
}: {
  locs: Location[];
  map: VenueMap | null;
  number: Map<string, string>;
  draft: Draft;
  onPin: (id: string | null, x: number, y: number) => Promise<void>;
  onRadius: (r: number) => void;
  onSelect: (id: string) => void;
  say: Say;
  reload: () => Promise<void>;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState<{ id: string | null; x: number; y: number; kind: "pin" | "radius" } | null>(null);
  const [uploading, setUploading] = useState(false);
  const W = map?.width || BLANK.width;
  const H = map?.height || BLANK.height;
  const url = map?.image_path ? getBrowserSupabase().storage.from(BUCKET).getPublicUrl(map.image_path).data.publicUrl : null;

  const toMap = (e: { clientX: number; clientY: number }) => {
    const el = svg.current;
    const m = el?.getScreenCTM();
    if (!el || !m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: Math.min(1, Math.max(0, p.x / W)), y: Math.min(1, Math.max(0, p.y / H)) };
  };

  const upload = async (f: File) => {
    if (!TYPES.includes(f.type) || f.size > MAX_BYTES) return say(adminMessage("UPLOAD"), "wax");
    setUploading(true);
    try {
      const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        const src = URL.createObjectURL(f);
        img.onload = () => {
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
          URL.revokeObjectURL(src);
        };
        img.onerror = () => reject(new Error("bad image"));
        img.src = src;
      });
      const ext = f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg";
      const path = `map-${Date.now()}.${ext}`;
      const storage = getBrowserSupabase().storage.from(BUCKET);
      const up = await storage.upload(path, f, { contentType: f.type, upsert: false, cacheControl: "31536000" });
      if (up.error) throw new AdminError("UPLOAD");
      check(await getBrowserSupabase().from("venue_map").upsert({ id: 1, image_path: path, ...size }).select("id").single());
      if (map?.image_path && map.image_path !== path) await storage.remove([map.image_path]);
      say("Venue map updated. Pins keep their places on the new image.", "moss");
      await reload();
    } catch (e) {
      say(adminMessage(e instanceof AdminError ? e.code : "UPLOAD"), "wax");
    } finally {
      setUploading(false);
    }
  };

  const pins = locs
    .filter((l) => l.map_x !== null && l.map_y !== null)
    .map((l) => ({
      id: l.id,
      n: number.get(l.id) ?? "",
      x: (drag?.kind === "pin" && drag.id === l.id ? drag.x : l.id === draft.id ? (draft.map_x ?? l.map_x!) : l.map_x!) * W,
      y: (drag?.kind === "pin" && drag.id === l.id ? drag.y : l.id === draft.id ? (draft.map_y ?? l.map_y!) : l.map_y!) * H,
      on: l.id === draft.id,
    }));
  // A new place (not saved yet) with a pin in the draft.
  if (!draft.id && draft.map_x !== null && draft.map_y !== null)
    pins.push({ id: "", n: "+", x: draft.map_x * W, y: draft.map_y * H, on: true });
  const sel = pins.find((p) => p.on);
  const r = (drag?.kind === "radius" ? drag.x : draft.reveal_radius) * W;
  const pinScale = W / 800;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
        <h2 className="m-0 font-display text-[26px] font-normal">The venue</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#5E3D20]">{locs.length ? "Click to pin · drag a pin to move it" : "Add a place, then click to pin it"}</span>
          <button type="button" className="ch-brass h-[38px] rounded-[9px] px-3.5 text-sm" disabled={uploading} onClick={() => file.current?.click()}>
            {uploading ? "Uploading…" : url ? "Replace map image" : "Upload map image"}
          </button>
          <input
            ref={file}
            type="file"
            accept={TYPES.join(",")}
            className="hidden"
            aria-label="Venue map image"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
        </div>
      </div>
      <div className="relative overflow-hidden rounded-md shadow-[inset_0_0_0_1px_rgba(42,29,18,.5),0_14px_22px_-14px_rgba(0,0,0,.6)]">
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Venue map with ${pins.length} pinned locations${draft.name ? `; ${draft.name} is selected` : ""}.`}
          className="block h-auto w-full touch-none select-none"
          style={{ cursor: drag ? "grabbing" : "crosshair" }}
          onPointerDown={(e) => {
            if (e.button !== 0 || e.target !== e.currentTarget && !(e.target as Element).hasAttribute("data-ground")) return;
            const p = toMap(e);
            if (p) void onPin(draft.id, p.x, p.y);
          }}
          onPointerMove={(e) => {
            if (!drag) return;
            const p = toMap(e);
            if (!p) return;
            if (drag.kind === "pin") setDrag({ ...drag, x: p.x, y: p.y });
            else if (sel) {
              const dx = p.x * W - sel.x;
              const dy = p.y * H - sel.y;
              const next = Math.min(RADIUS.max, Math.max(RADIUS.min, Math.hypot(dx, dy) / W));
              setDrag({ ...drag, x: next });
            }
          }}
          onPointerUp={() => {
            if (!drag) return;
            if (drag.kind === "pin") void onPin(drag.id, drag.x, drag.y);
            else onRadius(r3(Math.round(drag.x / RADIUS.step) * RADIUS.step));
            setDrag(null);
          }}
          onPointerCancel={() => setDrag(null)}
        >
          <defs>
            <radialGradient id="ch-waxg" cx="35%" cy="30%" r="80%">
              <stop offset="0" stopColor="#D2564A" />
              <stop offset=".5" stopColor="#8E1B1B" />
              <stop offset="1" stopColor="#4E0B0B" />
            </radialGradient>
            <pattern id="ch-grid" width={W / 16} height={W / 16} patternUnits="userSpaceOnUse">
              <path d={`M ${W / 16} 0 L 0 0 0 ${W / 16}`} fill="none" stroke="#6E4A2A" strokeWidth={0.6 * pinScale} opacity=".35" />
            </pattern>
          </defs>
          {url ? (
            <image href={url} x="0" y="0" width={W} height={H} preserveAspectRatio="none" data-ground="" />
          ) : (
            <>
              <rect x="0" y="0" width={W} height={H} fill="#E4D0A2" data-ground="" />
              <rect x="0" y="0" width={W} height={H} fill="url(#ch-grid)" data-ground="" />
              <text x={W / 2} y={H / 2} textAnchor="middle" fontFamily="IM Fell English SC, serif" fontSize={26 * pinScale} fill="#5E3D20" pointerEvents="none">
                Upload the venue map image
              </text>
              <text x={W / 2} y={H / 2 + 30 * pinScale} textAnchor="middle" fontFamily="Spectral, serif" fontSize={15 * pinScale} fill="#5E3D20" pointerEvents="none">
                PNG, JPG or WebP · pins can be placed on this blank chart meanwhile
              </text>
            </>
          )}
          {sel && (
            <>
              <circle cx={sel.x} cy={sel.y} r={r} fill="rgba(142,27,27,.1)" stroke="#8E1B1B" strokeWidth={2 * pinScale} strokeDasharray={`${8 * pinScale} ${5 * pinScale}`} pointerEvents="none" />
              <circle
                cx={sel.x + r}
                cy={sel.y}
                r={7 * pinScale}
                fill="#FFFBEF"
                stroke="#8E1B1B"
                strokeWidth={2 * pinScale}
                style={{ cursor: "ew-resize" }}
                aria-label="Drag to change where the fog lifts"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId);
                  setDrag({ id: draft.id, x: draft.reveal_radius, y: 0, kind: "radius" });
                }}
              />
            </>
          )}
          {pins.map((p) => (
            <g
              key={p.id || "draft"}
              transform={`translate(${p.x} ${p.y}) scale(${(p.on ? 1.35 : 1) * pinScale})`}
              style={{ cursor: "grab" }}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (!p.id) return;
                (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId);
                if (!p.on) onSelect(p.id);
                setDrag({ id: p.id, x: p.x / W, y: p.y / H, kind: "pin" });
              }}
            >
              <title>{(() => {
                const l = locs.find((x) => x.id === p.id);
                return l ? placeLine(l) : draft.name;
              })()}</title>
              <ellipse cx="0" cy="1" rx="7" ry="2.5" fill="#000" opacity=".3" />
              <path d="M0,0 C-6,-9 -12,-15 -12,-24 A12,12 0 1 1 12,-24 C12,-15 6,-9 0,0Z" fill="url(#ch-waxg)" stroke="#3A0808" strokeWidth="1" />
              {p.on && <circle cx="0" cy="-24" r="14.5" fill="none" stroke="#FBE3A0" strokeWidth="2" />}
              <text y="-21" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="10" fontWeight="600" fill="#F7E9C8" pointerEvents="none">
                {p.n}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </>
  );
}
