# Formal design hash checking

`scripts/check_formal_design_hashes.py` compares SHA-256 fingerprints for Markdown files under
`设计文档/`. It is deliberately independent of `.agent-bridge/project-sync.json`, so it can run
while the project bridge is disabled and cannot read the Unity project.

Initialize from the last implemented revision and check the working tree:

```powershell
python zWorkFlow_Design/manage-design-repository/scripts/check_formal_design_hashes.py --baseline-from-git HEAD
```

The script writes `.agent-bridge/design-hash-baseline.json` and
`.agent-bridge/design-hash-report.json`. Exit code `0` means no changes; exit code `2` means at
least one page was added, removed, or changed. `--record-current` advances the baseline only when
that is explicitly intended.
