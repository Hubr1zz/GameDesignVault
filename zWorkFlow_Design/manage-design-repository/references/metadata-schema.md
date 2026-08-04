# Portable metadata schema

Use lowercase keys. Keep values compatible with plain YAML, Obsidian, Tolaria, Git, and ordinary text editors.

## Inspiration

```yaml
---
status: New
category: inspiration
type: System
related:
  - "[[Related Note]]"
created: YYYY-MM-DD
---
```

Use exactly one `type`:

- `System`: rules, mechanics, processes, or systemic behavior.
- `Content`: authored events, items, characters, encounters, copy, or other concrete content.

For issue notes, retain the same schema and add:

```yaml
kind: Issue
```

## Formal design

```yaml
---
status: Draft
category: design
type: System
related: []
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

Use the repository profile to define allowed formal statuses. Use `Content` only when the formal page primarily specifies authored content rather than a system.

## Terminology

```yaml
---
status: Active
category: terminology
type: Term
related: []
location: "[[Primary Definition]]"
aliases: []
created: YYYY-MM-DD
---
```

## Example

```yaml
---
status: Draft
category: example
type: Content
related:
  - "[[Demonstrated Rule]]"
created: YYYY-MM-DD
---
```

## Rules

- Quote every wiki link stored in YAML.
- Use a YAML list for `related`, even when it contains one link.
- Use `related: []` when no relevant page exists.
- Never invent a relationship merely to avoid an empty list.
- Preserve `created`; update `updated` on material revision.
- Folder placement and frontmatter must agree. Report disagreement instead of silently reclassifying content.
- Do not add these properties to file formats that do not support YAML frontmatter.
