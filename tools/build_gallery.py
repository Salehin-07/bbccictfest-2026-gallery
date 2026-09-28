"""Build the web-ready fest gallery from camera originals.

Pipeline (idempotent — safe to re-run; up-to-date outputs are skipped):
  images/gallery/<original>.jpg   (camera masters, ~13MB — never served)
      -> images/gallery/web/<same>.jpg     (max 1600px, q68 — lightbox)
      -> images/gallery/thumbs/<same>.jpg  (640px wide, q62 — grid + banner)
  Plus: regenerates the `photos` array in assets/js/gallery-data.js,
  assigning each photo to a segment by its position in the shoot order.

Usage:
    python3 tools/build_gallery.py            # everything
    python3 tools/build_gallery.py 0 150      # only masters 0..150 (chunking)
    python3 tools/build_gallery.py --data-only   # rewrite gallery-data.js only

Requires: Pillow  (pip install Pillow)
"""

import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "images" / "gallery"
WEB_DIR = SRC_DIR / "web"
THUMB_DIR = SRC_DIR / "thumbs"
DATA_FILE = ROOT / "assets" / "js" / "gallery-data.js"

WEB_MAX = 1600
WEB_QUALITY = 68
THUMB_WIDTH = 640
THUMB_QUALITY = 62
EXTS = {".jpg", ".jpeg", ".png", ".webp"}
WORKERS = 8

# (first_index, last_index, category, caption_label) over the sorted masters.
# Mapped by sampling ~25 photos across the shoot: opening block, morning
# contests (quiz/chess), stage ceremony with guests, crest awards, closing.
SEGMENTS = [
    (0, 8, "Opening Ceremony", "Opening moments"),
    (9, 270, "Competitions", "Contests in full swing"),
    (271, 390, "Guests", "Guests on stage"),
    (391, 452, "Winners", "Crest moments"),
    (453, 460, "Moments", "Fest diaries"),
]

CATEGORY_LABELS = {
    "Opening Ceremony": "Opening moments",
    "Competitions": "Contests in full swing",
    "Winners": "Crest moments",
    "Closing Ceremony": "Closing ceremony",
    "Guests": "Guests on stage",
    "Moments": "Fest diaries",
}

# Explicit recategorizations (master filename -> final category),
# curation pass 2: crest/group shots into the opening, stage block split
# into competitions + closing ceremony (no Guests section), first contest
# block into the opening, Fest Diaries dissolved.
# curation pass 3: crest 01/02 belong to the closing ceremony; the
# "Ceremony" segment is renamed to "Opening Ceremony".
OVERRIDES = {
    "_DSC6502.jpg": "Closing Ceremony",
    "_DSC6505.jpg": "Closing Ceremony",
    "_DSC6496.jpg": "Opening Ceremony",
    "_DSC6497.jpg": "Opening Ceremony",
    "_DSC6617.jpg": "Opening Ceremony",
    "_DSC6618.jpg": "Opening Ceremony",
    "_DSC6273.jpg": "Competitions",
    "_DSC6279.jpg": "Competitions",
    "_DSC6294.jpg": "Competitions",
    "_DSC6296.jpg": "Competitions",
    "_DSC6297.jpg": "Competitions",
    "_DSC6298.jpg": "Competitions",
    "_DSC6299.jpg": "Competitions",
    "_DSC6300.jpg": "Competitions",
    "_DSC6303.jpg": "Competitions",
    "_DSC6305.jpg": "Competitions",
    "_DSC6306.jpg": "Competitions",
    "_DSC6307.jpg": "Competitions",
    "_DSC6313.jpg": "Competitions",
    "_DSC6316.jpg": "Competitions",
    "_DSC6317.jpg": "Competitions",
    "_DSC6318.jpg": "Competitions",
    "_DSC6319.jpg": "Competitions",
    "_DSC6343.jpg": "Competitions",
    "_DSC6344.jpg": "Competitions",
    "_DSC6345.jpg": "Competitions",
    "_DSC6350.jpg": "Competitions",
    "_DSC6358.jpg": "Competitions",
    "_DSC6361.jpg": "Competitions",
    "_DSC6367.jpg": "Competitions",
    "_DSC6380.jpg": "Competitions",
    "_DSC5810.jpg": "Opening Ceremony",
    "_DSC5811.jpg": "Opening Ceremony",
    "_DSC5813.jpg": "Opening Ceremony",
    "_DSC5814.jpg": "Opening Ceremony",
    "_DSC5815.jpg": "Opening Ceremony",
    "_DSC5816.jpg": "Opening Ceremony",
    "_DSC5817.jpg": "Opening Ceremony",
    "_DSC5818.jpg": "Opening Ceremony",
    "_DSC5819.jpg": "Opening Ceremony",
    "_DSC5820.jpg": "Opening Ceremony",
    "_DSC5821.jpg": "Opening Ceremony",
    "_DSC5822.jpg": "Opening Ceremony",
    "_DSC5823.jpg": "Opening Ceremony",
    "_DSC5825.jpg": "Opening Ceremony",
    "_DSC5826.jpg": "Opening Ceremony",
    "_DSC5828.jpg": "Opening Ceremony",
    "_DSC5829.jpg": "Opening Ceremony",
    "_DSC5830.jpg": "Opening Ceremony",
    "_DSC5831.jpg": "Opening Ceremony",
    "_DSC5832.jpg": "Opening Ceremony",
    "_DSC5833.jpg": "Opening Ceremony",
    "_DSC5835.jpg": "Opening Ceremony",
    "_DSC5838.jpg": "Opening Ceremony",
    "_DSC5842.jpg": "Opening Ceremony",
    "_DSC5843.jpg": "Opening Ceremony",
    "_DSC5846.jpg": "Opening Ceremony",
    "_DSC5848.jpg": "Opening Ceremony",
    "_DSC5850.jpg": "Opening Ceremony",
    "_DSC5851.jpg": "Opening Ceremony",
    "_DSC5852.jpg": "Opening Ceremony",
    "_DSC5855.jpg": "Opening Ceremony",
    "_DSC5857.jpg": "Opening Ceremony",
    "_DSC5859.jpg": "Opening Ceremony",
    "_DSC5860.jpg": "Opening Ceremony",
    "_DSC5862.jpg": "Opening Ceremony",
    "_DSC5864.jpg": "Opening Ceremony",
    "_DSC5865.jpg": "Opening Ceremony",
    "_DSC5866.jpg": "Opening Ceremony",
    "_DSC5870.jpg": "Opening Ceremony",
    "_DSC5875.jpg": "Opening Ceremony",
    "_DSC5877.jpg": "Opening Ceremony",
    "_DSC5878.jpg": "Opening Ceremony",
    "_DSC5880.jpg": "Opening Ceremony",
    "_DSC5881.jpg": "Opening Ceremony",
    "_DSC5883.jpg": "Opening Ceremony",
}


def final_category(i, src):
    """Category after curation. Guests section is dissolved: leftovers
    become Closing Ceremony."""
    if src.name in OVERRIDES:
        return OVERRIDES[src.name]
    cat, _ = segment_of(i)
    if cat == "Guests":
        return "Closing Ceremony"
    return cat

FEATURED = {
    "file": "_DSC6622.jpg",
    "tag": "The BBCC Family",
    "alt": "The BBCC family — organizers, guests and volunteers of the 1st ICT Fest",
    "caption": "The BBCC Family — organizers, guests & volunteers, 1st ICT Fest",
}

# Master filenames hidden from the website (curated out by the organizers).
# Shoot-order caption numbers stay stable: remaining photos keep their
# original numbers, so "Crest moments · 05" still means the same photo.
REMOVED = {
    "_DSC5809.jpg",
    "_DSC5903.jpg",
    "_DSC5913.jpg",
    "_DSC5914.jpg",
    "_DSC5921.jpg",
    "_DSC6004.jpg",
    "_DSC6005.jpg",
    "_DSC6008.jpg",
    "_DSC6010.jpg",
    "_DSC6011.jpg",
    "_DSC6012.jpg",
    "_DSC6013.jpg",
    "_DSC6014.jpg",
    "_DSC6015.jpg",
    "_DSC6017.jpg",
    "_DSC6018.jpg",
    "_DSC6020.jpg",
    "_DSC6022.jpg",
    "_DSC6023.jpg",
    "_DSC6026.jpg",
    "_DSC6027.jpg",
    "_DSC6031.jpg",
    "_DSC6035.jpg",
    "_DSC6053.jpg",
    "_DSC6054.jpg",
    "_DSC6056.jpg",
    "_DSC6057.jpg",
    "_DSC6064.jpg",
    "_DSC6105.jpg",
    "_DSC6106.jpg",
    "_DSC6159.jpg",
    "_DSC6160.jpg",
    "_DSC6161.jpg",
    "_DSC6162.jpg",
    "_DSC6163.jpg",
    "_DSC6165.jpg",
    "_DSC6166.jpg",
    "_DSC6167.jpg",
    "_DSC6169.jpg",
    "_DSC6172.jpg",
    "_DSC6173.jpg",
    "_DSC6175.jpg",
    "_DSC6177.jpg",
    "_DSC6183.jpg",
    "_DSC6184.jpg",
    "_DSC6187.jpg",
    "_DSC6188.jpg",
    "_DSC6222.jpg",
    "_DSC6224.jpg",
    "_DSC6226.jpg",
    "_DSC6227.jpg",
    "_DSC6228.jpg",
    "_DSC6229.jpg",
    "_DSC6230.jpg",
    "_DSC6232.jpg",
    "_DSC6234.jpg",
    "_DSC6236.jpg",
    "_DSC6240.jpg",
    "_DSC6245.jpg",
    "_DSC6246.jpg",
    "_DSC6248.jpg",
    "_DSC6251.jpg",
    "_DSC6261.jpg",
    "_DSC6282.jpg",
    "_DSC6284.jpg",
    "_DSC6285.jpg",
    "_DSC6286.jpg",
    "_DSC6287.jpg",
    "_DSC6288.jpg",
    "_DSC6289.jpg",
    "_DSC6292.jpg",
    "_DSC6309.jpg",
    "_DSC6310.jpg",
    "_DSC6311.jpg",
    "_DSC6324.jpg",
    "_DSC6328.jpg",
    "_DSC6329.jpg",
    "_DSC6330.jpg",
    "_DSC6331.jpg",
    "_DSC6336.jpg",
    "_DSC6337.jpg",
    "_DSC6339.jpg",
    "_DSC6346.jpg",
    "_DSC6348.jpg",
    "_DSC6353.jpg",
    "_DSC6354.jpg",
    "_DSC6355.jpg",
    "_DSC6363.jpg",
    "_DSC6364.jpg",
    "_DSC6369.jpg",
    "_DSC6370.jpg",
    "_DSC6372.jpg",
    "_DSC6373.jpg",
    "_DSC6377.jpg",
    "_DSC6381.jpg",
    "_DSC6382.jpg",
    "_DSC6383.jpg",
    "_DSC6384.jpg",
    "_DSC6386.jpg",
    "_DSC6388.jpg",
    "_DSC6389.jpg",
    "_DSC6461.jpg",
    "_DSC6463.jpg",
    "_DSC6488.jpg",
    "_DSC6490.jpg",
    "_DSC6492.jpg",
    "_DSC6493.jpg",
    "_DSC6495.jpg",
    "_DSC6499.jpg",
    "_DSC6501.jpg",
    "_DSC6503.jpg",
    "_DSC6507.jpg",
    "_DSC6555.jpg",
    "_DSC6564.jpg",
    "_DSC6619.jpg",
    "_DSC6631.jpg",
    "_DSC6632.jpg",
    "_DSC6615.jpg",
    "_DSC6625.jpg",
    "_DSC6627.jpg",
    "_DSC6628.jpg",
    "_DSC6630.jpg",
}


def masters():
    return sorted(
        p for p in SRC_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in EXTS
    )


def segment_of(i):
    for lo, hi, cat, label in SEGMENTS:
        if lo <= i <= hi:
            return cat, label
    return "Moments", "Fest diaries"


def convert(src: Path, dest: Path, max_w: int, quality: int) -> bool:
    """Return True if (re)built, False if skipped as up to date."""
    if dest.exists() and dest.stat().st_mtime >= src.stat().st_mtime:
        return False
    from PIL import Image, ImageOps
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        if im.width > max_w:
            im = im.resize(
                (max_w, round(im.height * max_w / im.width)), Image.LANCZOS
            )
        dest.parent.mkdir(parents=True, exist_ok=True)
        im.save(dest, "JPEG", quality=quality, optimize=True, progressive=True)
    try:
        import os
        os.utime(dest, (src.stat().st_atime, src.stat().st_mtime))
    except OSError:
        pass
    return True


def build_images(items):
    from PIL import Image  # noqa: F401  (fail fast if Pillow missing)
    made = {"web": 0, "thumb": 0}
    skipped = {"web": 0, "thumb": 0}

    def job(args):
        src, kind = args
        if kind == "web":
            dest = WEB_DIR / (src.stem + ".jpg")
            return ("web", convert(src, dest, WEB_MAX, WEB_QUALITY))
        dest = THUMB_DIR / (src.stem + ".jpg")
        return ("thumb", convert(src, dest, THUMB_WIDTH, THUMB_QUALITY))

    jobs = [(s, k) for s in items for k in ("web", "thumb")]
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for kind, built in pool.map(job, jobs):
            if built:
                made[kind] += 1
            else:
                skipped[kind] += 1
    print(f"web:    {made['web']} built, {skipped['web']} skipped")
    print(f"thumbs: {made['thumb']} built, {skipped['thumb']} skipped")


HEADER = """/* Fest gallery data — GENERATED FILE. Do not edit by hand.
   Regenerate with:  python3 tools/build_gallery.py --data-only
   (photo processing: python3 tools/build_gallery.py)

   Workflow that produced this file:
   1. Camera originals live in  images/gallery/  (never served to browsers).
   2. The build script writes web-sized copies to  images/gallery/web/
      (max 1600px, ~200KB) and grid thumbnails to  images/gallery/thumbs/
      (640px, ~40KB).
    3. Each photo lands in a final segment (curation in OVERRIDES):
         Opening (Opening Ceremony) -> Contests (Competitions)
         -> Winners (crests) -> Closing Ceremony. The Guests section
         is dissolved and Fest Diaries removed; entries carry
         { src, thumb, alt, category, caption }, numbered 01..N
         inside their final segment.
    4. `featured` is the large BBCC family banner above the segments
       (full-size original on click).

   PERFORMANCE NOTES:
   - The grid loads thumbnails only and appends 24 cards at a time
     via infinite scroll, so the full set never sits in the DOM at
     once. Native lazy-loading + content-visibility keep scrolling
     smooth. Each card and the lightbox link to the full-size `src`
     file via a download button.
   - The featured banner is eager (page's main visual); the lightbox
     preloads only the previous/next full photo.
*/

"""

def write_data(all_masters):
    # Skip hidden + featured photos. Survivors are numbered 01..N inside
    # their FINAL category (shoot order), so captions stay tidy after
    # curation moves.
    skip = set(REMOVED) | {FEATURED["file"]}
    counters = {}
    lines = []
    for i, s in enumerate(all_masters):
        if s.name in skip:
            continue
        cat = final_category(i, s)
        counters[cat] = counters.get(cat, 0) + 1
        n = counters[cat]
        label = CATEGORY_LABELS[cat]
        base = s.stem + ".jpg"
        alt = f"{label} — 1st BBCC ICT Fest gallery photo {n:02d}"
        cap = f"{label} · {n:02d}"
        lines.append(
            f'    {{ src: "images/gallery/web/{base}", '
            f'thumb: "images/gallery/thumbs/{base}", '
            f'alt: "{alt}", category: "{cat}", caption: "{cap}" }},'
        )
    f = FEATURED
    out = [
        HEADER + "window.GALLERY_DATA = {",
        "  featured: {",
        # The family banner is special: the banner shows the 1600px
        # web copy (indistinguishable on screen), while a click opens
        # the full-size camera original.
        f'    src: "images/gallery/{f["file"]}",',
        f'    thumb: "images/gallery/web/{f["file"]}",',
        f'    tag: "{f["tag"]}",',
        f'    alt: "{f["alt"]}",',
        f'    caption: "{f["caption"]}"',
        "  },",
        "  photos: [",
        *lines,
        "  ],",
        "};",
        "",
    ]
    DATA_FILE.write_text("\n".join(out), encoding="utf-8")
    print(f"gallery-data.js: {len(lines)} entries + featured ({f['file']})")


def prune_removed():
    """Delete web/thumb derivatives of REMOVED photos to keep the site lean."""
    n = 0
    for name in REMOVED:
        stem = Path(name).stem + ".jpg"
        for dest in (WEB_DIR / stem, THUMB_DIR / stem):
            if dest.exists():
                dest.unlink()
                n += 1
    print(f"pruned {n} derivatives of removed photos")


def main(argv):
    all_masters = masters()
    print(f"masters: {len(all_masters)}")
    if "--data-only" in argv:
        write_data(all_masters)
        return 0
    lo, hi = 0, len(all_masters)
    nums = [a for a in argv[1:] if not a.startswith("-")]
    if len(nums) >= 2:
        lo, hi = int(nums[0]), int(nums[1])
    build_images([m for m in all_masters[lo:hi] if m.name not in REMOVED])
    if lo == 0 and hi >= len(all_masters):
        prune_removed()
        write_data(all_masters)
    else:
        print("(chunk run — gallery-data.js left untouched)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
