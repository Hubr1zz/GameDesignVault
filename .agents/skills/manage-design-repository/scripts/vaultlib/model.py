"""The vault: its profile, files, notes, link resolution and image manifests."""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

from .yamlsubset import inline_list, parse_yaml, quote, split_note

PROFILE = ".design-workflow/profile.yml"
RASTER = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"}
IMAGE = RASTER | {".svg"}

# [[target#anchor|alias]] with an optional leading "!" for embeds.
WIKILINK = re.compile(r"(!?)\[\[([^\[\]|#]*)(#[^\[\]|]*)?(\|[^\[\]]*)?\]\]")
# [text](href) and ![alt](href); the href may contain single spaces.
MDLINK = re.compile(r"(!?)\[([^\]]*)\]\(<?([^)<>\s]+(?: [^)<>\s]+)*)>?\)")
_CODE = re.compile(r"(?ms)^[ \t]*(```|~~~).*?^[ \t]*\1[ \t]*$|`[^`\n]*`")
HEADING = re.compile(r"(?m)^(#{1,6})[ \t]+(.+?)[ \t]*$")

MANIFEST_HEADER = (
    "# Image manifest: one record per image, keyed by its path relative to this file.\n"
    "# Checked by `vault.py lint`. `vault.py images` adds records for new images.\n"
)
ENTRY_ORDER = ["status", "for", "note"]


def segments(text: str):
    """Yield (kind, chunk) pairs covering the text: "text", "fence" or "code"."""
    pos = 0
    for m in _CODE.finditer(text):
        if m.start() > pos:
            yield "text", text[pos:m.start()]
        yield ("fence" if m.group(1) else "code"), m.group(0)
        pos = m.end()
    if pos < len(text):
        yield "text", text[pos:]


def strip_code(text: str) -> str:
    return "".join(chunk for kind, chunk in segments(text) if kind == "text")


def link_target(value):
    """The target of a string that is exactly one wiki link, else None."""
    m = WIKILINK.fullmatch(value.strip()) if isinstance(value, str) else None
    return m.group(2).strip() if m else None


def dump_manifest(entries: dict) -> str:
    lines = [MANIFEST_HEADER.rstrip("\n"), "images:" if entries else "images: {}"]
    for key in sorted(entries):
        entry = entries[key] or {}
        lines.append(f"  {quote(key)}:")
        for field in ENTRY_ORDER + [k for k in entry if k not in ENTRY_ORDER]:
            if field not in entry:
                continue
            value = entry[field]
            if isinstance(value, list):
                lines.append(f"    {field}: {inline_list(value)}")
            elif field == "status" and value:
                lines.append(f"    {field}: {value}")
            else:
                lines.append(f"    {field}: {quote(value)}")
    return "\n".join(lines) + "\n"


class Vault:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.profile = parse_yaml((self.root / PROFILE).read_text(encoding="utf-8-sig"))
        self.classes = self.profile.get("classes") or {}
        self.fields = self.profile.get("fields") or {}
        ignore = self.profile.get("ignore") or {}
        self.ignore_dirs = set(ignore.get("dirs") or [])
        self.ignore_keys = list(ignore.get("keys") or [])
        self.rescan()

    # ------------------------------------------------------------- files
    def rescan(self):
        self.files: list[str] = []
        for d, dirs, names in os.walk(self.root):
            rel = Path(d).relative_to(self.root).as_posix()
            dirs[:] = sorted(x for x in dirs if not x.startswith(".")
                             and (x if rel == "." else f"{rel}/{x}") not in self.ignore_dirs)
            for n in sorted(names):
                self.files.append(n if rel == "." else f"{rel}/{n}")
        self.notes = [f for f in self.files if f.lower().endswith(".md")]
        self.by_path = {f.lower(): f for f in self.files}
        self.by_name: dict[str, list[str]] = {}
        for f in self.files:
            name = f.rsplit("/", 1)[-1].lower()
            self.by_name.setdefault(name, []).append(f)
            if name.endswith(".md"):
                self.by_name.setdefault(name[:-3], []).append(f)
        self._text: dict[str, str] = {}
        self._manifests = None

    def read(self, rel: str) -> str:
        if rel not in self._text:
            self._text[rel] = (self.root / rel).read_bytes().decode("utf-8", errors="replace")
        return self._text[rel]

    def note(self, rel: str):
        """Return (frontmatter dict or None, body) for a note."""
        return split_note(self.read(rel))

    # ----------------------------------------------------------- classes
    def class_dirs(self) -> dict[str, list[str]]:
        """Map each class directory to the type values allowed in it."""
        out: dict[str, list[str]] = {}
        for spec in self.classes.values():
            out.setdefault(spec["dir"].strip("/"), []).append(spec["type"])
        return out

    def dir_of(self, rel: str):
        best = None
        for d in self.class_dirs():
            if rel.startswith(d + "/") and (best is None or len(d) > len(best)):
                best = d
        return best

    def spec_for_type(self, type_value):
        for key, spec in self.classes.items():
            if spec["type"] == type_value:
                return key, spec
        return None, None

    # ------------------------------------------------------------- links
    def resolve(self, target: str, source: str = ""):
        """Resolve a wiki-link target the way shortest-path wiki links work.
        Returns (path or None, ambiguous)."""
        t = target.strip().replace("\\", "/").strip("/").lower()
        if not t:
            return (source or None), False
        for cand in (t, t + ".md"):
            if cand in self.by_path:
                return self.by_path[cand], False
        if "/" not in t:
            hits = self.by_name.get(t, [])
            return (hits[0], len(hits) > 1) if hits else (None, False)
        hits = [f for low, f in self.by_path.items()
                if low.endswith("/" + t) or low.endswith("/" + t + ".md")]
        return (hits[0], len(hits) > 1) if hits else (None, False)

    def resolve_href(self, href: str, source: str):
        """Resolve a Markdown link target relative to its note, then to the root."""
        href = href.split("#")[0].replace("%20", " ")
        if not href or re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", href):
            return None
        here = os.path.normpath((Path(source).parent / href).as_posix()).replace("\\", "/")
        for cand in (here, href.strip("/")):
            if cand.lower() in self.by_path:
                return self.by_path[cand.lower()]
        return None

    def find(self, query: str):
        """Find one file by path, name or unique fragment. Returns (path, candidates)."""
        path, ambiguous = self.resolve(query)
        if path and not ambiguous:
            return path, []
        q = query.strip().lower()
        hits = [f for f in self.files if q in f.lower()]
        notes = [f for f in hits if f.lower().endswith(".md")]
        hits = notes or hits
        return (hits[0], []) if len(hits) == 1 else (None, hits)

    # ------------------------------------------------------------ images
    @property
    def image_rules(self) -> dict:
        img = self.profile.get("images") or {}
        return {
            "dirs": [d.strip("/") for d in img.get("dirs") or []],
            "formats": {"." + f.lower().lstrip(".") for f in img.get("formats") or []},
            "max_kb": int(img.get("max_kb") or 0),
            "max_edge": int(img.get("max_edge") or 0),
            "quality": int(img.get("quality") or 90),
            "bad_names": [re.compile(p) for p in img.get("bad_names") or []],
            "manifest": img.get("manifest"),
            "status": list(img.get("status") or []),
            "default_status": img.get("default_status"),
        }

    def images(self) -> list[str]:
        dirs = self.image_rules["dirs"]
        return [f for f in self.files if Path(f).suffix.lower() in IMAGE
                and any(f.startswith(d + "/") for d in dirs)]

    def manifests(self) -> dict[str, dict]:
        """Map each manifest file to its {key: record} map."""
        if self._manifests is None:
            name, dirs = self.image_rules["manifest"], self.image_rules["dirs"]
            self._manifests = {}
            for f in self.files:
                if name and f.rsplit("/", 1)[-1] == name and any(f.startswith(d + "/") for d in dirs):
                    try:
                        data = parse_yaml(self.read(f)).get("images") or {}
                    except (ValueError, AttributeError):
                        data = None
                    self._manifests[f] = ({k: (e or {}) for k, e in data.items()}
                                          if isinstance(data, dict) else None)
        return self._manifests

    def manifest_for(self, image: str, manifests=None):
        """The nearest manifest at or above an image, as (manifest path, key)."""
        known = self.manifests() if manifests is None else manifests
        name = self.image_rules["manifest"]
        parts = image.split("/")[:-1] if name else []
        while parts:
            cand = "/".join(parts) + "/" + name
            if cand in known:
                return cand, image[len("/".join(parts)) + 1:]
            parts.pop()
        return None, None

    def image_record(self, image: str):
        manifest, key = self.manifest_for(image)
        entries = self.manifests().get(manifest) if manifest else None
        return manifest, key, (entries or {}).get(key)

    def write(self, rel: str, text: str):
        """Write a text file, keeping the line endings it already uses."""
        path = self.root / rel
        if path.exists() and b"\r\n" in path.read_bytes():
            text = text.replace("\r\n", "\n").replace("\n", "\r\n")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(text.encode("utf-8"))
        self._text.pop(rel, None)
        self._manifests = None


def find_root() -> Path:
    for start in (Path.cwd(), Path(__file__).resolve().parent):
        for p in (start, *start.parents):
            if (p / PROFILE).is_file():
                return p
    sys.exit(f"error: {PROFILE} not found above the current directory")
