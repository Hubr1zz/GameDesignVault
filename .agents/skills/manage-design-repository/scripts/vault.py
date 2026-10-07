#!/usr/bin/env python3
"""Deterministic tooling for a Markdown design repository.

    python vault.py lint                    validate notes, links, navigation and images
    python vault.py context <note>          everything linked to and from one note
    python vault.py rename <old> <new>      move or rename, rewriting every reference
    python vault.py images [paths]          convert new images and update manifests
    python vault.py index [--out FILE]      dump the whole link graph as JSON
    python vault.py serve                   open the read-only workbench in a browser
    python vault.py export <folder>         write the workbench as a static site

Everything project-specific comes from `.design-workflow/profile.yml`. Only the
standard library is needed, except that converting images needs Pillow.
The implementation lives in the `vaultlib` package next to this file.
"""
from __future__ import annotations

import argparse
import sys

from vaultlib import images, index, lint, rename, serve, site
from vaultlib.model import Vault, find_root


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("lint", help="validate notes, links, navigation and images")
    p.add_argument("--quiet", action="store_true", help="show errors only")

    p = sub.add_parser("context", help="show what links to and from one note")
    p.add_argument("note", help="path, file name or a unique part of either")
    p.add_argument("--json", action="store_true", help="machine-readable output")

    p = sub.add_parser("rename", help="move or rename a file or folder and rewrite references")
    p.add_argument("old", help="path, file name or a unique part of either")
    p.add_argument("new", help="new path; a bare name renames in place, a trailing / moves into a folder")
    p.add_argument("--check", action="store_true", help="report without changing anything")

    p = sub.add_parser("images", help="convert images that break the rules and update manifests")
    p.add_argument("paths", nargs="*", help="files or folders (default: the profile's image dirs)")
    p.add_argument("--check", action="store_true", help="report without changing anything")
    p.add_argument("--prune", action="store_true", help="remove manifest records whose image is gone")

    p = sub.add_parser("index", help="dump the link graph as JSON")
    p.add_argument("--out", help="write to this file instead of standard output")

    p = sub.add_parser("serve", help="serve the read-only workbench on this machine")
    p.add_argument("--port", type=int, default=8765, help="first port to try (default 8765)")
    p.add_argument("--no-open", action="store_true", help="do not open a browser")
    p.add_argument("--no-build", action="store_true", help="do not rebuild the front end")

    p = sub.add_parser("export", help="write the workbench as a static, read-only site")
    p.add_argument("folder", help="output folder, outside the vault or hidden inside it")
    p.add_argument("--no-build", action="store_true", help="do not rebuild the front end")

    args = parser.parse_args()
    v = Vault(find_root())
    if args.cmd == "lint":
        return lint.run(v, args.quiet)
    if args.cmd == "context":
        return index.run_context(v, args.note, args.json)
    if args.cmd == "rename":
        return rename.run(v, args.old, args.new, args.check)
    if args.cmd == "images":
        return images.run(v, args.paths, args.check, args.prune)
    if args.cmd == "serve":
        return serve.run(v, args.port, not args.no_open, not args.no_build)
    if args.cmd == "export":
        return site.export(v, args.folder, not args.no_build)
    return index.run_index(v, args.out)


if __name__ == "__main__":
    sys.exit(main())
