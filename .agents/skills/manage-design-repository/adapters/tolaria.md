# Adapter: Tolaria

Read this when the profile lists `tolaria` and the task touches Tolaria's views or type documents, or you meet a key or file you do not recognize. Source: Tolaria's `docs/ABSTRACTIONS.md`.

## What Tolaria reads

| Frontmatter | Effect in Tolaria |
|---|---|
| `type` | The note's type: a chip in the note list and a group in the sidebar. Tolaria never infers type from the folder. |
| `status` | A colored lifecycle chip. |
| Any key whose values contain `[[wiki links]]` | A relationship. `related`, `location` and similar fields appear as relationships without configuration. |
| `icon`, `url`, `date`, `start_date`, `end_date`, `goal`, `result` | Built-in display fields. Avoid these names for other meanings. |

The title is the first `# H1` on the first non-empty body line, then the file name.

## What Tolaria writes

- Keys that start with `_` are system properties (`_organized`, `_pinned_properties`, `_icon`, `_width` and others). The profile's `ignore.keys` should contain `_*`. Preserve them exactly and never author them.
- New notes are created at the repository root. A root note that carries a managed `type` is waiting to be filed: move it into its class folder. Lint reports these as `placement` errors.
- A user may set or clear `type` from the properties panel. A `type` that the profile does not know, on a note inside a class folder, is a lint error to fix in the file.

## Tool-owned files

| Path | What it is | Rule |
|---|---|---|
| Root notes with `type: Type` | Type documents: icon, color, sidebar label and the new-note template for one type. | Optional. Not managed notes. Edit only when asked. |
| `views/*.yml` | Saved views. | Projections. Update the field names they filter on when the schema changes. |
| `attachments/` at any depth | Asset folders. Markdown inside is treated as an asset, not a note. | Do not store managed notes there. |

## Consequences for the workflow

- Hidden folders are not indexed, so `.design-workflow/` and `.agents/` stay out of the note list.
- Every Markdown file in a visible folder is indexed as a note, including files inside code folders. Keep code and dependency folders out of the repository when the note count matters.
- `AGENTS.md` at the root is the guidance Tolaria hands to its AI features.
- To offer a class template inside Tolaria, create a type document for that class and copy the body of `templates/<class>.md` into it. Do this only when the user asks.
