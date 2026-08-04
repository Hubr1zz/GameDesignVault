# Repository profile schema

Store target-specific configuration at `.design-workflow/profile.yml`. Resolve all paths relative to the repository root.

```yaml
schema_version: 1
project_name: "PROJECT_NAME"
language: "PROJECT_LANGUAGE"
source_of_truth: markdown
paths:
  formal_design: "design-docs"
  inspirations: "inspirations"
  terminology: "glossary"
  examples: "design-examples"
  references: "references"
  workspace_map: ".design-workflow/workspace-map.md"
  backlog: "BACKLOG.md"
  edit_history: "EDIT_HISTORY.md"
metadata:
  inspiration_category: inspiration
  formal_category: design
  terminology_category: terminology
  example_category: example
  system_type: System
  content_type: Content
  issue_kind: Issue
integrations:
  obsidian: false
  tolaria: false
  external_spec_bridge: false
```

## Setup rules

- Inspect existing directories before choosing mappings.
- Prefer existing user terminology and structure over creating duplicate folders.
- Ask only when two plausible mappings would materially change behavior.
- Create missing support files only after the mapping is clear.
- Never store absolute paths, credentials, machine usernames, editor caches, or project-specific gameplay rules in the portable package.
- Treat integrations as optional. Configure only detected, supported tools requested by the user.
- Never overwrite an existing root agent instruction file; merge a minimal pointer after reading it.
