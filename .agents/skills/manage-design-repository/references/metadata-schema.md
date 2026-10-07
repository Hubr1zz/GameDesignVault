# Metadata model

Frontmatter is plain YAML that every Markdown tool can read. The profile decides which keys each class carries. This page explains what the keys mean and how values are written.

## Two standard keys

| Key | Meaning | Why it is fixed |
|---|---|---|
| `type` | The document class. Its value comes from `classes.<class>.type`. | Document tools group notes by `type`, and some never infer class from the folder. |
| `status` | The lifecycle stage. Its values come from `classes.<class>.status`. | Document tools render `status` as a filterable chip. |

A class without a `status` list has no lifecycle. Do not add `status` to its notes.

Folder and `type` must agree. A note with a managed `type` outside its class folder is misfiled: move the note, never change the type to fit.

## Field kinds

The profile's `fields` section assigns a kind to every other key.

| Kind | Written as | Example |
|---|---|---|
| `links` | YAML list of quoted wiki links, `[]` when empty | `related:` then `- "[[Combat]]"` |
| `link` | One quoted wiki link, or empty when not yet known | `location: "[[Hunter]]"` |
| `date` | `YYYY-MM-DD`, unquoted | `created: 2026-01-31` |
| `list` | YAML list of plain values | `aliases: [Tempo, 时点]` |
| `text` | A scalar. Quote it when it contains `:`, `#`, `[` or leading punctuation. | `english: "Fighting Art"` |

A field with `values` accepts only those values. A value listed under `transitional` is legal but marks unfinished work, and lint reports it as a warning until someone resolves it.

## Rules

- Keys are written exactly as the profile spells them.
- Quote every wiki link stored in YAML.
- Leave a required link field empty when the target is unknown. An empty value is visible in views and in lint. A made-up link is not.
- Keys matched by `ignore.keys` belong to a document tool. Preserve them and never author them.
- Do not add frontmatter to file formats that cannot carry it.
- Save as UTF-8 without a byte-order mark. A BOM in front of `---` hides the frontmatter from some parsers.

## Changing the schema

A schema change is one edit to the profile plus a migration of existing notes. Do both in the same change, update the templates and the views listed in the project rules, then run lint.
