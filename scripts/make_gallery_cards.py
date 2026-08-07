#!/usr/bin/env python3
"""Generate the Product Hunt gallery cards.

Five 1270x760 cards in the P05 identity: navy field, orange glow, white chevron.
Run from the repo root:

    python3 scripts/make_gallery_cards.py

These are deliberately typographic and diagrammatic, NOT fake screenshots. The
landing page already learned that lesson: hand-drawn UI that imitates the product
reads as a mockup the moment anyone looks closely, and on a launch page it costs
more trust than it buys. Real product screenshots go in front of these; the cards
carry the claims that a screenshot cannot show.

Every claim on these cards is one the code actually supports. No invented
metrics, no certifications, no savings percentages.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "docs" / "launch" / "assets" / "gallery"

sys.path.insert(0, str(REPO / "scripts"))
from make_brand_assets import render_mark  # noqa: E402  (shares one mark source)

W, H = 1270, 760
NAVY_TOP, NAVY_BOT = (20, 24, 38), (14, 17, 28)
ORANGE = (245, 133, 73)
WHITE = (255, 255, 255)
DIM = (139, 143, 158)
RULE = (42, 44, 56)

FONT_DIRS = [Path.home() / "Library/Fonts", Path("/Library/Fonts"), Path("/System/Library/Fonts")]


def font_path(*names: str) -> Path:
    for n in names:
        for d in FONT_DIRS:
            if (d / n).exists():
                return d / n
    raise FileNotFoundError(names)


SANS = font_path("Inter.ttf", "HelveticaNeue.ttc")
MONO = font_path("JetBrainsMono-Regular.ttf", "JetBrainsMono.ttf", "Menlo.ttc")


def f(size: int, bold: bool = False, mono: bool = False) -> ImageFont.FreeTypeFont:
    ft = ImageFont.truetype(str(MONO if mono else SANS), size)
    if not mono:
        try:
            ft.set_variation_by_name("Bold" if bold else "Regular")
        except (OSError, AttributeError):
            pass
    return ft


def base(eyebrow: str) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    """Shared frame: gradient field, glow anchored bottom-left, mark, eyebrow."""
    img = Image.new("RGB", (W, H), NAVY_BOT)
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        d.line([(0, y), (W, y)],
               fill=tuple(round(NAVY_TOP[c] + (NAVY_BOT[c] - NAVY_TOP[c]) * t) for c in range(3)))

    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse([-200, H - 340, 700, H + 380], fill=110)
    glow = glow.filter(ImageFilter.GaussianBlur(170))
    img = Image.composite(Image.new("RGB", (W, H), ORANGE), img, glow.point(lambda v: v // 2))
    d = ImageDraw.Draw(img)

    mark = render_mark(52)
    img.paste(mark, (72, 64), mark)
    d.text((140, 80), " ".join("PROJECT WINGMAN"), font=f(16, mono=True), fill=WHITE)
    d.text((72, 150), eyebrow.upper(), font=f(17, mono=True), fill=ORANGE)
    return img, d


def headline(d: ImageDraw.ImageDraw, lines: list[str], y: int = 196, size: int = 62) -> int:
    ft = f(size, bold=True)
    for line in lines:
        d.text((72, y), line, font=ft, fill=WHITE)
        y += int(size * 1.16)
    return y


def body(d: ImageDraw.ImageDraw, lines: list[str], y: int, size: int = 24, fill=DIM) -> int:
    ft = f(size)
    for line in lines:
        d.text((72, y), line, font=ft, fill=fill)
        y += int(size * 1.52)
    return y


def rail(img: Image.Image, d: ImageDraw.ImageDraw, items: list[str]) -> None:
    y = H - 96
    d.line([(72, y), (W - 72, y)], fill=RULE, width=1)
    ft = f(17, mono=True)
    x = 72
    for i, item in enumerate(items):
        d.text((x, y + 32), item, font=ft, fill=WHITE if i == 0 else DIM)
        x += d.textlength(item, font=ft) + 40
        if i < len(items) - 1:
            d.text((x - 26, y + 32), "·", font=ft, fill=RULE)


def rows(d: ImageDraw.ImageDraw, items: list[tuple[str, str]], y: int, chip_w: int = 132) -> int:
    """Mono chip + description, one per line. Used for agent and pipeline lists."""
    for label, desc in items:
        d.rounded_rectangle([72, y, 72 + chip_w, y + 34], radius=4, fill=(30, 34, 50))
        ft = f(14, mono=True)
        tw = d.textlength(label, font=ft)
        d.text((72 + (chip_w - tw) / 2, y + 9), label, font=ft, fill=ORANGE)
        d.text((72 + chip_w + 26, y + 6), desc, font=f(22), fill=WHITE)
        y += 56
    return y


# ─────────────────────────────── the five cards ───────────────────────────────

def card1() -> Image.Image:
    img, d = base("Open-source AI sales copilot")
    # Draw the accent line separately rather than re-drawing over the white one.
    y = headline(d, ["The copilot that"])
    d.text((72, y), "closes deals with you.", font=f(62, bold=True), fill=ORANGE)
    y += int(62 * 1.16)
    body(d, [
        "Live coaching during the call. Pitch generation grounded in your own",
        "knowledge base. Objection handling on tap. It sits in your Chrome",
        "sidebar and never asks you to switch tabs.",
    ], y + 30)
    rail(img, d, ["MIT LICENSED", "BRING YOUR OWN KEYS", "NO WINGMAN SERVER"])
    return img


def card2() -> Image.Image:
    img, d = base("01 · Live meeting copilot")
    headline(d, ["Five agents coaching you", "in real time."], size=54)
    rows(d, [
        ("SENTIMENT", "Reads the prospect's tone as the call moves"),
        ("AGENDA", "Tracks what you've covered against the plan"),
        ("COACH", "Surfaces the next-best sentence on pushback"),
        ("OBJECTION", "Answers “they just said X, what do I say?”"),
        ("VALIDATOR", "Fact-checks every number before you say it"),
    ], 352)
    rail(img, d, ["GOOGLE MEET", "DEEPGRAM STT", "IN-MEET OVERLAY"])
    return img


def card3() -> Image.Image:
    img, d = base("02 · Grounded, not generated")
    headline(d, ["Every number traces", "back to a source."], size=54)
    body(d, [
        "A dedicated validation agent audits each claim against the sources",
        "actually retrieved from your knowledge base. Anything uncited is",
        "rejected before it ever reaches you.",
    ], 350)

    # Illustrative citation chip, drawn as a diagram rather than faked UI.
    y = 500
    d.rounded_rectangle([72, y, 1198, y + 96], radius=8, fill=(24, 28, 44), outline=RULE)
    d.text((104, y + 22), "“Cut onboarding time by a third”", font=f(25), fill=WHITE)
    chip_x = 104 + d.textlength("“Cut onboarding time by a third”", font=f(25)) + 14
    d.rounded_rectangle([chip_x, y + 24, chip_x + 34, y + 52], radius=4, fill=ORANGE)
    d.text((chip_x + 11, y + 29), "1", font=f(15, mono=True), fill=(10, 10, 10))
    d.text((104, y + 58), "source: acme-case-study.pdf  ·  hover to read the quote",
           font=f(16, mono=True), fill=DIM)
    rail(img, d, ["NO UNSOURCED CLAIMS", "INLINE CITATIONS", "SCREEN-READER LABELLED"])
    return img


def card4() -> Image.Image:
    img, d = base("03 · Multi-agent council")
    headline(d, ["Four agents argue", "before you ever see it."], size=54)
    rows(d, [
        ("RETRIEVAL", "Pulls the sources that actually support the pitch"),
        ("ICP", "Reframes for CFO, CTO, VP Sales, RevOps or general"),
        ("BRAND", "Strips hype words and enforces your voice"),
        ("VALIDATION", "Rejects any claim the sources do not carry"),
    ], 360)
    rail(img, d, ["5 ICP PROFILES", "PITCH · EMAIL · OBJECTION", "PINECONE OR IN-BROWSER RAG"])
    return img


def card5() -> Image.Image:
    img, d = base("04 · Yours to run and to change")
    headline(d, ["Open source. Your keys.", "Your infrastructure."], size=54)
    body(d, [
        "MIT licensed and self-hosted. Your call transcripts go to the LLM",
        "provider you already pay for, not to a server of mine. There is no",
        "Wingman server, and no telemetry.",
    ], 350)
    body(d, [
        "Anthropic  ·  Gemini  ·  Groq  ·  OpenRouter  ·  any OpenAI-compatible endpoint",
    ], 486, size=21, fill=WHITE)
    d.text((72, 556), "Honest about today: Google Meet and Zoho only. Self-hosted setup is a",
           font=f(19), fill=DIM)
    d.text((72, 586), "developer task, and authentication is not wired yet.", font=f(19), fill=DIM)
    rail(img, d, ["MIT", "SELF-HOSTED", "NO TELEMETRY", "PRs WELCOME"])
    return img


CARDS = [
    ("01-hero", card1),
    ("02-live-copilot", card2),
    ("03-citations", card3),
    ("04-council", card4),
    ("05-open-source", card5),
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in CARDS:
        p = OUT / f"{name}.png"
        fn().save(p, "PNG", optimize=True)
        print(f"wrote {p.relative_to(REPO)} ({W}x{H}, {p.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main()
