#!/usr/bin/env python3
"""Generate favicons, touch icons and the Open Graph card.

All output is typographic and uses the site's own palette — no stock imagery,
no invented screenshots.

    python3 scripts/generate-brand-assets.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parents[1]
PUBLIC = REPO / "public"
OG_DIR = PUBLIC / "images" / "og"

BG = (11, 13, 18)
TEXT = (242, 239, 233)
SECONDARY = (163, 171, 186)
TERTIARY = (124, 132, 148)
COBALT = (61, 123, 255)
CORAL = (232, 120, 95)

SYSTEM_FONT = "/System/Library/Fonts/SFNS.ttf"
FALLBACKS = {
    "bold": "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "regular": "/System/Library/Fonts/Supplemental/Arial.ttf",
}


def load_font(size, weight="regular"):
    """Prefer the system variable font, at the requested named weight."""
    try:
        font = ImageFont.truetype(SYSTEM_FONT, size)
        try:
            font.set_variation_by_name("Semibold" if weight == "bold" else "Regular")
        except Exception:
            pass
        return font
    except Exception:
        return ImageFont.truetype(FALLBACKS[weight], size)


def rounded_monogram(size, radius_ratio=0.22, stroke=True):
    scale = 4
    big = size * scale
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    radius = int(big * radius_ratio)

    draw.rounded_rectangle((0, 0, big - 1, big - 1), radius=radius, fill=(*BG, 255))
    if stroke:
        draw.rounded_rectangle(
            (scale, scale, big - 1 - scale, big - 1 - scale),
            radius=radius - scale,
            outline=(*COBALT, 130),
            width=max(2, scale),
        )

    font = load_font(int(big * 0.40), "bold")
    text = "FS"
    box = draw.textbbox((0, 0), text, font=font)
    draw.text(
        ((big - (box[2] - box[0])) / 2 - box[0], (big - (box[3] - box[1])) / 2 - box[1]),
        text,
        font=font,
        fill=(*TEXT, 255),
    )

    return image.resize((size, size), Image.LANCZOS)


def build_icons():
    apple = rounded_monogram(180)
    Image.alpha_composite(Image.new("RGBA", apple.size, (*BG, 255)), apple).convert("RGB").save(
        PUBLIC / "apple-touch-icon.png", "PNG", optimize=True
    )
    print("  apple-touch-icon.png  180x180")

    icon512 = rounded_monogram(512)
    icon512.convert("RGB").save(PUBLIC / "icon-512.png", "PNG", optimize=True)
    print("  icon-512.png          512x512")

    ico = rounded_monogram(64, radius_ratio=0.18)
    ico.save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print("  favicon.ico           16/32/48")


def wrap(draw, text, font, max_width):
    words = text.split()
    lines, line = [], ""
    for word in words:
        candidate = f"{line} {word}".strip()
        if draw.textlength(candidate, font=font) <= max_width:
            line = candidate
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def build_og_card():
    width, height = 1200, 630
    card = Image.new("RGB", (width, height), BG)

    # Restrained atmospheric wash, matching the hero treatment.
    glow = Image.new("RGB", (width, height), (0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse((820, -180, 1500, 430), fill=COBALT)
    glow_draw.ellipse((-160, 380, 380, 860), fill=CORAL)
    from PIL import ImageFilter

    glow = glow.filter(ImageFilter.GaussianBlur(170))
    card = Image.blend(card, glow, 0.20)

    draw = ImageDraw.Draw(card)
    left = 80

    # Monogram
    mark = rounded_monogram(64, radius_ratio=0.2)
    card.paste(mark, (left, 74), mark)

    name_font = load_font(86, "bold")
    role_font = load_font(34, "regular")
    statement_font = load_font(30, "regular")
    meta_font = load_font(24, "regular")

    draw.text((left, 186), "Frances Sun", font=name_font, fill=TEXT)
    draw.text((left, 300), "Lead UX Designer", font=role_font, fill=(111, 156, 255))

    statement = "18+ years designing complex enterprise products and operational systems."
    y = 364
    for line in wrap(draw, statement, statement_font, width - left * 2 - 40):
        draw.text((left, y), line, font=statement_font, fill=SECONDARY)
        y += 42

    draw.line((left, height - 116, left + 64, height - 116), fill=COBALT, width=3)
    draw.text((left, height - 92), "Austin, Texas", font=meta_font, fill=TERTIARY)

    OG_DIR.mkdir(parents=True, exist_ok=True)
    out = OG_DIR / "frances-sun-portfolio.png"
    card.save(out, "PNG", optimize=True)
    print(f"  {out.relative_to(PUBLIC)}  {width}x{height}  {out.stat().st_size // 1024}KB")


def main():
    print("Icons:")
    build_icons()
    print("\nOpen Graph card:")
    build_og_card()


if __name__ == "__main__":
    main()
