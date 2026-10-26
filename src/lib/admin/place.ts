// D-043: one way to name a place everywhere in the admin panel and on the cut-off stub of its printed card.

export type PlaceDetails = {
  name: string;
  place_no: number | null;
  building: string | null;
  floor: string | null;
  landmark: string | null;
  notes: string | null;
};

/** "#07", or null for a place without a number. */
export const placeTag = (n: number | null | undefined) => (n == null ? null : `#${String(n).padStart(2, "0")}`);

/** "#12 · Main Engineering Block · Ground floor · Library — magazine rack", skipping what isn't filled in. */
export const placeLine = (p: Pick<PlaceDetails, "name" | "place_no" | "building" | "floor">) =>
  [placeTag(p.place_no), p.building?.trim(), p.floor?.trim(), p.name.trim()].filter(Boolean).join(" · ");
