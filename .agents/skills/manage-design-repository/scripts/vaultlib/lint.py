"""Validation of notes, links, navigation, images, machine paths and templates."""
from __future__ import annotations

import fnmatch
import re
from pathlib import Path

from .model import HEADING, MDLINK, PROFILE, WIKILINK, Vault, link_target, strip_code
from .yamlsubset import split_note

DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ABSPATH = re.compile(r"(?<![A-Za-z])[A-Za-z]:\\{1,2}[A-Za-z0-9_]|/(?:Users|home)/[A-Za-z0-9_]")
FENCE = re.compile(r"(?ms)^[ \t]*(```|~~~).*?^[ \t]*\1[ \t]*$")
ENTRY_KEYS = {"status", "for", "note"}


class Report:
    def __init__(self):
        self.items: list[tuple[str, str, str, str]] = []

    def error(self, check: str, where: str, msg: str):
        self.items.append(("error", check, where, msg))

    def warn(self, check: str, where: str, msg: str):
        self.items.append(("warning", check, where, msg))

    def count(self, level: str) -> int:
        return sum(1 for i in self.items if i[0] == level)


def anchor_key(s: str) -> str:
    return re.sub(r"[\s#:|^\[\]*_`]+", "", s).lower()


def _resolves(v: Vault, value, source: str) -> bool:
    target = link_target(value)
    return target is not None and bool(v.resolve(target, source)[0])


def lint_frontmatter(v: Vault, r: Report):
    known = {"type", "status"} | set(v.fields)
    for spec in v.classes.values():
        known |= set(spec.get("required") or []) | set(spec.get("optional") or [])
    managed_types = {spec["type"] for spec in v.classes.values()}
    class_dirs = v.class_dirs()

    for rel in v.notes:
        if v.read(rel).startswith("﻿"):
            r.error("frontmatter", rel, "starts with a UTF-8 BOM; remove it")
        fm, _ = v.note(rel)
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
                elif not _resolves(v, value, rel):
                    r.error("frontmatter", rel, f"{key} is not a resolvable wiki link: `{value}`")
            if kind == "links":
                if not isinstance(value, list):
                    r.error("frontmatter", rel, f"{key} must be a list of quoted wiki links (use [] when empty)")
                else:
                    for item in value:
                        if not _resolves(v, item, rel):
                            r.error("frontmatter", rel, f"{key} entry is not a resolvable wiki link: `{item}`")


def lint_links(v: Vault, r: Report):
    headings: dict[str, set[str]] = {}

    def anchors(path: str) -> set[str]:
        if path not in headings:
            headings[path] = {anchor_key(h) for _, h in HEADING.findall(v.read(path))}
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
                want = anchor_key(anchor.rstrip("\\"))
                if want and want not in anchors(path):
                    r.warn("links", rel, f"[[{target}{anchor}]] heading not found in {path}")
        for m in MDLINK.finditer(text):
            href = m.group(3).split("#")[0]
            if not href or re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", href):
                continue
            if v.resolve_href(href, rel) is None:
                r.error("links", rel, f"({href}) does not exist")


def _git_ignored(v: Vault) -> list[str]:
    """Patterns from the root .gitignore: such paths are machine-local and may be absent."""
    path = v.root / ".gitignore"
    if not path.is_file():
        return []
    return [line.strip().strip("/") for line in path.read_text(encoding="utf-8-sig").splitlines()
            if line.strip() and not line.lstrip().startswith(("#", "!"))]


def lint_navigation(v: Vault, r: Report):
    records = v.profile.get("records") or {}
    ignored = _git_ignored(v)
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
        text = FENCE.sub("", (v.root / rel).read_text(encoding="utf-8-sig"))
        for token in re.findall(r"`([^`\n]+)`", text):
            looks_like_path = token.endswith("/") or re.search(r"\.(md|yml|yaml|base|json|py)$", token)
            if not looks_like_path or re.search(r"[<>*{}$]|^\.\.?/|^\.[A-Za-z0-9]+$", token):
                continue
            clean = token.strip("/")
            if any(fnmatch.fnmatch(clean, p) or clean.startswith(p + "/") for p in ignored):
                continue
            if not (v.root / token).exists():
                r.error("navigation", rel, f"`{token}` does not exist")


def lint_images(v: Vault, r: Report):
    rules = v.image_rules
    if not rules["dirs"]:
        return
    use_manifest = bool(rules["manifest"])
    corpus = "" if use_manifest else "\n".join(v.read(n) for n in v.notes)
    images = v.images()
    for rel in images:
        p = Path(rel)
        if rules["formats"] and p.suffix.lower() not in rules["formats"]:
            r.error("images", rel, f"format {p.suffix} not allowed; run `vault.py images`")
        if any(pat.search(p.stem) for pat in rules["bad_names"]):
            r.error("images", rel, "meaningless file name; rename it to say what it shows")
        size_kb = (v.root / rel).stat().st_size // 1024
        if rules["max_kb"] and size_kb > rules["max_kb"]:
            r.warn("images", rel, f"{size_kb} KB exceeds {rules['max_kb']} KB")
        if not use_manifest:
            if p.name not in corpus:
                r.warn("images", rel, "not mentioned in any note")
            continue
        manifest, _, record = v.image_record(rel)
        if record is None:
            where = f"in {manifest}" if manifest else f"(no {rules['manifest']} above it)"
            r.error("images", rel, f"no manifest record {where}; run `vault.py images`")

    if not use_manifest:
        return
    present = set(images)
    for manifest, entries in v.manifests().items():
        if entries is None:
            r.error("images", manifest, "manifest is not valid: expected an `images:` map")
            continue
        base = manifest.rsplit("/", 1)[0]
        for key, record in entries.items():
            if f"{base}/{key}" not in present:
                r.error("images", manifest, f"record `{key}` has no image file")
            status = record.get("status")
            if rules["status"] and status not in rules["status"]:
                r.error("images", manifest, f"`{key}` status `{status}` not in {rules['status']}")
            targets = record.get("for") or []
            if not isinstance(targets, list):
                r.error("images", manifest, f"`{key}` for must be a list of quoted wiki links")
                targets = []
            for item in targets:
                if not _resolves(v, item, manifest):
                    r.error("images", manifest, f"`{key}` for entry does not resolve: `{item}`")
            for extra in set(record) - ENTRY_KEYS:
                r.warn("images", manifest, f"`{key}` has unknown field `{extra}`")


def lint_machine_paths(v: Vault, r: Report):
    here = Path(__file__).resolve()
    targets = [f for f in ("AGENTS.md", "README.md") if (v.root / f).is_file()]
    for top in (".design-workflow", ".agents", ".claude", ".github"):
        base = v.root / top
        if base.is_dir():
            targets += [p.relative_to(v.root).as_posix() for p in base.rglob("*")
                        if p.is_file() and p.suffix.lower() in {".md", ".yml", ".yaml", ".json", ".py"}
                        and "tests" not in p.parts and p.resolve() != here]
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


CHECKS = (lint_navigation, lint_frontmatter, lint_links, lint_images, lint_machine_paths, lint_templates)


def check(v: Vault) -> Report:
    r = Report()
    for fn in CHECKS:
        fn(v, r)
    return r


def run(v: Vault, quiet: bool = False) -> int:
    r = check(v)
    for level in ("error", "warning"):
        rows = [i for i in r.items if i[0] == level]
        if not rows or (level == "warning" and quiet):
            continue
        print(f"\n{level.upper()}S ({len(rows)})")
        for _, name, where, msg in sorted(rows, key=lambda i: (i[1], i[2])):
            print(f"  [{name}] {where}: {msg}")
    managed = sum(1 for n in v.notes if v.dir_of(n))
    print(f"\n{managed} managed notes, {len(v.notes)} markdown files, "
          f"{r.count('error')} errors, {r.count('warning')} warnings")
    return 1 if r.count("error") else 0
