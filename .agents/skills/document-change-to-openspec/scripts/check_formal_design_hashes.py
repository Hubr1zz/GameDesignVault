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
    # Walk up to the repository root so the script survives being moved.
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / ".design-workflow" / "profile.yml").is_file() or (parent / ".git").exists():
            return parent
    raise SystemExit("repository root not found above " + str(here))


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


def project_implementation_status(project_root: Path, current_design_hashes: dict[str, str]) -> list[dict]:
    """Read project-side machine status and re-hash recorded code evidence."""
    changes_root = project_root / "openspec" / "changes"
    if not changes_root.exists():
        return []
    results = []
    for review_path in sorted(changes_root.glob("*/change-review.json")):
        review = json.loads(review_path.read_text(encoding="utf-8-sig"))
        evidence = []
        for item in review.get("verification", {}).get("codeEvidence", []):
            code_path = project_root / item["displayPath"]
            if not code_path.exists():
                status = "missing"
                current_hash = ""
            else:
                current_hash = sha256_bytes(code_path.read_bytes())
                status = "valid" if current_hash == item.get("fileHash", "") else "modified"
            evidence.append({
                "path": item["displayPath"],
                "status": status,
                "storedHash": item.get("fileHash", ""),
                "currentHash": current_hash,
            })
        statuses = {item["status"] for item in evidence}
        if review.get("verification", {}).get("status") != "verified":
            implementation_status = "not-verified"
        elif "missing" in statuses:
            implementation_status = "code-evidence-missing"
        elif "modified" in statuses:
            implementation_status = "code-evidence-stale"
        else:
            implementation_status = "verified-and-code-unchanged"
        stored_design_hashes = (
            review.get("sourceDocumentHashes")
            or review.get("designSourceHashes")
            or {}
        )
        if not stored_design_hashes:
            design_source_status = "not-recorded"
        elif stored_design_hashes == {
            path: current_design_hashes[path]
            for path in stored_design_hashes
            if path in current_design_hashes
        } and set(stored_design_hashes) == set(current_design_hashes):
            design_source_status = "valid"
        else:
            design_source_status = "changed"
        sync_ready = (
            implementation_status == "verified-and-code-unchanged"
            and design_source_status == "valid"
            and review.get("specSyncStatus") == "synced"
        )
        results.append({
            "changeId": review.get("changeId", review_path.parent.name),
            "title": review.get("title", ""),
            "implementationStatus": implementation_status,
            "codeReadiness": review.get("codeReadiness", ""),
            "verificationStatus": review.get("verification", {}).get("status", ""),
            "specSyncStatus": review.get("specSyncStatus", ""),
            "designSourceStatus": design_source_status,
            "implementationSynced": sync_ready,
            "syncReason": "ready" if sync_ready else (
                "design-source-hash-not-recorded" if design_source_status == "not-recorded"
                else "design-source-changed-or-missing" if design_source_status == "changed"
                else "code-evidence-or-spec-sync-incomplete"
            ),
            "codeEvidence": evidence,
            "source": str(review_path.relative_to(project_root)).replace("\\", "/"),
        })
    return results


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
    parser.add_argument(
        "--project-root",
        type=Path,
        help="Also inspect project OpenSpec change reviews and re-hash their code evidence.",
    )
    parser.add_argument(
        "--project-report",
        type=Path,
        default=Path(".agent-bridge/implementation-sync-report.json"),
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

    if args.project_root:
        project_root = args.project_root.resolve()
        project_report = {
            "schemaVersion": 1,
            "checkedAt": utc_now(),
            "projectRoot": str(project_root),
            "designReport": str(report_path.relative_to(root)).replace("\\", "/"),
            "changes": project_implementation_status(project_root, after),
        }
        write_json((root / args.project_report).resolve(), project_report)

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
