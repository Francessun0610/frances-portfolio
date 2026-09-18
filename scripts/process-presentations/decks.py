"""Deck registry shared by the processing and verification scripts.

`slug` determines both the public output directory (public/slides/<slug>/) and
the speaking route (/speaking/<slug>), so the two always stay in sync.
"""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = REPO_ROOT / "content" / "speaking" / "source"
OUTPUT_ROOT = REPO_ROOT / "public" / "slides"

DECKS = [
    {
        "slug": "canux-2025",
        "source": "canux-2025.pptx",
        "label": "CanUX 2025 — Infusing Enterprise Creativity with a Dose of Playfulness",
    },
    {
        "slug": "uiuc-ux-day-2026",
        "source": "uiuc-ux-day-2026.pptx",
        "label": "UX Day 2026 — What Enterprise UX Taught Me About Clarity",
    },
    {
        "slug": "ddd-europe-2026",
        "source": "ddd-europe-2026.pptx",
        "label": "DDD Europe 2026 — When the Domain Is Fuzzy, the UI Pays the Price",
    },
]

# Full-size slide export. 1440x810 is a 16:9 frame that stays sharp on a 2x
# display at the viewer's ~1100px max width without bloating page weight.
FULL_WIDTH = 1440
FULL_HEIGHT = 810
FULL_QUALITY = 82

# Thumbnail rail images.
THUMB_WIDTH = 320
THUMB_HEIGHT = 180
THUMB_QUALITY = 65


def deck_by_slug(slug):
    for deck in DECKS:
        if deck["slug"] == slug:
            return deck
    raise KeyError(f"Unknown deck slug: {slug}")
