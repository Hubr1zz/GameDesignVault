# Workbench

A read-only web view of the vault: documents with typed backlinks, an image board and an inbox. It has no data of its own. Everything it shows comes from `vault.py`, which reads the Markdown files and the image manifests.

## Run

```
python .agents/skills/manage-design-repository/scripts/vault.py serve
```

The command builds this front end when its sources are newer than `dist/`, then serves it on `127.0.0.1` only. On Windows, `启动工作台.bat` in the repository root does the same.

## How it gets data

The front end issues nothing but relative GET requests:

| Path | Content |
|---|---|
| `data/index.json` | Notes, links, backlinks, classes and image records |
| `data/lint.json` | The lint report |
| `data/log.json` | Recent commits |
| `files/<vault path>` | A note or an image as stored |
| `thumbs/<image path>.webp` | A small preview |

`vault.py serve` answers these live. `vault.py export <folder>` writes the same paths to disk, so the build also works as a static site with no server. Keep it that way: a view that needs anything other than these paths breaks the static export.

Link resolution is never done in the browser. The index records what each link as written points to (`targets`, `hrefs`), so the page shows exactly what lint checked.

## Query blocks and tables

A page made of query blocks would otherwise be empty here, so the workbench runs the simple ones itself. `src/query.ts` accepts exactly this shape of a `dataview` block:

```
TABLE [WITHOUT ID] field [AS "Label"], ...   or   LIST
FROM "folder"
WHERE field = value AND field != null
SORT field ASC, field DESC
```

Anything else, and every `base` block, is shown as not executed, with the query text folded away and a link to the table of the folder it lists. Nothing is ever guessed: a table on the page is the exact result or it is not shown.

Each class folder also has a table view of its own (`#/table/<folder>`): every managed note there, with the class's fields as sortable columns, a text search, status filters and a filter for notes whose required fields are empty. A link to a saved view of a note tool, such as a `.base` file, leads to that table.

Links to notes carry the target's first line of prose as a tooltip, which makes every link to a term show its definition.

## Develop

```
python .agents/skills/manage-design-repository/scripts/vault.py serve --no-open
npm install
npm run dev
```

`npm run dev` proxies the data paths to the running `serve`. `npm test` runs the unit tests and `npm run build` type-checks and builds.

## Layout

| File | Responsibility |
|---|---|
| `src/data.ts` | Fetching and URL helpers |
| `src/model.ts` | Grouping, ordering and status colours, all derived from the profile |
| `src/markdown.ts` | Rendering a note body: wiki links, values, query blocks |
| `src/query.ts` | Parsing and running the supported query shape |
| `src/router.ts` | Hash routes |
| `src/components/` | Sidebar, note page with relations, folder table, image board, inbox |
