"""Move or rename a file or folder and rewrite every reference to it:
wiki links, Markdown links, backticked paths, image manifests and the profile."""
from __future__ import annotations

import os
import posixpath
import shutil
import subprocess
from pathlib import Path

from .model import MDLINK, PROFILE, WIKILINK, Vault, dump_manifest, segments


class RenameError(Exception):
    pass


def _norm(path: str) -> str:
    return posixpath.normpath(path.replace("\\", "/")).strip("/")


def plan_moves(v: Vault, src: str, dst: str):
    """Return (operations, per-file mapping, moved directories)."""
    src_rel = _norm(src)
    if not (v.root / src_rel).exists():
        found, candidates = v.find(src)
        if found is None:
            hint = f"; candidates: {', '.join(candidates[:8])}" if candidates else ""
            raise RenameError(f"`{src}` does not match one file{hint}")
        src_rel = found
    src_abs = v.root / src_rel
    dst_rel = _norm(dst)
    if "/" not in dst.replace("\\", "/"):
        # A bare name renames in place; write ./name to move to the root.
        dst_rel = _norm(posixpath.join(posixpath.dirname(src_rel), dst_rel))
    if src_abs.is_file():
        if dst.replace("\\", "/").endswith("/") or (v.root / dst_rel).is_dir():
            dst_rel = f"{dst_rel}/{src_abs.name}"
        elif not Path(dst_rel).suffix and src_abs.suffix:
            dst_rel += src_abs.suffix
    if dst_rel == src_rel:
        raise RenameError("source and destination are the same")
    if (v.root / dst_rel).exists():
        raise RenameError(f"`{dst_rel}` already exists")

    if src_abs.is_file():
        return [(src_rel, dst_rel)], {src_rel: dst_rel}, []
    mapping = {}
    for d, _, names in os.walk(src_abs):
        for n in names:
            old = (Path(d) / n).relative_to(v.root).as_posix()
            mapping[old] = dst_rel + old[len(src_rel):]
    return [(src_rel, dst_rel)], mapping, [(src_rel, dst_rel)]


class Rewriter:
    def __init__(self, v: Vault, mapping: dict[str, str], dir_moves: list[tuple[str, str]]):
        self.v, self.mapping, self.dir_moves = v, mapping, dir_moves
        self.new_files = [mapping.get(f, f) for f in v.files]
        self.reminders: list[str] = []

    # ----------------------------------------------------- naming a target
    def _hits(self, suffix: str) -> int:
        s = suffix.lower()
        return sum(1 for f in self.new_files
                   if (low := f.lower()) in (s, s + ".md") or low.endswith("/" + s) or low.endswith("/" + s + ".md"))

    def wiki_name(self, new_path: str, full: bool) -> str:
        bare = new_path[:-3] if new_path.lower().endswith(".md") else new_path
        if full:
            return bare
        parts = bare.split("/")
        for n in range(1, len(parts) + 1):
            suffix = "/".join(parts[-n:])
            if self._hits(suffix) <= 1:
                return suffix
        return bare

    def remap_path(self, path: str):
        """New location of a moved file or of anything inside a moved folder."""
        if path in self.mapping:
            return self.mapping[path]
        for old, new in self.dir_moves:
            if path == old or path.startswith(old + "/"):
                return new + path[len(old):]
        return None

    # ------------------------------------------------------- one document
    def link(self, m, source: str) -> str:
        raw = m.group(2)
        target = raw.rstrip().rstrip("\\").strip()
        path, _ = self.v.resolve(target, source)
        if not target or path not in self.mapping:
            return m.group(0)
        t = target.replace("\\", "/").strip("/").lower()
        full = "/" in t and (t in self.v.by_path or t + ".md" in self.v.by_path)
        escaped = "\\" if raw.rstrip().endswith("\\") else ""
        return (f"{m.group(1)}[[{self.wiki_name(self.mapping[path], full)}{escaped}"
                f"{m.group(3) or ''}{m.group(4) or ''}]]")

    def href(self, m, source: str, new_source: str) -> str:
        href = m.group(3)
        base, _, fragment = href.partition("#")
        path = self.v.resolve_href(base, source)
        if path is None or (path not in self.mapping and source == new_source):
            return m.group(0)
        decoded = base.replace("%20", " ")
        relative = _norm((Path(source).parent / decoded).as_posix()).lower() == path.lower()
        new_path = self.mapping.get(path, path)
        new_base = (posixpath.relpath(new_path, posixpath.dirname(new_source) or ".")
                    if relative else new_path)
        if "%20" in base:
            new_base = new_base.replace(" ", "%20")
        fresh = new_base + (("#" + fragment) if fragment else "")
        start, end = m.start(3) - m.start(0), m.end(3) - m.start(0)
        return m.group(0)[:start] + fresh + m.group(0)[end:]

    def code(self, chunk: str, source: str, new_source: str) -> str:
        token = chunk[1:-1]
        slash = "/" if token.endswith("/") else ""
        clean = token.strip().rstrip("/")
        if not clean:
            return chunk
        new = self.remap_path(_norm(clean))
        if new is not None:
            return f"`{new}{slash}`"
        here = _norm((Path(source).parent / clean).as_posix())
        new = self.remap_path(here) if "/" in clean or "." in clean else None
        if new is not None:
            return f"`{posixpath.relpath(new, posixpath.dirname(new_source) or '.')}{slash}`"
        return chunk

    def document(self, text: str, source: str) -> str:
        new_source = self.mapping.get(source, source)
        out = []
        for kind, chunk in segments(text):
            if kind == "text":
                chunk = WIKILINK.sub(lambda m: self.link(m, source), chunk)
                chunk = MDLINK.sub(lambda m: self.href(m, source, new_source), chunk)
            elif kind == "code":
                chunk = self.code(chunk, source, new_source)
            else:
                names = [old for old, _ in self.dir_moves]
                names += [Path(old).stem for old in self.mapping if not self.dir_moves and len(Path(old).stem) > 1]
                if any(n in chunk for n in names):
                    self.reminders.append(source)
            out.append(chunk)
        return "".join(out)

    # ---------------------------------------------------------- manifests
    def manifests(self) -> dict[str, str]:
        v = self.v
        old = {m: dict(e) for m, e in v.manifests().items() if e is not None}
        if not old:
            return {}
        before = {m: dump_manifest(e) for m, e in old.items()}
        after_paths = {self.mapping.get(m, m): m for m in old}
        work = {m: dict(e) for m, e in old.items()}
        for image in v.images():
            manifest, key = v.manifest_for(image, old)
            if manifest is None or key not in old[manifest]:
                continue
            new_image = self.mapping.get(image, image)
            new_manifest, new_key = v.manifest_for(new_image, {p: {} for p in after_paths})
            if new_manifest == self.mapping.get(manifest, manifest) and new_key == key:
                continue
            record = work[manifest].pop(key)
            if new_manifest is None:
                self.reminders.append(f"{new_image} (no manifest above it; its record was dropped)")
            else:
                work[after_paths[new_manifest]][new_key] = record
        for manifest, entries in work.items():
            for record in entries.values():
                if isinstance(record.get("for"), list):
                    record["for"] = [WIKILINK.sub(lambda m: self.link(m, manifest), item)
                                     if isinstance(item, str) else item for item in record["for"]]
        return {m: dump_manifest(e) for m, e in work.items() if dump_manifest(e) != before[m]}

    # ------------------------------------------------------------ profile
    def profile(self) -> str | None:
        text = (self.v.root / PROFILE).read_bytes().decode("utf-8")
        new = text
        for old, fresh in list(self.dir_moves) + ([] if self.dir_moves else list(self.mapping.items())):
            for q in "\"'":
                new = new.replace(f"{q}{old}{q}", f"{q}{fresh}{q}")
        return new if new != text else None


def extra_documents(v: Vault) -> list[str]:
    """Workflow files outside the indexed notes that carry paths and links."""
    records = v.profile.get("records") or {}
    wanted = list(records.get("navigation") or []) + [records.get("workspace_map"), records.get("project_rules")]
    return [f for f in dict.fromkeys(x for x in wanted if isinstance(x, str))
            if f not in v.notes and (v.root / f).is_file()]


def _tracked(root: Path, rel: str) -> bool:
    if not (root / ".git").exists():
        return False
    try:
        out = subprocess.run(["git", "ls-files", "--", rel], cwd=root, capture_output=True)
    except OSError:
        return False
    return out.returncode == 0 and out.stdout.strip() != b""


def _move(root: Path, src: str, dst: str):
    (root / dst).parent.mkdir(parents=True, exist_ok=True)
    if _tracked(root, src) and subprocess.run(["git", "mv", src, dst], cwd=root,
                                              capture_output=True).returncode == 0:
        return
    shutil.move(str(root / src), str(root / dst))


def run(v: Vault, src: str, dst: str, check: bool = False) -> int:
    try:
        operations, mapping, dir_moves = plan_moves(v, src, dst)
    except RenameError as exc:
        print(f"error: {exc}")
        return 1
    rw = Rewriter(v, mapping, dir_moves)
    edits: dict[str, str] = {}
    for rel in v.notes + extra_documents(v):
        raw = (v.root / rel).read_bytes().decode("utf-8")
        new = rw.document(raw, rel)
        if new != raw:
            edits[rel] = new
    manifest_edits = rw.manifests()
    profile_edit = rw.profile()

    verb = "would move" if check else "moved"
    for old, new in operations:
        count = f" ({len(mapping)} files)" if dir_moves else ""
        print(f"{verb} {old} -> {new}{count}")
    touched = sorted(set(edits) | set(manifest_edits) | ({PROFILE} if profile_edit else set()))
    if touched:
        print(f"{'would rewrite' if check else 'rewrote'} references in {len(touched)} files:")
        for rel in touched:
            print(f"  {rel}")
    else:
        print("no references to rewrite")
    for item in sorted(set(rw.reminders)):
        print(f"check by hand (query block or dropped record): {item}")
    if check:
        return 0

    for rel, text in edits.items():
        (v.root / rel).write_bytes(text.encode("utf-8"))
    for rel, text in manifest_edits.items():
        v.write(rel, text)
    if profile_edit:
        (v.root / PROFILE).write_bytes(profile_edit.encode("utf-8"))
    for old, new in operations:
        _move(v.root, old, new)
    print("done; run `vault.py lint` to confirm")
    return 0
