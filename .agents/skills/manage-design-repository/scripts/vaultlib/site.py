"""Everything the workbench reads: the index, lint results, the commit log and
thumbnails. The same data is served live by `serve` and written to disk by `export`,
so the front end only ever performs plain GET requests for static-looking paths:

    data/index.json   data/lint.json   data/log.json
    files/<vault path>                 thumbs/<image path>.webp
"""
from __future__ import annotations

import hashlib
import io
import json
import re
import shutil
import subprocess
from pathlib import Path

from . import index, lint
from .model import Vault

WORKBENCH = ".workbench"
THUMB_EDGE = 480
_CATEGORY = re.compile(r"^([^:：\s][^:：]{0,20})[:：]\s*(.+)$")


def git_log(root: Path, limit: int = 80) -> list[dict]:
    """Recent commits, with the `category: summary` prefix split out."""
    try:
        out = subprocess.run(["git", "log", f"-n{limit}", "--date=short", "--format=%h%x1f%ad%x1f%an%x1f%s"],
                             cwd=root, capture_output=True)
    except OSError:
        return []
    if out.returncode != 0:
        return []
    rows = []
    for line in out.stdout.decode("utf-8", errors="replace").splitlines():
        parts = line.split("\x1f")
        if len(parts) != 4:
            continue
        m = _CATEGORY.match(parts[3])
        rows.append({"hash": parts[0], "date": parts[1], "author": parts[2],
                     "category": m.group(1).strip() if m else None,
                     "summary": m.group(2) if m else parts[3]})
    return rows


def data(v: Vault) -> dict[str, object]:
    report = lint.check(v)
    return {
        "index.json": index.build(v),
        "lint.json": {"errors": report.count("error"), "warnings": report.count("warning"),
                      "items": [{"level": lv, "check": c, "where": w, "message": m}
                                for lv, c, w, m in sorted(report.items, key=lambda i: (i[0], i[1], i[2]))]},
        "log.json": git_log(v.root),
    }


def thumbnail(v: Vault, image: str) -> bytes | None:
    """A small WebP preview, cached outside version control. None when no smaller
    version can be made (no Pillow, vector or animated image)."""
    src = v.root / image
    if src.suffix.lower() in (".svg", ".gif"):
        return None
    stat = src.stat()
    key = hashlib.sha1(f"{image}|{stat.st_mtime_ns}|{stat.st_size}".encode("utf-8")).hexdigest()
    cache = v.root / WORKBENCH / ".cache" / "thumbs" / f"{key}.webp"
    if cache.is_file():
        return cache.read_bytes()
    try:
        from PIL import Image
    except ImportError:
        return None
    try:
        with Image.open(src) as im:
            im.load()
            if im.mode not in ("RGB", "RGBA"):
                im = im.convert("RGBA" if "A" in im.getbands() or "transparency" in im.info else "RGB")
            im.thumbnail((THUMB_EDGE, THUMB_EDGE))
            buf = io.BytesIO()
            im.save(buf, "WEBP", quality=80)
    except OSError:
        return None
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_bytes(buf.getvalue())
    return buf.getvalue()


def ensure_frontend(root: Path, build: bool = True) -> Path | None:
    """Return the built front end, building it first when its sources are newer."""
    wb = root / WORKBENCH
    dist = wb / "dist"
    if not (wb / "package.json").is_file():
        return dist if (dist / "index.html").is_file() else None
    sources = [wb / "index.html", wb / "package.json", wb / "vite.config.ts"]
    sources += [p for p in (wb / "src").rglob("*") if p.is_file()]
    built = dist / "index.html"
    stale = not built.is_file() or any(p.is_file() and p.stat().st_mtime > built.stat().st_mtime for p in sources)
    if not stale or not build:
        return dist if built.is_file() else None
    npm = shutil.which("npm")
    if not npm:
        print("npm was not found, so the workbench front end cannot be built. Install Node.js, "
              f"or run `npm install` and `npm run build` in {WORKBENCH}/ on a machine that has it.")
        return dist if built.is_file() else None
    if not (wb / "node_modules").is_dir():
        print("installing workbench dependencies (first run only)...")
        step = [npm, "ci"] if (wb / "package-lock.json").is_file() else [npm, "install"]
        if subprocess.run(step, cwd=wb).returncode != 0:
            return dist if built.is_file() else None
    print("building the workbench front end...")
    if subprocess.run([npm, "run", "build"], cwd=wb).returncode != 0:
        print("the build failed; serving the previous build if there is one")
    return dist if built.is_file() else None


def export(v: Vault, out: str, build: bool = True) -> int:
    """Write a self-contained read-only site: front end, data, notes, images, thumbnails."""
    dist = ensure_frontend(v.root, build)
    if dist is None:
        print(f"error: no built front end in {WORKBENCH}/dist")
        return 1
    target = Path(out).resolve()
    root = v.root.resolve()
    inside = target == root or root in target.parents
    if target == root or (inside and not any(p.startswith(".") for p in target.relative_to(root).parts)):
        # A visible copy inside the vault would be indexed as a second set of notes.
        print("error: export into a folder outside the vault, or a hidden folder inside it")
        return 1
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(dist, target)
    (target / "data").mkdir()
    for name, value in data(v).items():
        (target / "data" / name).write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
    images = v.images()
    for rel in v.notes + images:
        dst = target / "files" / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(v.root / rel, dst)
    for rel in images:
        dst = target / "thumbs" / (rel + ".webp")
        dst.parent.mkdir(parents=True, exist_ok=True)
        small = thumbnail(v, rel)
        dst.write_bytes(small if small is not None else (v.root / rel).read_bytes())
    (target / ".nojekyll").write_text("", encoding="utf-8")
    print(f"exported {len(v.notes)} notes and {len(images)} images to {target}")
    return 0
