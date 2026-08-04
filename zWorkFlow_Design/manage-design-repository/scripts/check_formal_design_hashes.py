#!/usr/bin/env python3
"""Detect changes to formal design pages without asking an agent to compare prose.

The manifest is intentionally separate from the OpenSpec bridge. It can be used while
the bridge is disabled and never reads the configured project repository.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def current_files(root: Path) -> dict[str, str]:
    files = {}
    design_dir = root / "设计文档"
    for path in sorted(design_dir.rglob("*.md")):
        files[path.relative_to(root).as_posix()] = sha256_bytes(path.read_bytes())
    return files


def git_revision(root: Path) -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=root, text=True, encoding="utf-8"
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return ""


def git_files(root: Path, revision: str) -> dict[str, str]:
    names = subprocess.check_output(
        ["git", "-c", "core.quotePath=false", "ls-tree", "-r", "--name-only", revision],
        cwd=root,
        text=True,
        encoding="utf-8",
    ).splitlines()
    result = {}
    for name in names:
        if not name.startswith("设计文档/") or not name.endswith(".md"):
            continue
        data = subprocess.check_output(["git", "show", f"{revision}:{name}"], cwd=root)
        result[name] = sha256_bytes(data)
    return result


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, default=Path(".agent-bridge/design-hash-baseline.json"))
    parser.add_argument("--report", type=Path, default=Path(".agent-bridge/design-hash-report.json"))
    parser.add_argument(
        "--baseline-from-git",
        metavar="REVISION",
        help="Create a baseline from a Git revision before checking the working tree.",
    )
    parser.add_argument(
        "--record-current",
        action="store_true",
        help="Record the current working tree as the new baseline after checking.",
    )
    args = parser.parse_args()
    root = repo_root()
    baseline_path = (root / args.baseline).resolve()
    report_path = (root / args.report).resolve()

    if args.baseline_from_git:
        baseline_files = git_files(root, args.baseline_from_git)
        baseline = {
            "schemaVersion": 1,
            "createdAt": utc_now(),
            "source": {"type": "git", "revision": args.baseline_from_git},
            "documents": baseline_files,
        }
        write_json(baseline_path, baseline)
    elif not baseline_path.exists():
        parser.error(f"baseline not found: {baseline_path}; use --baseline-from-git or --record-current")

    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    before = baseline.get("documents", {})
    after = current_files(root)
    changed = sorted(path for path in set(before) & set(after) if before[path] != after[path])
    added = sorted(set(after) - set(before))
    removed = sorted(set(before) - set(after))
    report = {
        "schemaVersion": 1,
        "checkedAt": utc_now(),
        "baseline": str(baseline_path.relative_to(root)).replace("\\", "/"),
        "source": baseline.get("source", {}),
        "changed": changed,
        "added": added,
        "removed": removed,
        "hasChanges": bool(changed or added or removed),
    }
    write_json(report_path, report)

    if args.record_current:
        write_json(
            baseline_path,
            {
                "schemaVersion": 1,
                "createdAt": utc_now(),
                "source": {"type": "working-tree", "revision": git_revision(root)},
                "documents": after,
            },
        )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 2 if report["hasChanges"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
