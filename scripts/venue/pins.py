# Approximate pins for the 59 places on docs/venue/campus-map.jpg (T-601), read off the satellite overview
# (2000-wide screen coordinates, before the map's crop of y 80–960). Buildings are placed where the screenshot
# shows them; rooms inside the main block are spread in a grid over its west wing so the editor's pins don't
# stack. The fog only ever lifts over a region, so a pin a few metres off still works. The captain drags any pin
# to its exact spot in Locations & map. Writes supabase/migrations/0023_venue_map.sql's pin list to stdout.
import re

rows = [[c.strip() for c in l.split("|")[1:-1]] for l in open("docs/venue/locations.md", encoding="utf-8") if re.match(r"^\| \d+ \|", l)]
CROP_Y, CROP_H, W = 80, 880, 2000


def norm(x, y):
    return round(x / W, 3), round((y - CROP_Y) / CROP_H, 3)


SPOTS = {
    "MBA Block": [(1245, 610), (1245, 665), (1245, 720)],
    "Canteen": [(1300, 560), (1325, 575), (1300, 590), (1325, 605)],
    "SVIT Cafe": [(1272, 413)],
    "Park": [(1135, 680)],
    "Basketball Court": [(1185, 805), (1220, 805)],
    "Main Ground": [(1045, 380), (1100, 430), (1155, 480)],
    "Girls' Hostel": [(1240, 235)],
    "Boys' Hostel": [(745, 850)],
}
used = {k: 0 for k in SPOTS}
main = 0
out = []
for no, building, floor, place, *_ in rows:
    if building == "Main Engineering Block":
        col, row = divmod(main, 15)  # three columns of 15 over the west wing
        x, y, r = 965 + col * 45, 590 + row * 19.5, 0.06
        main += 1
    else:
        x, y = SPOTS[building][used[building]]
        used[building] += 1
        r = 0.08 if building in ("Main Ground",) else 0.05
    nx, ny = norm(x, y)
    out.append(f"({no}, '{building.replace(chr(39), chr(39) * 2)}', {nx}, {ny}, {r})")
print(",\n".join(out))
