#!/usr/bin/env python3
"""Prepare the site's fixed imagery.

Two jobs:

1. Speaking photography — crop/fit Frances's real event assets to the landscape
   ratio the speaking cards use, without distorting or cropping her out.

2. Project placeholders — abstract geometric panels for the three enterprise
   products that have no publishable screenshot yet. They are deliberately
   non-representational: no fake UI, no invented product screens. Replace the
   .webp files in public/images/projects/ with real captures when cleared.

    python3 scripts/prepare-images.py
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

REPO = Path(__file__).resolve().parents[1]
SPEAKING_OUT = REPO / "public" / "images" / "speaking"
PROJECT_OUT = REPO / "public" / "images" / "projects"

ASSETS = Path.home() / (
    ".cursor/projects/Users-francesmacbookpro-Library-CloudStorage-GoogleDrive-"
    "francessun-gmail-com-My-Drive-Cursor-and-Code-portfolio/assets"
)
CLASSROOM_PHOTO = ASSETS / "6CD28B59-9271-41DA-9BA9-20D9633BD72D-f1c2b95a-b59a-4a3d-b90c-5c00469f8620.jpg"
CANUX_CARD = ASSETS / "1745305017346-634d6279-2fcf-45c6-b0f8-e9713e376acd.jpg"

# Site surface colour, so placeholder panels sit flush with the page.
SURFACE = (13, 15, 20)
COBALT = (58, 122, 255)
CORAL = (232, 122, 95)
LINE = (58, 66, 84)


def crop_to_ratio(image, ratio, focus_y=0.45):
    """Crop to `ratio` (w/h) around a vertical focus point, keeping full width
    where possible so the subject is never cut out sideways."""
    width, height = image.size
    target_height = int(round(width / ratio))
    if target_height <= height:
        max_top = height - target_height
        top = int(round((height - target_height) * focus_y))
        top = max(0, min(top, max_top))
        return image.crop((0, top, width, top + target_height))

    target_width = int(round(height * ratio))
    left = max(0, (width - target_width) // 2)
    return image.crop((left, 0, left + target_width, height))


def build_speaking_images():
    SPEAKING_OUT.mkdir(parents=True, exist_ok=True)

    # UIUC — real classroom photograph. Frances stands right of centre, so the
    # crop keeps full width and trims from the bottom only.
    photo = Image.open(CLASSROOM_PHOTO).convert("RGB")
    cropped = crop_to_ratio(photo, 16 / 10, focus_y=0.15)
    cropped.save(SPEAKING_OUT / "uiuc-ux-day-2026.jpg", "JPEG", quality=86, optimize=True, progressive=True)
    print(f"  uiuc-ux-day-2026.jpg  {cropped.size}  (source {photo.size})")

    # CanUX — the official square speaker card. Rather than crop the card apart,
    # it is placed whole on a flat dark panel at the landscape ratio.
    card = Image.open(CANUX_CARD).convert("RGB")
    panel_w, panel_h = 1600, 1000
    panel = Image.new("RGB", (panel_w, panel_h), SURFACE)

    card_h = int(panel_h * 0.88)
    card_scaled = card.resize((card_h, card_h), Image.LANCZOS)
    panel.paste(card_scaled, ((panel_w - card_h) // 2, (panel_h - card_h) // 2))
    panel.save(SPEAKING_OUT / "canux-2025.jpg", "JPEG", quality=88, optimize=True, progressive=True)
    print(f"  canux-2025.jpg        {panel.size}  (card {card.size} placed whole)")


def gradient(size, top_color, bottom_color):
    width, height = size
    base = Image.new("RGB", (1, height))
    draw = ImageDraw.Draw(base)
    for y in range(height):
        t = y / max(height - 1, 1)
        draw.point(
            (0, y),
            fill=tuple(int(round(top_color[i] + (bottom_color[i] - top_color[i]) * t)) for i in range(3)),
        )
    return base.resize((width, height), Image.BILINEAR)


def soft_glow(size, center, radius, color, strength):
    """A very low-opacity radial wash. Kept subtle: atmosphere, not glow."""
    layer = Image.new("RGB", size, (0, 0, 0))
    draw = ImageDraw.Draw(layer)
    cx, cy = center
    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=color)
    layer = layer.filter(ImageFilter.GaussianBlur(radius * 0.55))
    return Image.blend(Image.new("RGB", size, (0, 0, 0)), layer, strength)


def placeholder_panel(name, motif):
    """Abstract 16:10 panel. Non-representational by design — these must never
    be mistaken for a real product screen."""
    size = (1280, 800)
    img = gradient(size, (17, 20, 27), (10, 12, 17))

    img = Image.blend(img, soft_glow(size, (980, 210), 460, COBALT, 1.0), 0.16)
    img = Image.blend(img, soft_glow(size, (250, 690), 380, CORAL, 1.0), 0.07)

    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    if motif == "identity":
        # Concentric access rings with offset nodes.
        cx, cy = 640, 400
        for i, r in enumerate((120, 200, 280, 360)):
            draw.ellipse(
                (cx - r, cy - r * 0.62, cx + r, cy + r * 0.62),
                outline=(*LINE, 150 - i * 22),
                width=1,
            )
        for i in range(7):
            angle = math.pi * (0.16 + i * 0.145)
            x = cx + math.cos(angle) * 280
            y = cy + math.sin(angle) * 174
            draw.ellipse((x - 5, y - 5, x + 5, y + 5), fill=(*COBALT, 190))

    elif motif == "ledger":
        # Stacked horizontal rules of varying weight — a ledger's rhythm.
        top = 150
        for row in range(14):
            y = top + row * 36
            length = 420 + ((row * 137) % 460)
            draw.line((150, y, 150 + length, y), fill=(*LINE, 165 - row * 6), width=1)
            if row % 4 == 1:
                draw.rectangle((150, y - 11, 150 + 74, y - 3), fill=(*COBALT, 120))
        draw.line((150, 132, 1130, 132), fill=(*COBALT, 150), width=2)

    elif motif == "pipeline":
        # Parallel tracks converging — flighting and handoffs.
        for lane in range(6):
            y = 200 + lane * 78
            draw.line((130, y, 700, y), fill=(*LINE, 160 - lane * 12), width=1)
            draw.line((700, y, 1090, 400 + (lane - 2.5) * 22), fill=(*LINE, 130 - lane * 10), width=1)
            draw.rectangle(
                (130 + lane * 44, y - 6, 130 + lane * 44 + 110, y + 6),
                fill=(*COBALT, 110 - lane * 10),
            )
        draw.ellipse((1064, 374, 1116, 426), outline=(*CORAL, 150), width=2)

    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")

    # Thin inner border, consistent with the site's hairline treatment.
    border = ImageDraw.Draw(img)
    border.rectangle((0, 0, size[0] - 1, size[1] - 1), outline=(31, 36, 47), width=1)

    PROJECT_OUT.mkdir(parents=True, exist_ok=True)
    out = PROJECT_OUT / f"{name}.webp"
    img.save(out, "WEBP", quality=84, method=6)
    print(f"  {out.name:<28} {size}  {out.stat().st_size // 1024}KB  (abstract placeholder)")


def main():
    print("Speaking photography (real assets):")
    build_speaking_images()
    print("\nProject placeholders (abstract, not product screens):")
    placeholder_panel("atlas", "identity")
    placeholder_panel("simba", "ledger")
    placeholder_panel("linear", "pipeline")
    print("\nRate Card Manager uses a real capture — run: npm run capture:ratecard")


if __name__ == "__main__":
    main()
