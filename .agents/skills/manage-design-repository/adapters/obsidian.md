# Adapter: Obsidian

Read this when the profile lists `obsidian` and the task touches Obsidian views, templates or configuration, or you meet a key or file you do not recognize.

## What Obsidian reads

| Item | Effect in Obsidian |
|---|---|
| `aliases`, `tags`, `cssclasses` | Reserved properties with fixed types. The profile's `ignore.keys` should list them. Use `aliases` for alternative names of a term. |
| Any other frontmatter key | A property. Its display type is stored in `.obsidian/types.json`. |
| `[[Note]]`, `[[Note#Heading]]`, `[[Note\|label]]` | Wiki links, resolved by file name first. A file that is not Markdown needs its extension: `[[Board.base]]`. |
| Folder and file name | The note's identity. Obsidian ignores the H1 for naming. |

## What Obsidian writes

- `.obsidian/workspace.json` changes whenever the window layout changes. Keep it out of version control.
- Moving or renaming a note inside Obsidian rewrites links to it. Moves made by an agent or a shell do not, so repair links yourself and run lint.
- Editing a property in the panel may reorder keys or change quoting. Treat that as noise, not as a schema change.

## Tool-owned files

| Path | What it is | Rule |
|---|---|---|
| `.obsidian/` | Application and plugin configuration. | Do not edit unless the user asks for a configuration change. |
| `*.base` | Bases views: tables and cards over frontmatter. | Projections. Update column and filter names when the schema changes. |
| `dataview` code blocks | Queries over frontmatter. | Projections. They break silently when a key is renamed, so search for the old key name after any rename. |
| `*.canvas` | Canvas boards. | Not managed notes. |

## Consequences for the workflow

- Hidden folders are not indexed, so `.design-workflow/` and `.agents/` stay out of the file tree.
- The core Templates plugin reads only a visible folder. To offer templates inside Obsidian, copy `templates/` to a visible folder and point the plugin at it. Do this only when the user asks.
- Keys that views depend on should stay stable. The project rules list them.
