#!/usr/bin/env python3
"""Compose the print pages of the ebook from the manuscript.

Reads the manuscript of "Brazilian Portuguese for English Speakers: A Strategy
Guide for False Beginners" and writes one self-contained HTML page per print
page into layout/pages/, plus layout/manifest.json. generate.py reads those
pages and renders the PDF with WeasyPrint; the pages are not edited by hand.

Inputs (under the book directory, i.e. the parent of layout/):
  manuscript/0[1-9]-*.md     the nine chapters, in file-name order
  manuscript/appendix.md     the appendix
  manuscript/credits.md      credits and notices
  manuscript/images-plan.md  the image table (IMG00..IMG14)
  layout/ebook.css           the page furniture, inlined into every page
  illustrations/*.png        the fifteen planned drawings

Dependencies: Python 3 standard library and the `markdown` package (3.5).
Deterministic: the same inputs always produce the same bytes.
"""

import html
import json
import re
import sys
from pathlib import Path

try:
    import markdown
except ImportError:
    print("compose_pages.py: error: the 'markdown' package (3.5) is required",
          file=sys.stderr)
    sys.exit(1)


BOOK_ID = "brazilian-portuguese-for-english-speakers"
BOOK_TITLE = ("Brazilian Portuguese for English Speakers: "
              "A Strategy Guide for False Beginners")
COVER_TITLE = "Brazilian Portuguese for English Speakers"
COVER_SUBTITLE = "A Strategy Guide for False Beginners"
COVER_IMAGE_ID = "IMG00"
COVER_IMAGE_FILE = "img00-cover-strategy-guide-false-beginner.png"

IMG_IDS = ["IMG%02d" % n for n in range(15)]

# Image -> page that carries it, in the order the figures appear in the page.
CHAPTER_IMAGES = {
    "01": ["IMG01"],
    "02": ["IMG02", "IMG03"],
    "03": ["IMG04", "IMG05"],
    "04": ["IMG06", "IMG07"],
    "05": ["IMG08", "IMG09"],
    "06": ["IMG10"],
    "07": ["IMG11"],
    "08": ["IMG12"],
    "09": ["IMG13"],
}
APPENDIX_IMAGES = ["IMG14"]

IMG06_CAPTION_SUFFIX = (" The correct transcriptions are caro [ˈkaɾu] and Brasil [bɾaˈziw]. "
                        "Where the drawing and the text differ, the text is correct.")

H2_RE = re.compile(r"<h2")


def fail(message):
    print("compose_pages.py: error: %s" % message, file=sys.stderr)
    sys.exit(1)


def book_root():
    return Path(__file__).resolve().parent.parent


def rel(root, path):
    return str(path.relative_to(root))


def read_text(root, path):
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        fail("cannot read %s: %s" % (rel(root, path), exc))


def write_text(root, path, text):
    try:
        with open(path, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
    except OSError as exc:
        fail("cannot write %s: %s" % (rel(root, path), exc))


def collect_chapters(root):
    """Return the nine chapter files ordered by name."""
    manuscript = root / "manuscript"
    if not manuscript.is_dir():
        fail("missing directory manuscript/")
    chapters = sorted(manuscript.glob("0[1-9]-*.md"))
    if len(chapters) != 9:
        fail("expected exactly 9 chapter files matching manuscript/0[1-9]-*.md, found %d"
             % len(chapters))
    for number, path in enumerate(chapters, start=1):
        if path.name[:2] != "%02d" % number:
            fail("chapter files must be numbered 01..09 in order, got %s" % rel(root, path))
    return chapters


def parse_images_plan(text):
    """Parse the markdown table of images-plan.md into {id: entry}."""
    plan = {}
    for line in text.splitlines():
        if not line.startswith("| IMG"):
            continue
        cells = [cell.strip() for cell in line.split("|")]
        if len(cells) != 7 or cells[0] != "" or cells[-1] != "":
            fail("manuscript/images-plan.md: cannot parse row: %s" % line)
        image_id, chapter, purpose, ratio, filename = cells[1:6]
        if image_id in plan:
            fail("manuscript/images-plan.md: duplicated row for %s" % image_id)
        plan[image_id] = {"chapter": chapter, "purpose": purpose,
                          "ratio": ratio, "file": filename}
    missing = [image_id for image_id in IMG_IDS if image_id not in plan]
    extra = sorted(image_id for image_id in plan if image_id not in IMG_IDS)
    if missing or extra:
        fail("manuscript/images-plan.md: expected exactly IMG00..IMG14; missing: %s; unexpected: %s"
             % (", ".join(missing) or "none", ", ".join(extra) or "none"))
    return plan


def check_image_map(plan):
    """The image map must use IMG01..IMG14 once each and match the table."""
    used = []
    for image_ids in CHAPTER_IMAGES.values():
        used.extend(image_ids)
    used.extend(APPENDIX_IMAGES)
    if sorted(used) != sorted(IMG_IDS[1:]):
        fail("image map must use IMG01..IMG14 exactly once")

    expected = {}
    for number, image_ids in CHAPTER_IMAGES.items():
        for image_id in image_ids:
            expected[image_id] = str(int(number))
    for image_id in APPENDIX_IMAGES:
        expected[image_id] = "appendix"
    for image_id in sorted(expected):
        found = plan[image_id]["chapter"]
        if found != expected[image_id]:
            fail("manuscript/images-plan.md: %s is mapped to chapter %s but the table says '%s'"
                 % (image_id, expected[image_id], found))

    cover = plan[COVER_IMAGE_ID]
    if cover["chapter"] != "cover":
        fail("manuscript/images-plan.md: IMG00 must have chapter 'cover', got '%s'"
             % cover["chapter"])
    if cover["file"] != COVER_IMAGE_FILE:
        fail("manuscript/images-plan.md: IMG00 file name must be %s, got %s"
             % (COVER_IMAGE_FILE, cover["file"]))


def check_illustrations(root, plan):
    missing = []
    for image_id in IMG_IDS:
        path = "illustrations/" + plan[image_id]["file"]
        if not (root / path).is_file():
            missing.append(path)
    if missing:
        fail("missing illustration file(s): %s" % ", ".join(missing))


def heading_text(md_text, name):
    """Text of the first '# ' line of the markdown, without the '# '."""
    for line in md_text.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    fail("%s: no '# ' heading found" % name)
    return ""


def convert(md_text):
    return markdown.markdown(md_text, extensions=["tables", "sane_lists"])


def inject_heading_id(body, anchor, name):
    """Turn the first <h1> into the anchored chapter title."""
    if "<h1>" not in body:
        fail("%s: converted HTML has no <h1> to anchor" % name)
    return body.replace("<h1>", '<h1 id="%s" class="chapter-title">' % anchor, 1)


def figure_html(image_id, plan):
    entry = plan[image_id]
    caption = entry["purpose"]
    if image_id == "IMG06":
        caption += IMG06_CAPTION_SUFFIX
    return ('<figure class="ebook-figure" id="%s">'
            '<img src="../../illustrations/%s" alt="%s" />'
            '<figcaption>%s</figcaption>'
            '</figure>'
            % (image_id.lower(), entry["file"],
               html.escape(entry["purpose"]), html.escape(caption)))


def insert_figures(body, figures):
    """Insert the k-th figure just before the (k+1)-th <h2, else at the end."""
    positions = [match.start() for match in H2_RE.finditer(body)]
    inserts = {}
    tail = []
    for index, figure in enumerate(figures):
        position = index + 1  # 0-based index of the (k+1)-th <h2
        if position < len(positions):
            inserts.setdefault(positions[position], []).append(figure)
        else:
            tail.append(figure)
    for position in sorted(inserts, reverse=True):
        body = body[:position] + "".join(inserts[position]) + body[position:]
    if tail:
        body = body + "".join(tail)
    return body


def cover_body(plan):
    purpose = plan[COVER_IMAGE_ID]["purpose"]
    return ('<img src="../../illustrations/%s" alt="%s" />\n'
            '<p class="cover-title">%s</p>\n'
            '<p class="cover-subtitle">%s</p>'
            % (COVER_IMAGE_FILE, html.escape(purpose),
               html.escape(COVER_TITLE), html.escape(COVER_SUBTITLE)))


def contents_body(chapter_meta, appendix_title):
    lines = ['<h1 id="contents">Contents</h1>', "<ol>"]
    for number, title in chapter_meta:
        lines.append('<li><a href="#ch%s">%s</a></li>' % (number, html.escape(title)))
    lines.append('<li><a href="#appendix">%s</a></li>' % html.escape(appendix_title))
    lines.append("</ol>")
    return "\n".join(lines)


def page_document(title, css, page_class, content):
    return (
        "<!DOCTYPE html>\n"
        '<html lang="en">\n'
        "<head>\n"
        '<meta charset="utf-8" />\n'
        "<title>%s</title>\n"
        "</head>\n"
        "<body>\n"
        "<style>\n"
        "%s"
        "</style>\n"
        '<div lang="en" class="ebook-page %s">\n'
        "%s\n"
        "</div>\n"
        "</body>\n"
        "</html>\n"
        % (html.escape(title), css, page_class, content)
    )


def manifest_body():
    page_types = ["cover", "text", "text"] + ["chapter"] * 10
    pages = [{"number": number, "type": page_type}
             for number, page_type in enumerate(page_types, start=1)]
    data = {
        "schema_version": "1.0.0",
        "book_id": BOOK_ID,
        "title": BOOK_TITLE,
        "language": "en",
        "format": {"size": "14x21cm",
                   "margins_mm": {"top": 18, "bottom": 18, "inner": 18, "outer": 18}},
        "font": {"family": "EB Garamond"},
        "pages": pages,
    }
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


def main():
    root = book_root()
    chapters = collect_chapters(root)

    manuscript = root / "manuscript"
    appendix_path = manuscript / "appendix.md"
    credits_path = manuscript / "credits.md"
    plan_path = manuscript / "images-plan.md"
    css_path = root / "layout" / "ebook.css"
    for path in (appendix_path, credits_path, plan_path, css_path):
        if not path.is_file():
            fail("missing input file: %s" % rel(root, path))

    css = read_text(root, css_path)
    if not css.endswith("\n"):
        css += "\n"
    plan = parse_images_plan(read_text(root, plan_path))
    check_image_map(plan)
    check_illustrations(root, plan)

    credits_md = read_text(root, credits_path)
    appendix_md = read_text(root, appendix_path)

    chapter_meta = []
    chapter_pages = []
    figures_total = 0
    for index, path in enumerate(chapters, start=1):
        number = path.name[:2]
        name = "manuscript/" + path.name
        md_text = read_text(root, path)
        title = heading_text(md_text, name)
        body = inject_heading_id(convert(md_text), "ch" + number, name)
        figures = [figure_html(image_id, plan) for image_id in CHAPTER_IMAGES[number]]
        body = insert_figures(body, figures)
        figures_total += len(figures)
        chapter_meta.append((number, title))
        chapter_pages.append(("%02d-ch%s.html" % (index + 2, number),
                              title, "ebook-chapter", body))

    appendix_title = heading_text(appendix_md, "manuscript/appendix.md")
    appendix_html = inject_heading_id(convert(appendix_md), "appendix",
                                      "manuscript/appendix.md")
    appendix_figures = [figure_html(image_id, plan) for image_id in APPENDIX_IMAGES]
    appendix_html = insert_figures(appendix_html, appendix_figures)
    figures_total += len(appendix_figures)

    pages = [
        ("00-cover.html", COVER_TITLE, "ebook-cover", cover_body(plan)),
        ("01-credits.html", heading_text(credits_md, "manuscript/credits.md"),
         "ebook-credits", convert(credits_md)),
        ("02-contents.html", "Contents", "ebook-contents",
         contents_body(chapter_meta, appendix_title)),
    ] + chapter_pages + [
        ("12-appendix.html", appendix_title, "ebook-chapter", appendix_html),
    ]

    pages_dir = root / "layout" / "pages"
    try:
        pages_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        fail("cannot create %s: %s" % (rel(root, pages_dir), exc))
    for old in sorted(pages_dir.glob("*.html")):
        try:
            old.unlink()
        except OSError as exc:
            fail("cannot remove old page %s: %s" % (rel(root, old), exc))

    for filename, title, page_class, body in pages:
        write_text(root, pages_dir / filename,
                   page_document(title, css, page_class, body))
    write_text(root, root / "layout" / "manifest.json", manifest_body())

    print("compose_pages.py: wrote %d pages (%d figures) to layout/pages/ and layout/manifest.json"
          % (len(pages), figures_total))
    return 0


if __name__ == "__main__":
    sys.exit(main())
