# Portable design-workflow setup

Give an agent this instruction after copying `.agents/skills/manage-design-repository/` into another design repository:

> Read `.agents/skills/manage-design-repository/SETUP.md` completely and set up the portable design-document workflow for this repository. Preserve existing content and agent instructions. Ask only when repository paths or metadata semantics cannot be inferred safely.

## Agent setup procedure

1. Treat the directory containing `.agents/` as the target repository root.
2. Read `manage-design-repository/SKILL.md` and `references/profile-schema.md` completely.
3. Inspect existing Markdown directories, root navigation, backlog/history files, version-control status, and agent instruction files. Do not read unrelated external repositories.
4. Map existing directories to formal design, inspirations, terminology, examples, and references. Prefer existing structure; create generic defaults only when no equivalent exists.
5. Create `.design-workflow/` as the target repository's project-specific configuration folder.
6. Create `.design-workflow/profile.yml` from `manage-design-repository/assets/repository-profile.yml`, replacing placeholders and paths with repository-relative values.
7. Create `.design-workflow/workspace-map.md` describing responsibilities, not project lore. Do not copy examples or names from the source repository.
8. Create `.design-workflow/project-rules.md` from `manage-design-repository/assets/project-rules.md`, then merge in project-specific constraints from existing agent instructions. Preserve those constraints; do not copy portable workflow instructions into the project file.
9. Merge the contents of `manage-design-repository/assets/AGENTS.fragment.md` into the repository's root `AGENTS.md`. Keep the root entry thin: it should point to the portable Skill, which loads `.design-workflow/`. Never overwrite existing instructions.
10. If a legacy project-specific instruction folder exists, migrate its rules and map into `.design-workflow/`, update inbound references, verify the result, and remove the legacy files only after they are no longer needed.
11. Ensure the configured backlog and edit-history files exist. Preserve pre-existing formats when they provide the same function.
12. If Tolaria is detected or requested, expose templates through supported Type documents or template settings. If Obsidian is detected or requested, copy the templates to its configured template folder. Do not install plugins or change editor settings without permission.
13. Do not configure an engineering/specification bridge unless the target repository already contains one and the user explicitly requests it. Keep it optional and proposal-only by default.
14. Validate that all installed paths are relative, all required files exist, no existing content was overwritten, and no machine-specific path or source-project content entered the target repository.

## Portable guarantees

- Markdown plus YAML frontmatter remains the canonical data shared by compatible editors.
- Agent-generated managed notes receive class-specific metadata and wiki-link relationships.
- New formal rules pass design-completeness and implementation-clarity reviews.
- Inspirations, issues, terms, examples, backlog, history, conflict handling, and optional integrations remain available without requiring a particular editor.

## Limits

- The Skill governs agents that read the installed instructions; it cannot intercept unsupported tools or purely manual file creation.
- Manual creation receives the same defaults only when the editor supports and uses the supplied templates.
- Existing notes are not silently normalized during setup. Report inconsistencies and request approval before bulk migration.
