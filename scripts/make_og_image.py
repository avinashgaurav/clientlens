#!/usr/bin/env python3
"""Generate landing/og.png, the social share card for the landing page.

The card mirrors the landing hero: black field, white headline, orange accent
on the phrase that carries the promise, mono eyebrow and footer rail.

Run from the repo root:

    python3 scripts/make_og_image.py

Requires Pillow (pip install pillow) and the Inter / JetBrains Mono fonts.
Font lookup falls back to Helvetica so the script still produces a card on a
machine without them, just with slightly different metrics.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = REPO_ROOT / "landing" / "og.png"
THUMB_PATH = REPO_ROOT / "docs" / "launch" / "assets" / "ph-thumbnail-240.png"

WIDTH, HEIGHT = 1200, 630
THUMB_SIZE = 240
BLACK = "#000000"
WHITE = "#FFFFFF"
ORANGE = "#F58549"
DIM = "#888888"
RULE = "#2A2A2A"

FONT_DIRS = [
    Path.home() / "Library" / "Fonts",
    Path("/Library/Fonts"),
    Path("/System/Library/Fonts"),
]


def find_font(*names: str) -> Path:
    """Return the first font file that exists, searching the usual macOS dirs."""
    for name in names:
        for directory in FONT_DIRS:
            candidate = directory / name
            if candidate.exists():
                return candidate
    raise FileNotFoundError(f"none of {names} found in {[str(d) for d in FONT_DIRS]}")


def load(path: Path, size: int, variation: str | None = None) -> ImageFont.FreeTypeFont:
    font = ImageFont.truetype(str(path), size)
    if variation:
        # Inter ships as a variable font; pick a named instance when available.
        try:
            font.set_variation_by_name(variation)
        except (OSError, AttributeError):
            pass
    return font


def main() -> None:
    sans = find_font("Inter.ttf", "HelveticaNeue.ttc", "Helvetica.ttc")
    mono = find_font("JetBrainsMono-Regular.ttf", "JetBrainsMono.ttf", "Menlo.ttc")

    headline = load(sans, 82, "Bold")
    lede = load(sans, 27, "Regular")
    eyebrow = load(mono, 20)
    rail = load(mono, 19)

    img = Image.new("RGB", (WIDTH, HEIGHT), BLACK)
    draw = ImageDraw.Draw(img)

    margin = 76

    # Eyebrow, letterspaced by hand since PIL has no tracking control.
    draw.text(
        (margin, 84),
        " ".join("OPEN SOURCE AI SALES COPILOT"),
        font=eyebrow,
        fill=ORANGE,
    )

    # Headline, two lines. The accent line carries the promise.
    draw.text((margin, 148), "The copilot that", font=headline, fill=WHITE)
    draw.text((margin, 244), "closes deals with you.", font=headline, fill=ORANGE)

    # Lede, wrapped by hand to keep the line breaks deliberate.
    lede_lines = [
        "Live meeting coaching, grounded pitch generation, and objection",
        "handling in your Chrome sidebar. Runs on your own LLM keys.",
    ]
    y = 372
    for line in lede_lines:
        draw.text((margin, y), line, font=lede, fill=DIM)
        y += 40

    # Footer rail: a hairline rule, then the three facts that matter most.
    rail_y = HEIGHT - 108
    draw.line([(margin, rail_y), (WIDTH - margin, rail_y)], fill=RULE, width=1)

    facts = ["MIT LICENSED", "BRING YOUR OWN KEYS", "NO WINGMAN SERVER"]
    x = margin
    for i, fact in enumerate(facts):
        draw.text((x, rail_y + 30), fact, font=rail, fill=WHITE if i == 0 else DIM)
        x += draw.textlength(fact, font=rail) + 44
        if i < len(facts) - 1:
            draw.text((x - 28, rail_y + 30), "·", font=rail, fill=RULE)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT_PATH, "PNG", optimize=True)
    size_kb = OUT_PATH.stat().st_size / 1024
    print(f"wrote {OUT_PATH.relative_to(REPO_ROOT)} ({WIDTH}x{HEIGHT}, {size_kb:.0f} KB)")

    make_thumbnail(sans, mono)


def make_thumbnail(sans: Path, mono: Path) -> None:
    """Square launch thumbnail. Product Hunt requires one and crops to a circle
    in some placements, so the mark stays well inside a safe centre area."""
    img = Image.new("RGB", (THUMB_SIZE, THUMB_SIZE), BLACK)
    draw = ImageDraw.Draw(img)

    # A single glyph reads at 40px; a wordmark does not. "W" plus the orange
    # underscore echoes the landing hero's accent.
    mark = load(sans, 132, "Bold")
    box = draw.textbbox((0, 0), "W", font=mark)
    draw.text(
        ((THUMB_SIZE - (box[2] - box[0])) / 2 - box[0], 44),
        "W",
        font=mark,
        fill=WHITE,
    )

    # Accent rule under the mark, centred.
    rule_w = 84
    draw.rectangle(
        [
            ((THUMB_SIZE - rule_w) / 2, 176),
            ((THUMB_SIZE + rule_w) / 2, 182),
        ],
        fill=ORANGE,
    )

    label = load(mono, 15)
    text = "WINGMAN"
    draw.text(
        ((THUMB_SIZE - draw.textlength(text, font=label)) / 2, 198),
        text,
        font=label,
        fill=DIM,
    )

    THUMB_PATH.parent.mkdir(parents=True, exist_ok=True)
    img.save(THUMB_PATH, "PNG", optimize=True)
    size_kb = THUMB_PATH.stat().st_size / 1024
    print(
        f"wrote {THUMB_PATH.relative_to(REPO_ROOT)} "
        f"({THUMB_SIZE}x{THUMB_SIZE}, {size_kb:.0f} KB)"
    )


if __name__ == "__main__":
    main()
