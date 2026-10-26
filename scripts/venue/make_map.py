# T-601 (D-034): turns the Google Maps screenshot of the campus into the hunt's parchment map.
# Crops off the Google interface, paints over the place labels (no building names on the hunt map),
# then inks it in sepia on parchment with a soft burnt edge. Needs Pillow:
#   python3 -m venv /tmp/v && /tmp/v/bin/pip install pillow && /tmp/v/bin/python scripts/venue/make_map.py SRC OUT
import sys
from PIL import Image, ImageFilter, ImageOps, ImageDraw, ImageChops

src, out = sys.argv[1], sys.argv[2]
img = Image.open(src).convert("RGB")
W, H = img.size  # the 3276 × 1892 screenshot, shown to the user at 2000 × 1155
s = W / 2000

# Place labels and pins, in 2000-wide screen coordinates (x0, y0, x1, y1).
LABELS = [
    (115, 168, 310, 216),   # Janasena enclave (first: the label above borrows from here)
    (55, 100, 215, 155),    # Kidzee School
    (1075, 178, 1260, 224), # SVIT Girls Hostel
    (820, 458, 1010, 556),  # Sai Vidya Institute of Technology
    (1308, 728, 1485, 776), # the MBA Block's Google label
    (313, 744, 457, 782),   # Sukhi Nilaya
    (270, 822, 475, 864),   # RPRT SoftwareTech
    (700, 828, 870, 870),   # Svit Boys hostel
    (1812, 836, 2000, 876), # The daffodils appeal
    (1715, 10, 1890, 62),   # Sri Veerabhadra Swamy Nilaya
]
for x0, y0, x1, y1 in LABELS:
    # Cover the label with real ground from just beside it (above, or below near the top edge), feathered in.
    x0, y0, x1, y1 = (int(v * s) for v in (x0, y0, x1, y1))
    w, h = x1 - x0, y1 - y0
    pad = int(10 * s)
    # Borrow from above or below, whichever side holds no other label and isn't the Google bar above the crop.
    def clear(top):
        return top >= 90 * s and not any(
            top < by1 * s and top + h > by0 * s and x0 < bx1 * s and x1 > bx0 * s for bx0, by0, bx1, by1 in LABELS
        )
    sy = y0 - h - pad if clear(y0 - h - pad) else y1 + pad
    source = img.crop((x0 - pad, sy - pad, x1 + pad, sy + h + pad))
    mask = Image.new("L", source.size, 0)
    ImageDraw.Draw(mask).rectangle((pad, pad, source.width - pad, source.height - pad), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(pad * 0.6))
    img.paste(source, (x0 - pad, y0 - pad), mask)

# Crop: below the search bar and chips, above the zoom buttons, layers button and footer.
img = img.crop((0, int(80 * s), W, int(960 * s)))

# Ink on parchment: luminance mapped from iron-gall ink to aged paper, a touch of contrast, then a burnt edge.
gray = ImageOps.autocontrast(ImageOps.grayscale(img), cutoff=1)
ink = ImageOps.colorize(gray, black="#2A1D12", white="#F3E7C6", mid="#B08A58")
paper = Image.new("RGB", ink.size, "#E4D0A2")
mapped = Image.blend(ink, paper, 0.18)
w, h = mapped.size
vignette = Image.new("L", (w, h), 0)
ImageDraw.Draw(vignette).rectangle((int(w * 0.04), int(h * 0.06), int(w * 0.96), int(h * 0.94)), fill=255)
vignette = vignette.filter(ImageFilter.GaussianBlur(int(min(w, h) * 0.06)))
edge = Image.new("RGB", (w, h), "#6E4A2A")
mapped = Image.composite(mapped, ImageChops.multiply(mapped, edge.point(lambda v: min(255, v + 60))), vignette)
mapped = mapped.resize((1800, round(1800 * h / w)), Image.LANCZOS)
mapped.save(out, "JPEG", quality=80, optimize=True, progressive=True)
print(out, mapped.size)
