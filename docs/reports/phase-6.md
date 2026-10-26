# Phase 6 · Treasure map & 3D assets — report

Date: 2026-10-26 · Status: **COMPLETED** (chest renders await the user's approval) · Plan: [IMPLEMENTATION_PLAN.md › P6](../IMPLEMENTATION_PLAN.md#p6--treasure-map--3d-assets)

Phones now show the real campus as an inked treasure map under fog. The fog lifts over each round's search area and stays lifted. The winners get the realistic treasure chest from Blender: its lid opens, god rays rise and gold coins spill out.

## Tasks

| ID | Task | Result |
|---|---|---|
| T-601 | Parchment map | `scripts/venue/make_map.py` turns the satellite overview into [venue/campus-map.jpg](../venue/campus-map.jpg) (1800 × 792, 226 KB). It crops off the Google interface, paints over every place label (the hunt map names no buildings) and inks the image in sepia on parchment with a burnt edge. The image is uploaded to the `venue` bucket on test and production and set as the venue map (migration 0023). The 59 places have approximate pins (`scripts/venue/pins.py`); the captain drags any pin to its exact spot. `src/components/map/TreasureMap.tsx` draws it on Seek; the admin map editor already shows the same image. |
| T-602 | Fog of war | `my_status` also sends `visited`, the earlier rounds' regions with the same offset as when they were live, and `map`. The fog stays lifted over them, marked ✗ I, II … with a dotted trail to the current region. The current region burns open and the compass needle swings. Exact pins never reach phones (checked). |
| T-603 | Blender chest + props | Built in Blender 5.2 through the MCP: a walnut chest with planks, iron bands, studs, a brass lock plate and keyhole, side handles, an animated lid hinged at the back, and a heap of gold coins inside. Props: a brass compass, a tied scroll and a lit lantern. The wood is baked to colour and normal maps (WebP in the GLB). `public/models/chest.glb` is **883 KB** (limit 1.5 MB). Source: [design/blender/chest.blend](../design/blender/chest.blend). Renders for approval: [closed](../design/renders/chest-closed.png), [open](../design/renders/chest-open.png). |
| T-604 | Chest finale | `src/components/three/ChestFinale.tsx` (three 0.186.1 + @react-three/fiber 9.8.1, loaded only on the Victory screen). The lid opens, light swells inside, additive god rays fade in, and 46 instanced coins burst out and bounce. A generated room environment lights the metal. It stops drawing once settled. Reduced motion or no WebGL shows the still render (`public/models/chest-open.webp`, 18 KB). CSP: `connect-src` gains `blob:` for the model's embedded textures. |
| T-605 | Motion | Round change: the scroll rolls up on the sealed round and unrolls the next ("the final round" for the last). Prank: gold flakes fall, the FOOLED! stamp lands, the torn parchment slides in. Eliminated: the map chars in from the edges. The Game over pop-up unrolls. All CSS, so the reduced-motion rule turns them off and the words stay. |

## Evidence

| Check | Result |
|---|---|
| Unit + component tests | **194 passed** (new: map fog regions, ✗ marks and image URL; placeholder without an image; round transition; chest fallback; CSP) |
| Live database tests | **map.test.ts** passes: map path sent, no region before the clue is complete, round 1's region kept as visited in round 2, no pin, place number or hiding note in `my_status` |
| Player + admin browser E2E | Both **passed**, with no CSP violations |
| Finale frame rate | **60 fps** in Chromium on the Mac's GPU with the CPU slowed 4×. With software rendering (SwiftShader) it reaches 16–18 fps, which is limited by pixel fill, not by our code. Real phones are checked in T-804. |
| Bundle | `/play` first load 225 kB (was 222 kB); the 3D code loads only on the Victory screen |
| Production | Migration 0023 applied: venue map set, 59 places pinned; `campus-map.jpg` is in the `venue` bucket |

## For the user

- **Approve the chest:** look at [chest-closed.png](../design/renders/chest-closed.png) and [chest-open.png](../design/renders/chest-open.png). Say what to change (colours, coins, props) and it is re-rendered from `chest.blend`.
- **Check the pins:** open Locations & map. Every place has an approximate pin; drag any that are off. The fog only shows a region, so small errors don't matter much.
