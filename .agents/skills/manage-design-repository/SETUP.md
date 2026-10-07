# Portable design-workflow setup

Copy `.agents/skills/manage-design-repository/` into another design repository, then give an agent this instruction:

> Read `.agents/skills/manage-design-repository/SETUP.md` completely and set up the design-document workflow for this repository. Preserve existing content and agent instructions. Ask only when repository paths or metadata semantics cannot be inferred safely.

## Agent setup procedure

1. Treat the directory containing `.agents/` as the repository root.
2. Read `SKILL.md`, `references/profile-schema.md` and `references/metadata-schema.md` completely.
3. Inspect existing Markdown folders, root navigation, backlog and history files, version-control status and agent instruction files. Do not read unrelated repositories.
4. Map existing folders to document classes. Prefer the existing structure. Create a default folder only when no equivalent exists.
5. Create `.design-workflow/profile.yml` from `assets/repository-profile.yml`. Replace the placeholders, the class folders and, where the repository already uses other field names, the required fields.
6. Detect the document tools in use and list their adapters in the profile. Add each adapter's tool-owned keys to `ignore.keys`.
7. Create `.design-workflow/workspace-map.md`. It describes folder responsibilities only: no templates, no workflow rules, no project lore.
8. Create `.design-workflow/project-rules.md` from `assets/project-rules.md`. Merge in project-only constraints from existing agent instructions. Do not copy workflow behavior from the skill into it.
9. Copy `assets/templates/` to `.design-workflow/templates/` and adjust each template to the profile.
10. Add the entry points described in `adapters/agents.md`. Merge `assets/AGENTS.fragment.md` into the root `AGENTS.md`. Never overwrite existing instructions.
11. Make sure the backlog folder exists. If the repository already keeps a backlog file or an edit-history file, keep it and point `records` at it; propose moving to one note per task only when several people edit the repository.
12. Run `python .agents/skills/manage-design-repository/scripts/vault.py lint` and report the result. Existing notes are not normalized during setup: list what lint found and ask before any bulk migration.
13. Do not configure a specification or engineering bridge unless the repository already has one and the user asks for it.
14. Confirm that every installed path is relative, nothing was overwritten, and no machine path or content from the source project entered the repository.

## What the package guarantees

- Markdown with YAML frontmatter stays the only source of truth, readable by any editor.
- Every rule lives in one layer: behavior in the skill, data in the profile, tool facts in an adapter.
- `scripts/vault.py lint` checks the same things for every agent and every editor, with no dependencies beyond Python.
- New formal rules pass a design-completeness review and an implementation-clarity review.

## Limits

- The skill governs agents that read it. It cannot intercept a tool or a person creating files by hand. Lint finds those cases afterwards.
- A document tool offers the templates only after they are exposed through that tool's own mechanism, described in its adapter.
