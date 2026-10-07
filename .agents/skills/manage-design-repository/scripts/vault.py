#!/usr/bin/env python3
"""Deterministic checks for a Markdown design repository.

    python vault.py lint            # validate notes, links, navigation, images
    python vault.py images          # convert/resize images that break the image rules
    python vault.py images --check  # list what `images` would change

Everything project-specific comes from `.design-workflow/profile.yml`; nothing here
names a folder, a field or an editor. `lint` needs only the standard library.
`images` needs Pillow.
"""
from __future__ import annotations

import argparse
import fnmatch
import io
import os
import re
import sys
from pathlib import Path

PROFILE = ".design-workflow/profile.yml"
RASTER = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"}
IMAGE = RASTER | {".svg"}


# ---------------------------------------------------------------- YAML subset
def _scalar(raw: str):
    s = raw.strip()
    if s in ("", "~", "null"):
        return None
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "\"'":
        body = s[1:-1]
        return body.replace('\\"', '"').replace("\\\\", "\\") if s[0] == '"' else body
    return s


def _strip_comment(line: str) -> str:
    quote = None
    for i, ch in enumerate(line):
        if quote:
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
        elif ch == "#" and (i == 0 or line[i - 1] in " \t"):
            return line[:i]
    return line


def _inline_list(s: str) -> list:
    items, cur, quote = [], "", None
    for ch in s.strip()[1:-1]:
        if quote:
            cur += ch
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
            cur += ch
        elif ch == ",":
            items.append(cur)
            cur = ""
        else:
            cur += ch
    if cur.strip():
        items.append(cur)
    return [_scalar(x) for x in items]


def parse_yaml(text: str):
    """Parse the YAML subset used by profiles and frontmatter: nested maps,
    lists of scalars (block or inline) and plain or quoted scalars."""
    rows = []
    for raw in text.splitlines():
        line = _strip_comment(raw).rstrip()
        if line.strip():
            rows.append((len(line) - len(line.lstrip(" ")), line.strip()))

    def block(i: int, indent: int):
        if i < len(rows) and rows[i][1].startswith("- "):
            out = []
            while i < len(rows) and rows[i][0] >= indent and rows[i][1].startswith("- "):
                out.append(_scalar(rows[i][1][2:]))
                i += 1
            return out, i
        out = {}
        while i < len(rows) and rows[i][0] == indent and not rows[i][1].startswith("- "):
            key, sep, rest = rows[i][1].partition(":")
            if not sep:
                raise ValueError(f"cannot parse line: {rows[i][1]!r}")
            key, rest = _scalar(key), rest.strip()
            i += 1
            if rest in (">", ">-", "|", "|-"):
                parts = []
                while i < len(rows) and rows[i][0] > indent:
                    parts.append(rows[i][1])
                    i += 1
                out[key] = " ".join(parts)
            elif rest.startswith("[") and rest.endswith("]"):
                out[key] = _inline_list(rest)
            elif rest:
                out[key] = _scalar(rest)
            elif i < len(rows) and (rows[i][0] > indent or (rows[i][0] == indent and rows[i][1].startswith("- "))):
                out[key], i = block(i, rows[i][0])
            else:
                out[key] = None
        return out, i

    if not rows:
        return {}
    value, _ = block(0, rows[0][0])
    return value


FRONTMATTER = re.compile(r"\A---[ \t]*\r?\n(.*?)(?:\r?\n)?---[ \t]*(?:\r?\n|\Z)", re.S)


def split_note(text: str):
    """Return (frontmatter dict or None, body)."""
    m = FRONTMATTER.match(text)
    if not m:
        return None, text
    try:
        data = parse_yaml(m.group(1))
    except ValueError:
        return {"__unparsable__": True}, text[m.end():]
    return (data if isinstance(data, dict) else {}), text[m.end():]


# -------------------------------------------------------------------- vault
class Vault:
    def __init__(self, root: Path):
        self.root = root
        self.profile = parse_yaml((root / PROFILE).read_text(encoding="utf-8-sig"))
        self.classes = self.profile.get("classes") or {}
        self.fields = self.profile.get("fields") or {}
        ignore = self.profile.get("ignore") or {}
        self.ignore_dirs = set(ignore.get("dirs") or [])
        self.ignore_keys = list(ignore.get("keys") or [])
        self.files: list[str] = []
        for d, dirs, names in os.walk(root):
            rel = Path(d).relative_to(root).as_posix()
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

    def read(self, rel: str) -> str:
        if rel not in self._text:
            self._text[rel] = (self.root / rel).read_bytes().decode("utf-8", errors="replace")
        return self._text[rel]

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

    def resolve(self, target: str, source: str):
        """Resolve a wiki-link target the way shortest-path wiki links work.
        Returns (path or None, ambiguous)."""
        t = target.strip().replace("\\", "/").strip("/").lower()
        if not t:
            return source, False
        for cand in (t, t + ".md"):
            if cand in self.by_path:
                return self.by_path[cand], False
        if "/" not in t:
            hits = self.by_name.get(t, [])
            return (hits[0], len(hits) > 1) if hits else (None, False)
        hits = [f for low, f in self.by_path.items()
                if low.endswith("/" + t) or low.endswith("/" + t + ".md")]
        return (hits[0], len(hits) > 1) if hits else (None, False)


def find_root() -> Path:
    for start in (Path.cwd(), Path(__file__).resolve().parent):
        for p in (start, *start.parents):
            if (p / PROFILE).is_file():
                return p
    sys.exit(f"error: {PROFILE} not found above the current directory")


# --------------------------------------------------------------------- lint
WIKILINK = re.compile(r"(!?)\[\[([^\[\]|#]*)(#[^\[\]|]*)?(?:\|[^\[\]]*)?\]\]")
MDLINK = re.compile(r"!?\[[^\]]*\]\(<?([^)<>\s]+(?: [^)<>\s]+)*)>?\)")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ABSPATH = re.compile(r"(?<![A-Za-z])[A-Za-z]:\\{1,2}[A-Za-z0-9_]|/(?:Users|home)/[A-Za-z0-9_]")


def strip_code(text: str) -> str:
    text = re.sub(r"(?ms)^[ \t]*(```|~~~).*?^[ \t]*\1[ \t]*$", "", text)
    return re.sub(r"`[^`\n]*`", "", text)


def _anchor(s: str) -> str:
    return re.sub(r"[\s#:|^\[\]*_`]+", "", s).lower()


class Report:
    def __init__(self):
        self.items: list[tuple[str, str, str, str]] = []

    def add(self, level: str, check: str, where: str, msg: str):
        self.items.append((level, check, where, msg))

    def error(self, check, where, msg):
        self.add("error", check, where, msg)

    def warn(self, check, where, msg):
        self.add("warning", check, where, msg)

    def count(self, level):
        return sum(1 for i in self.items if i[0] == level)


def _link_target(value):
    m = WIKILINK.fullmatch(value.strip()) if isinstance(value, str) else None
    return m.group(2) if m else None


def lint_frontmatter(v: Vault, r: Report):
    known = {"type", "status"} | set(v.fields)
    for spec in v.classes.values():
        known |= set(spec.get("required") or []) | set(spec.get("optional") or [])
    managed_types = {spec["type"] for spec in v.classes.values()}
    class_dirs = v.class_dirs()

    for rel in v.notes:
        text = v.read(rel)
        if text.startswith("﻿"):
            r.error("frontmatter", rel, "starts with a UTF-8 BOM; remove it")
            text = text[1:]
        fm, _ = split_note(text)
        home = v.dir_of(rel)
        if home is None:
            t = (fm or {}).get("type")
            if t in managed_types:
                _, spec = v.spec_for_type(t)
                r.error("placement", rel, f"type `{t}` belongs in `{spec['dir']}/`")
            continue
        if fm is None:
            r.error("frontmatter", rel, f"no frontmatter; expected type {' or '.join(class_dirs[home])}")
            continue
        if fm.get("__unparsable__"):
            r.error("frontmatter", rel, "frontmatter is not valid YAML")
            continue
        t = fm.get("type")
        if t not in class_dirs[home]:
            r.error("frontmatter", rel, f"type is `{t}`; `{home}/` holds {' or '.join(class_dirs[home])}")
            continue
        _, spec = v.spec_for_type(t)
        for key in spec.get("required") or []:
            if key not in fm:
                r.error("frontmatter", rel, f"missing `{key}`")
        if "status" in fm or spec.get("status"):
            allowed = spec.get("status") or []
            if "status" in fm and fm["status"] not in allowed:
                r.error("frontmatter", rel, f"status `{fm['status']}` not in {allowed}")
        for key, value in fm.items():
            if key not in known and not any(fnmatch.fnmatch(key, p) for p in v.ignore_keys):
                r.warn("frontmatter", rel, f"unknown key `{key}`")
            rule = v.fields.get(key) or {}
            kind = rule.get("kind")
            if rule.get("values") and value not in rule["values"]:
                r.error("frontmatter", rel, f"{key} `{value}` not in {rule['values']}")
            if value is not None and value in (rule.get("transitional") or []):
                r.warn("frontmatter", rel, f"{key} is `{value}`, a transitional value")
            if kind == "date" and not (isinstance(value, str) and DATE.match(value)):
                r.error("frontmatter", rel, f"{key} must be YYYY-MM-DD, got `{value}`")
            if kind == "list" and not isinstance(value, list):
                r.error("frontmatter", rel, f"{key} must be a list")
            if kind == "link":
                if value is None:
                    r.warn("frontmatter", rel, f"{key} is empty")
                elif _link_target(value) is None or not v.resolve(_link_target(value), rel)[0]:
                    r.error("frontmatter", rel, f"{key} is not a resolvable wiki link: `{value}`")
            if kind == "links":
                if not isinstance(value, list):
                    r.error("frontmatter", rel, f"{key} must be a list of quoted wiki links (use [] when empty)")
                else:
                    for item in value:
                        if _link_target(item) is None or not v.resolve(_link_target(item), rel)[0]:
                            r.error("frontmatter", rel, f"{key} entry is not a resolvable wiki link: `{item}`")


def lint_links(v: Vault, r: Report):
    headings: dict[str, set[str]] = {}

    def anchors(path: str) -> set[str]:
        if path not in headings:
            headings[path] = {_anchor(h) for h in re.findall(r"(?m)^#{1,6}[ \t]+(.+?)[ \t]*$", v.read(path))}
        return headings[path]

    for rel in v.notes:
        text = strip_code(v.read(rel))
        for m in WIKILINK.finditer(text):
            target, anchor = m.group(2).rstrip("\\").strip(), m.group(3)
            path, ambiguous = v.resolve(target, rel)
            if path is None:
                r.error("links", rel, f"[[{target}]] does not resolve")
                continue
            if ambiguous:
                r.warn("links", rel, f"[[{target}]] matches several files; add a path")
            if anchor and not anchor.startswith("#^") and path.lower().endswith(".md"):
                want = _anchor(anchor.rstrip("\\"))
                if want and want not in anchors(path):
                    r.warn("links", rel, f"[[{target}{anchor}]] heading not found in {path}")
        for m in MDLINK.finditer(text):
            href = m.group(1).split("#")[0]
            if not href or re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", href):
                continue
            href = re.sub(r"%20", " ", href)
            here = (Path(rel).parent / href).as_posix()
            if os.path.normpath(here).replace("\\", "/").lower() not in v.by_path \
                    and href.strip("/").lower() not in v.by_path \
                    and not (v.root / rel).parent.joinpath(href).exists() and not (v.root / href).exists():
                r.error("links", rel, f"({href}) does not exist")


def lint_navigation(v: Vault, r: Report):
    records = v.profile.get("records") or {}
    for key, rel in records.items():
        if key != "navigation" and isinstance(rel, str) and not (v.root / rel).exists():
            r.error("profile", PROFILE, f"records.{key} points to missing `{rel}`")
    for d in v.class_dirs():
        if not (v.root / d).is_dir():
            r.error("profile", PROFILE, f"class directory `{d}/` does not exist")
    for rel in records.get("navigation") or []:
        if not (v.root / rel).is_file():
            r.error("profile", PROFILE, f"navigation file `{rel}` does not exist")
            continue
        text = re.sub(r"(?ms)^[ \t]*(```|~~~).*?^[ \t]*\1[ \t]*$", "", (v.root / rel).read_text(encoding="utf-8-sig"))
        for token in re.findall(r"`([^`\n]+)`", text):
            looks_like_path = token.endswith("/") or re.search(r"\.(md|yml|yaml|base|json|py)$", token)
            if not looks_like_path or re.search(r"[<>*{}$]|^\.\.?/|^\.[A-Za-z0-9]+$", token):
                continue
            if not (v.root / token).exists():
                r.error("navigation", rel, f"`{token}` does not exist")


def image_rules(v: Vault):
    img = v.profile.get("images") or {}
    return {
        "dirs": [d.strip("/") for d in img.get("dirs") or []],
        "formats": {"." + f.lower().lstrip(".") for f in img.get("formats") or []},
        "max_kb": int(img.get("max_kb") or 0),
        "max_edge": int(img.get("max_edge") or 0),
        "quality": int(img.get("quality") or 90),
        "bad_names": [re.compile(p) for p in img.get("bad_names") or []],
    }


def vault_images(v: Vault, rules):
    return [f for f in v.files if Path(f).suffix.lower() in IMAGE
            and any(f.startswith(d + "/") for d in rules["dirs"])]


def lint_images(v: Vault, r: Report):
    rules = image_rules(v)
    if not rules["dirs"]:
        return
    corpus = "\n".join(v.read(n) for n in v.notes)
    for rel in vault_images(v, rules):
        p = Path(rel)
        if rules["formats"] and p.suffix.lower() not in rules["formats"]:
            r.error("images", rel, f"format {p.suffix} not allowed; run `vault.py images`")
        for pat in rules["bad_names"]:
            if pat.search(p.stem):
                r.error("images", rel, "meaningless file name; rename it to say what it shows")
                break
        size_kb = (v.root / rel).stat().st_size // 1024
        if rules["max_kb"] and size_kb > rules["max_kb"]:
            r.warn("images", rel, f"{size_kb} KB exceeds {rules['max_kb']} KB")
        if p.name not in corpus:
            r.warn("images", rel, "not mentioned in any note")


def lint_machine_paths(v: Vault, r: Report):
    targets = [f for f in ("AGENTS.md", "README.md") if (v.root / f).is_file()]
    for top in (".design-workflow", ".agents", ".claude"):
        base = v.root / top
        if base.is_dir():
            targets += [p.relative_to(v.root).as_posix() for p in base.rglob("*")
                        if p.is_file() and p.suffix.lower() in {".md", ".yml", ".yaml", ".json", ".py"}
                        and p.resolve() != Path(__file__).resolve()]
    for rel in targets:
        for n, line in enumerate((v.root / rel).read_text(encoding="utf-8-sig", errors="replace").splitlines(), 1):
            if ABSPATH.search(line):
                r.error("paths", f"{rel}:{n}", "absolute machine path; use a repository-relative path")


def lint_templates(v: Vault, r: Report):
    tdir = (v.profile.get("records") or {}).get("templates")
    if not tdir:
        return
    for key, spec in v.classes.items():
        rel = f"{tdir.strip('/')}/{key}.md"
        if not (v.root / rel).is_file():
            r.warn("templates", rel, f"no template for class `{key}`")
            continue
        fm, _ = split_note((v.root / rel).read_text(encoding="utf-8-sig"))
        fm = fm or {}
        if fm.get("type") != spec["type"]:
            r.error("templates", rel, f"type should be `{spec['type']}`")
        for req in spec.get("required") or []:
            if req not in fm:
                r.error("templates", rel, f"missing `{req}`")


def cmd_lint(v: Vault, args) -> int:
    r = Report()
    for check in (lint_navigation, lint_frontmatter, lint_links, lint_images, lint_machine_paths, lint_templates):
        check(v, r)
    for level in ("error", "warning"):
        rows = [i for i in r.items if i[0] == level]
        if not rows or (level == "warning" and args.quiet):
            continue
        print(f"\n{level.upper()}S ({len(rows)})")
        for _, check, where, msg in sorted(rows, key=lambda i: (i[1], i[2])):
            print(f"  [{check}] {where}: {msg}")
    managed = sum(1 for n in v.notes if v.dir_of(n))
    print(f"\n{managed} managed notes, {len(v.notes)} markdown files, "
          f"{r.count('error')} errors, {r.count('warning')} warnings")
    return 1 if r.count("error") else 0


# ------------------------------------------------------------------- images
def cmd_images(v: Vault, args) -> int:
    rules = image_rules(v)
    try:
        from PIL import Image
    except ImportError:
        sys.exit("error: `vault.py images` needs Pillow (pip install Pillow)")
    if args.paths:
        wanted = []
        for raw in args.paths:
            p = Path(raw).resolve()
            found = [p] if p.is_file() else sorted(p.rglob("*"))
            wanted += [f.relative_to(v.root).as_posix() for f in found
                       if f.is_file() and f.suffix.lower() in RASTER]
    else:
        wanted = [f for f in vault_images(v, rules) if Path(f).suffix.lower() in RASTER]

    target_ext = ".webp"
    plan = []
    for rel in wanted:
        with Image.open(v.root / rel) as im:
            w, h = im.size
            animated = getattr(im, "is_animated", False)
        ext = Path(rel).suffix.lower()
        wrong_format = bool(rules["formats"]) and ext not in rules["formats"]
        too_big = bool(rules["max_edge"]) and max(w, h) > rules["max_edge"]
        if animated or not (wrong_format or too_big):
            continue
        plan.append((rel, str(Path(rel).with_suffix(target_ext).as_posix()) if wrong_format else rel, (w, h)))

    if not plan:
        print("images already follow the rules")
        return 0
    before = after = 0
    renames: dict[str, str] = {}
    for src, dst, (w, h) in plan:
        size = (v.root / src).stat().st_size
        before += size
        if args.check:
            print(f"  would convert {src} ({w}x{h}, {size // 1024} KB) -> {dst}")
            continue
        if dst != src and (v.root / dst).exists():
            print(f"  skipped {src}: {dst} already exists")
            continue
        with Image.open(v.root / src) as im:
            im.load()
            if im.mode not in ("RGB", "RGBA"):
                im = im.convert("RGBA" if "A" in im.getbands() or "transparency" in im.info else "RGB")
            edge = rules["max_edge"]
            if edge and max(im.size) > edge:
                scale = edge / max(im.size)
                im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
            buf = io.BytesIO()
            fmt = {".webp": "WEBP", ".jpg": "JPEG", ".jpeg": "JPEG", ".png": "PNG"}[Path(dst).suffix.lower()]
            im.save(buf, fmt, quality=rules["quality"], method=6) if fmt == "WEBP" else im.save(buf, fmt, quality=rules["quality"])
        (v.root / dst).write_bytes(buf.getvalue())
        if dst != src:
            (v.root / src).unlink()
            renames[Path(src).name] = Path(dst).name
        after += len(buf.getvalue())
        print(f"  {src} -> {dst}  {size // 1024} KB -> {len(buf.getvalue()) // 1024} KB")
    if args.check:
        print(f"{len(plan)} images would change ({before // 1048576} MB now)")
        return 0

    # Point notes at the new file names. A name is rewritten only when no other
    # image still carries it, so an unrelated file can never be re-pointed.
    still_there = {Path(f).name for f in Vault(v.root).files}
    touched = 0
    for rel in v.notes:
        raw = (v.root / rel).read_bytes().decode("utf-8")
        new = raw
        for old, fresh in renames.items():
            if old not in still_there:
                new = new.replace(old, fresh)
        if new != raw:
            (v.root / rel).write_bytes(new.encode("utf-8"))
            touched += 1
    print(f"{len(renames)} files converted, {before // 1048576} MB -> {after // 1048576} MB, "
          f"{touched} notes updated")
    return 0


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_lint = sub.add_parser("lint", help="validate notes, links, navigation and images")
    p_lint.add_argument("--quiet", action="store_true", help="show errors only")
    p_img = sub.add_parser("images", help="convert or resize images that break the image rules")
    p_img.add_argument("paths", nargs="*", help="files or folders (default: the profile's image dirs)")
    p_img.add_argument("--check", action="store_true", help="report without changing anything")
    args = parser.parse_args()
    v = Vault(find_root())
    return cmd_lint(v, args) if args.cmd == "lint" else cmd_images(v, args)


if __name__ == "__main__":
    sys.exit(main())
