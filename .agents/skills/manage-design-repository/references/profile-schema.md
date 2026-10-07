# Repository profile schema

`.design-workflow/profile.yml` holds everything the workflow needs to know about one repository. All paths are relative to the repository root. `assets/repository-profile.yml` is the starting point.

The profile uses a small YAML subset so that `scripts/vault.py` can read it without dependencies: nested maps, lists of scalars written inline (`[a, b]`) or as `- item` lines, and plain or quoted scalars. Do not use anchors, multi-document files or inline maps.

## Sections

### `records`

| Key | Purpose |
|---|---|
| `backlog` | The shared list of work nobody has started. |
| `edit_history` | The dated log of completed content changes. |
| `workspace_map` | Folder responsibilities. |
| `project_rules` | Constraints that apply to this repository only. |
| `templates` | Folder holding one `<class>.md` template per class. |
| `navigation` | Files whose backticked paths lint checks for existence. |

### `classes`

One entry per document class. The key is the class name used for the template file.

| Key | Purpose |
|---|---|
| `dir` | Folder that holds the class. Several classes may share a folder. |
| `type` | The `type` value its notes carry. Unique across classes. |
| `required` | Keys every note of the class must have, besides `type`. |
| `optional` | Keys the class may have. |
| `status` | Allowed lifecycle values. Omit for a class without a lifecycle. |

Keep `required` short. A field belongs there only when someone filters, groups or sorts by it.

### `fields`

Value rules for keys other than `type` and `status`: `kind` (`links`, `link`, `date`, `list`, `text`), `values` and `transitional`. See `metadata-schema.md`.

### `ignore`

| Key | Purpose |
|---|---|
| `keys` | Glob patterns for frontmatter keys owned by document tools. Lint never flags them. |
| `dirs` | Folders the workflow does not manage, such as code. |

Hidden folders are always skipped.

### `images`

| Key | Purpose |
|---|---|
| `dirs` | Folders that hold images. |
| `formats` | Allowed file extensions. |
| `max_edge` | Longest side in pixels. Larger images are resized. |
| `max_kb` | Size above which lint warns. |
| `quality` | Encoder quality for converted images. |
| `bad_names` | Regular expressions for file names that say nothing, such as hashes and clipboard names. |

### `adapters`

Names of the files under `adapters/` that describe the document tools used with this repository.

### `integrations`

Optional bridges to other systems. Each one is off unless set to `true` here and described in the project rules.

## Setup rules

- Inspect existing folders before choosing a mapping. Prefer the user's structure and terms over new folders.
- Ask only when two plausible mappings would change behavior.
- Keep gameplay rules, absolute paths, credentials and editor caches out of the profile and out of the workflow package.
- Never overwrite an existing agent instruction file. Merge a minimal pointer into it.
