# 1st BBCC ICT Fest — Official Gallery

Static site for the **1st BBCC ICT Fest** (19 September 2026, Bindubasini Boys' School, Tangail), organized by **Bindubasini Boys' Computer Club**. Now serves as the official photo gallery + archive.

Live: <https://bbccictfest.pro.bd/>

## Pages

| Page | File | Description |
| --- | --- | --- |
| Gallery (home) | `index.html` | Filterable photo grid, lightbox with downloads, infinite scroll |
| Committee | `committee.html` | 16-member Executive Committee |
| Arcade | `games/` | Free browser games (Snake, Tetris, Doom, Pokémon collection, …) |
| 404 | `404.html` | Themed not-found page (`noindex`) |

## Project structure

```text
index.html / committee.html / 404.html
assets/css/site.css          # single shared stylesheet
assets/js/gallery-data.js    # GENERATED — photo list (do not edit by hand)
assets/js/gallery.js         # filters + infinite grid + lightbox + downloads
assets/js/site.js            # mobile nav + footer year
images/gallery/              # camera masters (local only, git-ignored, ~5GB)
images/gallery/web/          # 1600px lightbox/download files (committed)
images/gallery/thumbs/       # 640px grid thumbnails (committed)
images/members/              # committee portraits (16 files)
tools/build_gallery.py       # image pipeline + gallery-data.js generator
sitemap.xml / robots.txt / llms.txt
```

## Gallery workflow

Camera originals live only on the maintainer's machine in `images/gallery/` and are **never committed** (see `.gitignore`).

```bash
pip install Pillow
python3 tools/build_gallery.py --data-only   # regenerate assets/js/gallery-data.js only
python3 tools/build_gallery.py               # full run: web/ + thumbs/ + data
python3 tools/build_gallery.py 0 150         # chunked image processing
```

Curation lives in `tools/build_gallery.py`:

- `SEGMENTS` — shoot-order ranges; `Guests` leftovers dissolve into `Closing Ceremony`
- `OVERRIDES` — per-file recategorization (e.g. crest 01/02 → Closing Ceremony)
- `REMOVED` — curated-out masters (derivatives pruned on full runs)
- `CATEGORY_LABELS` — caption/alt text per segment (`Opening Ceremony`, `Competitions`, `Winners`, `Closing Ceremony`)

Grid behavior (`assets/js/gallery.js`): 24 cards per batch via `IntersectionObserver` infinite scroll (scroll fallback), native lazy-loading, per-card + lightbox full-size (`web/`) downloads via the `download` attribute.

## Local preview

Any static server works:

```bash
python3 -m http.server 8000
# → http://localhost:8000/
```

## SEO

- Canonical URLs, `robots.txt` + `sitemap.xml`, semantic HTML with one `h1` per page
- Open Graph (`og:image` 1617×1292 + alt/dimensions) + Twitter summary cards on all pages
- JSON-LD: `Event` on home, `AboutPage` on committee
- `llms.txt` agent summary; descriptive `alt` text on every photo

## Credits

Organized by Bindubasini Boys' Computer Club — contact `club.bbcc@gmail.com`. Site by [Md Abu Salehin](https://mdsalehin.netlify.app/).
