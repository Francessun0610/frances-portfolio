"""Read-only inspection of a .pptx file using only the Python standard library.

A .pptx is a ZIP of XML parts. This module reads three things:

  * the deck's slide order, from ppt/presentation.xml
  * which slides are hidden (`show="0"` on the <p:sld> root)
  * the VISIBLE text of each slide, from ppt/slides/slideN.xml only

Speaker notes live in a separate set of parts (ppt/notesSlides/notesSlideN.xml).
This module never opens those parts, so notes cannot leak into the manifest.
"""

import re
import zipfile
import xml.etree.ElementTree as ET

A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

# Parts that must never be read or published.
FORBIDDEN_PART_PATTERNS = (
    re.compile(r"^ppt/notesSlides/"),
    re.compile(r"^ppt/commentAuthors\.xml$"),
    re.compile(r"^ppt/comments/"),
    re.compile(r"^ppt/revisionInfo\.xml$"),
    re.compile(r"^docProps/"),
)


def _slide_relationships(zf):
    """Map relationship id -> slide part name, from the presentation rels."""
    xml = zf.read("ppt/_rels/presentation.xml.rels")
    root = ET.fromstring(xml)
    rels = {}
    for rel in root:
        rel_id = rel.get("Id")
        target = rel.get("Target", "")
        rel_type = rel.get("Type", "")
        if rel_type.endswith("/slide"):
            rels[rel_id] = "ppt/" + target.replace("../", "").lstrip("/")
    return rels


def _iter_text_bodies(element):
    """Yield every <a:txBody>/<p:txBody> in document order, including nested
    group shapes and table cells."""
    for child in element.iter():
        if child.tag in (f"{P}txBody", f"{A}txBody"):
            yield child


def _text_of_body(body):
    """Flatten one text body into plain text, preserving line and paragraph
    breaks. <a:br/> becomes a newline; each <a:p> becomes its own line."""
    lines = []
    for para in body.findall(f"{A}p"):
        parts = []
        for node in para:
            if node.tag == f"{A}r":
                text_node = node.find(f"{A}t")
                if text_node is not None and text_node.text:
                    parts.append(text_node.text)
            elif node.tag == f"{A}br":
                parts.append("\n")
            elif node.tag == f"{A}fld":
                # Field (slide number, date). Skip: it is chrome, not content.
                continue
        line = "".join(parts).strip()
        if line:
            lines.append(line)
    return "\n".join(lines)


def _placeholder_type(shape):
    nv = shape.find(f"{P}nvSpPr")
    if nv is None:
        return None
    nv_pr = nv.find(f"{P}nvPr")
    if nv_pr is None:
        return None
    ph = nv_pr.find(f"{P}ph")
    if ph is None:
        return None
    return ph.get("type", "body")


def _clean(text):
    text = text.replace("\u000b", "\n").replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def inspect_slide(zf, part_name):
    """Return (is_hidden, title, visible_text) for a single slide part."""
    root = ET.fromstring(zf.read(part_name))
    is_hidden = root.get("show") == "0"

    tree = root.find(f"{P}cSld")
    title = ""
    blocks = []

    if tree is not None:
        spTree = tree.find(f"{P}spTree")
        if spTree is not None:
            # Title placeholder, if the slide declares one.
            for shape in spTree.iter(f"{P}sp"):
                ph = _placeholder_type(shape)
                if ph in ("title", "ctrTitle"):
                    body = shape.find(f"{P}txBody")
                    if body is not None:
                        candidate = _clean(_text_of_body(body))
                        if candidate and not title:
                            title = candidate.split("\n")[0]

            for body in _iter_text_bodies(spTree):
                text = _text_of_body(body)
                if text:
                    blocks.append(text)

    visible_text = _clean("\n".join(blocks))
    if not title and visible_text:
        title = visible_text.split("\n")[0]

    # Keep titles to a sane length for use in aria labels and thumbnails.
    title = _clean(title)
    if len(title) > 90:
        title = title[:87].rstrip() + "…"

    return is_hidden, title, visible_text


def fonts_used(path):
    """Typefaces referenced by the deck's slides, with theme tokens resolved.

    Only ppt/slides/*.xml is read, so this reflects what actually renders
    rather than every face mentioned by an unused layout.
    """
    import zipfile as _zipfile

    with _zipfile.ZipFile(path) as zf:
        names = zf.namelist()

        major = minor = None
        for name in sorted(n for n in names if re.match(r"ppt/theme/theme\d+\.xml$", n)):
            xml = zf.read(name).decode("utf8", "ignore")
            major_match = re.search(r"<a:majorFont>\s*<a:latin typeface=\"([^\"]*)\"", xml)
            minor_match = re.search(r"<a:minorFont>\s*<a:latin typeface=\"([^\"]*)\"", xml)
            if major is None and major_match:
                major = major_match.group(1)
            if minor is None and minor_match:
                minor = minor_match.group(1)
            if major and minor:
                break

        used = {}
        for name in names:
            match = re.match(r"ppt/slides/slide(\d+)\.xml$", name)
            if not match:
                continue
            slide_number = int(match.group(1))
            xml = zf.read(name).decode("utf8", "ignore")
            for typeface in set(re.findall(r"<a:(?:latin|ea|cs)[^>]*typeface=\"([^\"]+)\"", xml)):
                if typeface.startswith("+mj"):
                    typeface = major or "Arial"
                elif typeface.startswith("+mn"):
                    typeface = minor or "Arial"
                if not typeface:
                    continue
                used.setdefault(typeface, set()).add(slide_number)

    return used


def inspect_deck(path):
    """Inspect a deck. Returns a dict describing every slide in deck order."""
    with zipfile.ZipFile(path) as zf:
        names = zf.namelist()
        rels = _slide_relationships(zf)

        presentation = ET.fromstring(zf.read("ppt/presentation.xml"))
        sld_id_list = presentation.find(f"{P}sldIdLst")
        ordered_parts = []
        if sld_id_list is not None:
            for sld_id in sld_id_list.findall(f"{P}sldId"):
                rel_id = sld_id.get(f"{R}id")
                part = rels.get(rel_id)
                if part:
                    ordered_parts.append(part)

        slide_size = presentation.find(f"{P}sldSz")
        width_emu = int(slide_size.get("cx")) if slide_size is not None else 0
        height_emu = int(slide_size.get("cy")) if slide_size is not None else 0

        slides = []
        for position, part in enumerate(ordered_parts, start=1):
            hidden, title, text = inspect_slide(zf, part)
            slides.append(
                {
                    "deck_position": position,
                    "part": part,
                    "hidden": hidden,
                    "title": title,
                    "visibleText": text,
                }
            )

        notes_parts = [n for n in names if n.startswith("ppt/notesSlides/") and n.endswith(".xml")]
        comment_parts = [n for n in names if n.startswith("ppt/comments/")]

    return {
        "path": str(path),
        "slide_count": len(slides),
        "visible_count": sum(1 for s in slides if not s["hidden"]),
        "hidden_count": sum(1 for s in slides if s["hidden"]),
        "notes_part_count": len(notes_parts),
        "comment_part_count": len(comment_parts),
        "slide_width_emu": width_emu,
        "slide_height_emu": height_emu,
        "aspect_ratio": round(width_emu / height_emu, 4) if height_emu else None,
        "slides": slides,
    }
