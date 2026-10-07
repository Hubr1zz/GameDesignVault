"""Image conversion and manifest synchronisation."""
from __future__ import annotations

import io
import sys
from pathlib import Path

from .model import RASTER, Vault, dump_manifest

ENCODERS = {".webp": "WEBP", ".jpg": "JPEG", ".jpeg": "JPEG", ".png": "PNG"}


def _wanted(v: Vault, paths) -> list[str]:
    if not paths:
        return [f for f in v.images() if Path(f).suffix.lower() in RASTER]
    out = []
    for raw in paths:
        p = Path(raw).resolve()
        found = [p] if p.is_file() else sorted(p.rglob("*"))
        out += [f.relative_to(v.root).as_posix() for f in found
                if f.is_file() and f.suffix.lower() in RASTER]
    return out


def convert(v: Vault, paths=None, check: bool = False) -> dict[str, str]:
    """Convert or resize images that break the profile's rules.
    Returns {old path: new path} for files whose name changed."""
    rules = v.image_rules
    try:
        from PIL import Image
    except ImportError:
        wrong = [f for f in _wanted(v, paths) if rules["formats"] and Path(f).suffix.lower() not in rules["formats"]]
        if wrong:
            sys.exit(f"error: {len(wrong)} images need converting, which needs Pillow (pip install Pillow)")
        print("Pillow is not installed; image dimensions were not checked")
        return {}
    plan = []
    for rel in _wanted(v, paths):
        with Image.open(v.root / rel) as im:
            size, animated = im.size, getattr(im, "is_animated", False)
        wrong_format = bool(rules["formats"]) and Path(rel).suffix.lower() not in rules["formats"]
        too_big = bool(rules["max_edge"]) and max(size) > rules["max_edge"]
        if not animated and (wrong_format or too_big):
            plan.append((rel, Path(rel).with_suffix(".webp").as_posix() if wrong_format else rel, size))

    renames: dict[str, str] = {}
    before = after = 0
    for src, dst, (w, h) in plan:
        size = (v.root / src).stat().st_size
        before += size
        if check:
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
            fmt = ENCODERS[Path(dst).suffix.lower()]
            options = {"quality": rules["quality"], **({"method": 6} if fmt == "WEBP" else {})}
            im.save(buf, fmt, **options)
        (v.root / dst).write_bytes(buf.getvalue())
        if dst != src:
            (v.root / src).unlink()
            renames[src] = dst
        after += len(buf.getvalue())
        print(f"  {src} -> {dst}  {size // 1024} KB -> {len(buf.getvalue()) // 1024} KB")

    if check:
        if plan:
            print(f"{len(plan)} images would be converted ({before // 1048576} MB now)")
        return {}
    if not plan:
        return {}

    # Carry manifest records over to the new names before the file list is rescanned.
    manifests = {m: dict(e) for m, e in v.manifests().items() if e is not None}
    changed = set()
    for src, dst in renames.items():
        manifest, key = v.manifest_for(src, manifests)
        if manifest and key in manifests[manifest]:
            new_key = dst[len(manifest.rsplit("/", 1)[0]) + 1:]
            manifests[manifest][new_key] = manifests[manifest].pop(key)
            changed.add(manifest)
    for manifest in changed:
        v.write(manifest, dump_manifest(manifests[manifest]))
    v.rescan()

    # Point notes at the new file names. A name is rewritten only when no other
    # file still carries it, so an unrelated image can never be re-pointed.
    still_there = {f.rsplit("/", 1)[-1] for f in v.files}
    names = {Path(s).name: Path(d).name for s, d in renames.items() if Path(s).name not in still_there}
    touched = 0
    for rel in v.notes:
        raw = v.read(rel)
        new = raw
        for old, fresh in names.items():
            new = new.replace(old, fresh)
        if new != raw:
            (v.root / rel).write_bytes(new.encode("utf-8"))
            touched += 1
    v.rescan()
    print(f"{len(plan)} images converted, {before // 1048576} MB -> {after // 1048576} MB, {touched} notes updated")
    return renames


def sync_manifests(v: Vault, check: bool = False, prune: bool = False) -> int:
    """Add a record for every image that has none. Returns the number of changes."""
    rules = v.image_rules
    if not rules["manifest"]:
        return 0
    manifests = {m: dict(e) for m, e in v.manifests().items() if e is not None}
    broken = [m for m, e in v.manifests().items() if e is None]
    for m in broken:
        print(f"  skipped {m}: not a valid manifest")
    default = rules["default_status"] or (rules["status"][0] if rules["status"] else None)
    changed: dict[str, int] = {}

    for image in v.images():
        manifest, key = v.manifest_for(image, {**manifests, **{m: {} for m in broken}})
        if manifest in broken:
            continue
        if manifest is None:
            top = next(d for d in rules["dirs"] if image.startswith(d + "/"))
            manifest, key = f"{top}/{rules['manifest']}", image[len(top) + 1:]
            manifests.setdefault(manifest, {})
        if key not in manifests[manifest]:
            manifests[manifest][key] = {"status": default, "for": [], "note": ""}
            changed[manifest] = changed.get(manifest, 0) + 1
            print(f"  {'would add' if check else 'added'} {image} to {manifest}")

    present = set(v.images())
    for manifest, entries in manifests.items():
        base = manifest.rsplit("/", 1)[0]
        for key in [k for k in entries if f"{base}/{k}" not in present]:
            if prune:
                del entries[key]
                changed[manifest] = changed.get(manifest, 0) + 1
                print(f"  {'would remove' if check else 'removed'} stale record {key} from {manifest}")
            else:
                print(f"  stale record {key} in {manifest} (image missing; use --prune to remove)")

    if not check:
        for manifest in changed:
            v.write(manifest, dump_manifest(manifests[manifest]))
        if changed:
            v.rescan()
    return sum(changed.values())


def run(v: Vault, paths=None, check: bool = False, prune: bool = False) -> int:
    convert(v, paths, check)
    changes = sync_manifests(v, check, prune)
    if not changes:
        print("image manifests are up to date")
    return 0
