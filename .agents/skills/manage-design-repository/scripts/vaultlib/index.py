"""The derived link graph: every note, its outgoing links, its backlinks and the
images attached to it. Nothing here is stored in the repository; rebuild it at will."""
from __future__ import annotations

import datetime
import fnmatch
import json

from .model import HEADING, MDLINK, WIKILINK, Vault, segments, strip_code


def _note_entry(v: Vault, rel: str) -> dict:
    fm, body = v.note(rel)
    fm = fm if isinstance(fm, dict) and not fm.get("__unparsable__") else {}
    prose = "".join(chunk for kind, chunk in segments(body) if kind != "fence")
    headings = [{"level": len(h), "text": t} for h, t in HEADING.findall(prose)]
    title = next((h["text"] for h in headings if h["level"] == 1), rel.rsplit("/", 1)[-1][:-3])
    key, _ = v.spec_for_type(fm.get("type"))
    managed = key if key and v.dir_of(rel) == v.classes[key]["dir"].strip("/") else None

    links, unresolved, seen = [], [], set()

    def add(target: str, via: str, anchor=None):
        path, _ = v.resolve(target.rstrip("\\").strip(), rel)
        if path is None:
            unresolved.append(target)
        elif path != rel and (path, via) not in seen:
            seen.add((path, via))
            links.append({"target": path, "via": via, **({"anchor": anchor[1:]} if anchor else {})})

    for field, value in fm.items():
        for item in value if isinstance(value, list) else [value]:
            if isinstance(item, str):
                for m in WIKILINK.finditer(item):
                    add(m.group(2), field, m.group(3))
    text = strip_code(body)
    for m in WIKILINK.finditer(text):
        add(m.group(2), "body", m.group(3))
    for m in MDLINK.finditer(text):
        path = v.resolve_href(m.group(3), rel)
        if path and path != rel and (path, "body") not in seen:
            seen.add((path, "body"))
            links.append({"target": path, "via": "body"})

    return {"title": title, "class": managed, "type": fm.get("type"), "status": fm.get("status"),
            "frontmatter": fm, "headings": headings, "links": links, "unresolved": unresolved}


def build(v: Vault) -> dict:
    notes = {rel: _note_entry(v, rel) for rel in v.notes}
    images = {}
    for image in v.images():
        manifest, _, record = v.image_record(image)
        record = record or {}
        targets = []
        for item in record.get("for") or []:
            m = WIKILINK.fullmatch(item.strip()) if isinstance(item, str) else None
            path = v.resolve(m.group(2), manifest or image)[0] if m else None
            if path:
                targets.append(path)
        images[image] = {"manifest": manifest, "status": record.get("status"), "for": targets,
                         "note": record.get("note") or "", "kb": (v.root / image).stat().st_size // 1024}

    backlinks: dict[str, list[dict]] = {}
    for rel, entry in notes.items():
        for link in entry["links"]:
            backlinks.setdefault(link["target"], []).append({"source": rel, "via": link["via"]})
    for image, entry in images.items():
        for target in entry["for"]:
            backlinks.setdefault(target, []).append({"source": image, "via": "for"})

    classes = {key: {"type": spec["type"], "dir": spec["dir"], "label": spec.get("label") or spec["type"],
                     "status": spec.get("status") or []} for key, spec in v.classes.items()}
    return {"generated": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
            "project": v.profile.get("project_name"), "classes": classes,
            "image_status": v.image_rules["status"], "notes": notes, "images": images, "backlinks": backlinks}


def _name(path: str) -> str:
    name = path.rsplit("/", 1)[-1]
    return name[:-3] if name.lower().endswith(".md") else name


def context(v: Vault, path: str, index: dict | None = None) -> str:
    """Everything an editor needs before touching one note, as plain text."""
    index = index or build(v)
    notes, images = index["notes"], index["images"]
    entry = notes[path]
    order = {key: i for i, key in enumerate(index["classes"])}
    label = lambda key: index["classes"][key]["label"] if key else "Other"
    out = [f"# {entry['title']}", f"{path} · {entry['type'] or 'no type'}"
           + (f" · {entry['status']}" if entry["status"] else "")]

    meta = {k: val for k, val in entry["frontmatter"].items() if k not in ("type", "status")
            and not any(fnmatch.fnmatch(k, p) for p in v.ignore_keys)}
    if meta:
        show = lambda val: ", ".join(map(str, val)) if isinstance(val, list) else ("" if val is None else val)
        out += ["", "## Fields"] + [f"- {k}: {show(val)}" for k, val in meta.items()]

    outline = [h for h in entry["headings"] if h["level"] <= 3
               and not (h["level"] == 1 and h["text"] == entry["title"])]
    if outline:
        out += ["", "## Outline"] + [f"{'  ' * (h['level'] - 1)}- {h['text']}" for h in outline]

    if entry["links"]:
        out += ["", "## Links out"]
        groups: dict[str, list[str]] = {}
        for link in entry["links"]:
            target = notes.get(link["target"])
            groups.setdefault(label(target["class"]) if target else "File", []).append(
                _name(link["target"]) + (f"#{link['anchor']}" if link.get("anchor") else ""))
        for group, names in groups.items():
            out.append(f"- {group}: {', '.join(sorted(set(names)))}")
    if entry["unresolved"]:
        out += ["", "## Broken links"] + [f"- [[{t}]]" for t in entry["unresolved"]]

    incoming = [b for b in index["backlinks"].get(path, []) if b["source"] in notes]
    if incoming:
        out += ["", "## Linked from"]
        by_source: dict[str, list[str]] = {}
        for b in incoming:
            by_source.setdefault(b["source"], []).append(b["via"])
        groups = {}
        for source, vias in by_source.items():
            groups.setdefault(notes[source]["class"], []).append((source, vias))
        for key in sorted(groups, key=lambda k: order.get(k, len(order))):
            statuses = index["classes"][key]["status"] if key else []
            rank = lambda item: (statuses.index(notes[item[0]]["status"])
                                 if notes[item[0]]["status"] in statuses else len(statuses), item[0])
            out.append(f"### {label(key)} ({len(groups[key])})")
            how = lambda vias: ", ".join(x for x in vias if x != "body") or "mentions"
            if statuses:
                for source, vias in sorted(groups[key], key=rank):
                    status = notes[source]["status"]
                    out.append(f"- {'[' + status + '] ' if status else ''}{_name(source)} ({how(vias)})")
            else:  # no lifecycle: one line per kind of link keeps long lists short
                by_how: dict[str, list[str]] = {}
                for source, vias in groups[key]:
                    by_how.setdefault(how(vias), []).append(_name(source))
                out += [f"- {', '.join(sorted(names))} ({kind})" for kind, names in by_how.items()]

    attached = [(img, images[img]) for img in sorted(images) if path in images[img]["for"]]
    if attached:
        out += ["", f"## Images ({len(attached)})"]
        out += [f"- [{e['status']}] {img}" + (f" — {e['note']}" if e["note"] else "") for img, e in attached]
    return "\n".join(out) + "\n"


def run_index(v: Vault, out: str | None = None) -> int:
    data = json.dumps(build(v), ensure_ascii=False, indent=1)
    if out:
        with open(out, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(data)
        print(f"index written to {out}")
    else:
        print(data)
    return 0


def run_context(v: Vault, query: str, as_json: bool = False) -> int:
    path, candidates = v.find(query)
    if path is None or not path.lower().endswith(".md"):
        if candidates:
            print(f"`{query}` matches {len(candidates)} files; be more specific:")
            for c in candidates[:20]:
                print(f"  {c}")
        else:
            print(f"no note matches `{query}`")
        return 1
    index = build(v)
    if as_json:
        print(json.dumps({"path": path, **index["notes"][path],
                          "backlinks": index["backlinks"].get(path, [])}, ensure_ascii=False, indent=1))
    else:
        print(context(v, path, index), end="")
    return 0
