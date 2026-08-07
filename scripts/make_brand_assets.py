#!/usr/bin/env python3
"""Single source of truth for every Project Wingman brand asset.

The mark: a navy squircle, a soft orange glow rising from below, and a white
chevron sitting in front of it. Run from the repo root:

    python3 scripts/make_brand_assets.py

Writes:
    extension/icons/icon16.png, icon32.png, icon48.png, icon128.png
    extension/icons/icon.svg              512px master, gradients and glow intact
    landing/favicon.svg                   same mark, site favicon
    landing/og.png                        1200x630 social share card
    docs/launch/assets/ph-thumbnail-240.png

Requires Pillow, plus the Inter and JetBrains Mono fonts for the share card
(it falls back to Helvetica, with slightly different metrics).

Why the small sizes are drawn differently: a 16px toolbar icon that inherits the
full glow turns to mush, because the blur eats the silhouette. So the glow
tightens and the chevron thickens as the canvas shrinks. That is ordinary icon
craft, not a hack: optical correction per size is why real icon sets ship one
file per size instead of one file scaled.
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

REPO = Path(__file__).resolve().parent.parent
ICON_DIR = REPO / "extension" / "icons"
OG_PATH = REPO / "landing" / "og.png"
FAVICON_PATH = REPO / "landing" / "favicon.svg"
THUMB_PATH = REPO / "docs" / "launch" / "assets" / "ph-thumbnail-240.png"

# ── palette ───────────────────────────────────────────────────────────────────
NAVY_TOP = (20, 24, 38)
NAVY_BOT = (14, 17, 28)
ORANGE = (245, 133, 73)
WHITE = (255, 255, 255)
DIM = (136, 136, 136)
RULE = (42, 44, 56)

SS = 1024  # master canvas; every raster is downsampled from here
FONT_DIRS = [Path.home() / "Library/Fonts", Path("/Library/Fonts"), Path("/System/Library/Fonts")]


def find_font(*names: str) -> Path:
    for name in names:
        for d in FONT_DIRS:
            if (d / name).exists():
                return d / name
    raise FileNotFoundError(f"none of {names} in {[str(d) for d in FONT_DIRS]}")


def load(path: Path, size: int, variation: str | None = None) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(str(path), size)
    if variation:
        try:
            f.set_variation_by_name(variation)
        except (OSError, AttributeError):
            pass
    return f


# ── mark primitives ───────────────────────────────────────────────────────────

def squircle(s: int, n: float = 4.2) -> Image.Image:
    """Superellipse mask. n=4.2 sits near the iOS/macOS icon curve."""
    m = Image.new("L", (s, s), 0)
    a = s / 2
    pts = []
    for i in range(720):
        t = i / 720 * 2 * math.pi
        ct, st = math.cos(t), math.sin(t)
        pts.append((
            a + a * (abs(ct) ** (2 / n)) * (1 if ct >= 0 else -1),
            a + a * (abs(st) ** (2 / n)) * (1 if st >= 0 else -1),
        ))
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return m


def vertical_gradient(s: int, top: tuple, bottom: tuple) -> Image.Image:
    g = Image.new("RGB", (s, s))
    d = ImageDraw.Draw(g)
    for y in range(s):
        t = y / max(1, s - 1)
        d.line([(0, y), (s, y)], fill=tuple(round(top[c] + (bottom[c] - top[c]) * t) for c in range(3)))
    return g


def mark(s: int, chevron_weight: float, glow_blur: float, glow_alpha: int) -> Image.Image:
    """The mark itself, drawn at `s` px. Callers pass optically-tuned params."""
    body = vertical_gradient(s, NAVY_TOP, NAVY_BOT).convert("RGBA")

    glow = Image.new("L", (s, s), 0)
    r = s * 0.34
    ImageDraw.Draw(glow).ellipse(
        [s * 0.5 - r, s * 0.60 - r, s * 0.5 + r, s * 0.60 + r], fill=glow_alpha
    )
    glow = glow.filter(ImageFilter.GaussianBlur(s * glow_blur))
    body.alpha_composite(Image.merge("RGBA", (*Image.new("RGB", (s, s), ORANGE).split(), glow)))

    chev = Image.new("L", (s, s), 0)
    ImageDraw.Draw(chev).line(
        [(s * 0.20, s * 0.63), (s * 0.5, s * 0.35), (s * 0.80, s * 0.63)],
        fill=255, width=max(1, int(s * chevron_weight)), joint="curve",
    )
    body.paste(Image.new("RGB", (s, s), WHITE), (0, 0), chev)

    out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    out.paste(body.convert("RGB"), (0, 0), squircle(s))
    return out


# Per-size optical tuning. Smaller canvas: tighter glow, heavier chevron.
TUNING = {
    16: dict(chevron_weight=0.185, glow_blur=0.10, glow_alpha=170),
    32: dict(chevron_weight=0.170, glow_blur=0.12, glow_alpha=190),
    48: dict(chevron_weight=0.155, glow_blur=0.14, glow_alpha=200),
    128: dict(chevron_weight=0.140, glow_blur=0.16, glow_alpha=210),
    240: dict(chevron_weight=0.135, glow_blur=0.16, glow_alpha=210),
    512: dict(chevron_weight=0.135, glow_blur=0.16, glow_alpha=210),
}


def render_mark(size: int) -> Image.Image:
    """Draw at the master canvas with this size's tuning, then downsample."""
    params = TUNING.get(size, TUNING[512])
    return mark(SS, **params).resize((size, size), Image.LANCZOS)


# ── SVG ───────────────────────────────────────────────────────────────────────

SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="{w}" height="{w}">
  <defs>
    <linearGradient id="wg-field" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#141826"/>
      <stop offset="1" stop-color="#0E111C"/>
    </linearGradient>
    <radialGradient id="wg-glow" cx="50%" cy="60%" r="46%">
      <stop offset="0" stop-color="#F58549" stop-opacity="0.85"/>
      <stop offset="0.55" stop-color="#F58549" stop-opacity="0.30"/>
      <stop offset="1" stop-color="#F58549" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="wg-clip">
      <path d="M256 0C440 0 512 72 512 256s-72 256-256 256S0 440 0 256 72 0 256 0z"/>
    </clipPath>
  </defs>
  <g clip-path="url(#wg-clip)">
    <rect width="512" height="512" fill="url(#wg-field)"/>
    <circle cx="256" cy="307" r="235" fill="url(#wg-glow)"/>
    <polyline points="102,323 256,179 410,323" fill="none" stroke="#FFFFFF"
              stroke-width="{sw}" stroke-linejoin="round"/>
  </g>
</svg>
"""


def write_svg(path: Path, width: int, stroke: int) -> None:
    path.write_text(SVG.format(w=width, sw=stroke))
    print(f"wrote {path.relative_to(REPO)}")


# ── share card + thumbnail ────────────────────────────────────────────────────

def make_og() -> None:
    sans = find_font("Inter.ttf", "HelveticaNeue.ttc", "Helvetica.ttc")
    mono = find_font("JetBrainsMono-Regular.ttf", "JetBrainsMono.ttf", "Menlo.ttc")
    W, H = 1200, 630

    img = Image.new("RGB", (W, H), NAVY_BOT)
    # Field gradient, then the same glow as the mark, anchored bottom-left.
    for y in range(H):
        t = y / (H - 1)
        ImageDraw.Draw(img).line(
            [(0, y), (W, y)],
            fill=tuple(round(NAVY_TOP[c] + (NAVY_BOT[c] - NAVY_TOP[c]) * t) for c in range(3)),
        )
    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse([-140, H - 300, 640, H + 340], fill=120)
    glow = glow.filter(ImageFilter.GaussianBlur(150))
    img = Image.composite(Image.new("RGB", (W, H), ORANGE), img, glow.point(lambda v: v // 2))

    d = ImageDraw.Draw(img)
    margin = 76

    img.paste(render_mark(72), (margin, 66), render_mark(72))
    d.text((margin + 96, 84), " ".join("PROJECT WINGMAN"), font=load(mono, 19), fill=WHITE)

    headline = load(sans, 80, "Bold")
    d.text((margin, 178), "The copilot that", font=headline, fill=WHITE)
    d.text((margin, 272), "closes deals with you.", font=headline, fill=ORANGE)

    lede = load(sans, 26, "Regular")
    for i, line in enumerate([
        "Live meeting coaching, grounded pitch generation, and objection",
        "handling in your Chrome sidebar. Runs on your own LLM keys.",
    ]):
        d.text((margin, 396 + i * 38), line, font=lede, fill=DIM)

    rail_y = H - 104
    d.line([(margin, rail_y), (W - margin, rail_y)], fill=RULE, width=1)
    rail = load(mono, 19)
    x = margin
    for i, fact in enumerate(["MIT LICENSED", "BRING YOUR OWN KEYS", "NO WINGMAN SERVER"]):
        d.text((x, rail_y + 30), fact, font=rail, fill=WHITE if i == 0 else DIM)
        x += d.textlength(fact, font=rail) + 44
        if i < 2:
            d.text((x - 28, rail_y + 30), "·", font=rail, fill=RULE)

    OG_PATH.parent.mkdir(parents=True, exist_ok=True)
    img.save(OG_PATH, "PNG", optimize=True)
    print(f"wrote {OG_PATH.relative_to(REPO)} ({W}x{H}, {OG_PATH.stat().st_size/1024:.0f} KB)")


def make_github_social() -> None:
    """GitHub repo social preview. GitHub renders these at 1280x640 and crops
    anything else, so a square icon would be letterboxed. Kept text-light because
    the card is often shown small in a Slack or X unfurl."""
    sans = find_font("Inter.ttf", "HelveticaNeue.ttc", "Helvetica.ttc")
    mono = find_font("JetBrainsMono-Regular.ttf", "JetBrainsMono.ttf", "Menlo.ttc")
    W, H = 1280, 640

    img = Image.new("RGB", (W, H), NAVY_BOT)
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        d.line([(0, y), (W, y)],
               fill=tuple(round(NAVY_TOP[c] + (NAVY_BOT[c] - NAVY_TOP[c]) * t) for c in range(3)))
    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse([-160, H - 300, 660, H + 320], fill=120)
    glow = glow.filter(ImageFilter.GaussianBlur(150))
    img = Image.composite(Image.new("RGB", (W, H), ORANGE), img, glow.point(lambda v: v // 2))
    d = ImageDraw.Draw(img)

    m = render_mark(104)
    img.paste(m, (80, 118), m)

    d.text((80, 256), "Project Wingman", font=load(sans, 68, "Bold"), fill=WHITE)
    d.text((80, 340), "Open-source AI sales copilot for your browser sidebar.",
           font=load(sans, 29, "Regular"), fill=DIM)

    rail_y = H - 108
    d.line([(80, rail_y), (W - 80, rail_y)], fill=RULE, width=1)
    rail = load(mono, 19)
    x = 80
    for i, fact in enumerate(["MIT LICENSED", "BRING YOUR OWN KEYS", "NO WINGMAN SERVER"]):
        d.text((x, rail_y + 32), fact, font=rail, fill=WHITE if i == 0 else DIM)
        x += d.textlength(fact, font=rail) + 44
        if i < 2:
            d.text((x - 28, rail_y + 32), "·", font=rail, fill=RULE)

    p = REPO / "docs" / "launch" / "assets" / "github-social-1280x640.png"
    p.parent.mkdir(parents=True, exist_ok=True)
    img.save(p, "PNG", optimize=True)
    print(f"wrote {p.relative_to(REPO)} ({W}x{H}, {p.stat().st_size/1024:.0f} KB)")


def make_thumbnail() -> None:
    """Product Hunt thumbnail: the mark, full bleed, with the wordmark under it."""
    S = 240
    img = Image.new("RGB", (S, S), NAVY_BOT)
    m = render_mark(S)
    img.paste(m, (0, 0), m)
    d = ImageDraw.Draw(img)
    label = load(find_font("JetBrainsMono-Regular.ttf", "JetBrainsMono.ttf", "Menlo.ttc"), 15)
    text = "WINGMAN"
    d.text(((S - d.textlength(text, font=label)) / 2, S - 42), text, font=label, fill=WHITE)
    THUMB_PATH.parent.mkdir(parents=True, exist_ok=True)
    img.save(THUMB_PATH, "PNG", optimize=True)
    print(f"wrote {THUMB_PATH.relative_to(REPO)} ({S}x{S})")


def main() -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 128):
        p = ICON_DIR / f"icon{size}.png"
        render_mark(size).save(p, "PNG", optimize=True)
        print(f"wrote {p.relative_to(REPO)} ({size}x{size})")

    write_svg(ICON_DIR / "icon.svg", 512, 44)
    write_svg(FAVICON_PATH, 32, 52)  # heavier stroke so it survives 16px rendering
    make_og()
    make_thumbnail()
    make_github_social()


if __name__ == "__main__":
    main()
