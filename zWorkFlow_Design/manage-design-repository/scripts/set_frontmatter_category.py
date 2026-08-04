#!/usr/bin/env python3
"""Set one YAML frontmatter category recursively without external dependencies."""

from __future__ import annotations

import argparse
import re
from pathlib import Path


FRONTMATTER = re.compile(r"\A---[ \t]*\r?\n(?P<body>.*?)\r?\n---[ \t]*(?P<tail>\r?\n|\Z)", re.DOTALL)
CATEGORY = re.compile(r"(?m)^category[ \t]*:[^\r\n]*$")


def update_file(path: Path, category: str, check: bool) -> bool:
    raw = path.read_bytes()
    has_bom = raw.startswith(b"\xef\xbb\xbf")
    text = raw.decode("utf-8-sig")
    newline = "\r\n" if "\r\n" in text else "\n"
    match = FRONTMATTER.match(text)

    if match:
        body = match.group("body")
        matches = list(CATEGORY.finditer(body))
        if matches:
            seen = 0

            def replace_category(_: re.Match[str]) -> str:
                nonlocal seen
                seen += 1
                return f"category: {category}" if seen == 1 else ""

            body = CATEGORY.sub(replace_category, body)
            body = re.sub(r"(?:\r?\n){3,}", newline * 2, body)
        else:
            lines = body.splitlines()
            insert_at = 1 if lines and lines[0].startswith("status:") else 0
            lines.insert(insert_at, f"category: {category}")
            body = newline.join(lines)
        replacement = f"---{newline}{body}{newline}---{match.group('tail')}"
        updated = replacement + text[match.end() :]
    else:
        updated = f"---{newline}category: {category}{newline}---{newline}{newline}{text}"

    changed = updated != text
    if changed and not check:
        encoded = updated.encode("utf-8")
        path.write_bytes((b"\xef\xbb\xbf" if has_bom else b"") + encoded)
    return changed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("category")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    if not args.directory.is_dir():
        parser.error(f"not a directory: {args.directory}")

    changed = [
        path
        for path in sorted(args.directory.rglob("*.md"))
        if update_file(path, args.category, args.check)
    ]
    action = "would update" if args.check else "updated"
    print(f"{action}: {len(changed)} file(s)")
    for path in changed:
        print(path)
    return 1 if args.check and changed else 0


if __name__ == "__main__":
    raise SystemExit(main())
