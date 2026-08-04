# Workspace Map - GameDesignVault

This vault is the authoritative source of truth for the "Hunting in Darkness" game design project.
Use the local Markdown files, folder structure, wiki links, and optional YAML frontmatter. Do not
treat Notion databases, exports, or remote copies as authoritative unless the user explicitly says to
compare or import them.

## Root Files

| Path | Responsibility |
|---|---|
| `README.md` | Human-facing vault overview and quick navigation. |
| `INDEX.md` | Lightweight top-level index or Dataview entry point. |
| `修改历史.md` | Chronological change notes for major design/vault updates. |
| `待办清单.md` | Shared backlog for not-started documentation and design tasks. |
| `术语词典.md` | Aggregate terminology index. Prefer individual pages in `术语词典/` for definitions. |
| `灵感列表.base` | Obsidian Bases view for listing notes in `灵感库/`. |

## Main Directories

| Path | Responsibility |
|---|---|
| `设计文档/` | Formal game design documents: core systems, phase rules, world setting, shared mechanics, and accepted design. |
| `灵感库/` | Inbox and working library for ideas, mechanics, issues, UX notes, art/design inspiration, and unresolved questions. New ideas go here first. |
| `术语词典/` | One Markdown page per stable game term. Term pages define meaning and link back to primary design locations. |
| `内容设计案例/` | Concrete content examples, such as monsters, events, narrative samples, map objects, and resource point cases. |
| `美术参考/` | Image references and visual material used by design notes. |
| `Agent维护/` | Agent-facing maintenance files: the project skill and workspace map. |
| `.obsidian/` | Obsidian configuration. Do not edit unless the user asks for vault/app configuration changes. |

## Design Documents

`设计文档/` contains accepted or semi-formal design material. Current major areas include:

| Path | Responsibility |
|---|---|
| `设计文档/Design Essentials & Challenges.md` | High-level design pillars, risks, constraints, and challenges. |
| `设计文档/World settings 世界观设定.md` | World setting and narrative background. |
| `设计文档/通用/` | Shared systems such as hunter, events, items, and keyword system. |
| `设计文档/决战阶段 Showdown Phase/` | Showdown/combat phase documents and combat-system rules. |
| `设计文档/狩猎阶段 Hunt Phase/` | Hunt phase, map exploration, and related travel/exploration rules. |
| `设计文档/营地阶段 Settlement Phase/` | Settlement phase systems, timeline, invention, workshop, and workshop subpages. |

## Inspiration Library

Create new notes in `灵感库/` as `.md` files. Prefer this frontmatter for new notes:

```yaml
---
status: New
category: inspiration
type: Content
related:
  - "[[相关文档]]"
created: YYYY-MM-DD
---
```

Use exactly one `type`: `Content` for concrete authored content such as items, copy, or events, and
`System` for game-rule and mechanic changes. Do not use `Inspiration` as a type. For problem notes,
use `category: inspiration` plus `kind: Issue`. In `related`, prefer the unique note basename (for example `[[C]]`) and
only include a path when duplicate basenames make the short link ambiguous.

Use the body for summary, related systems, design questions, risks, conflicts, and decisions.

## Terminology Dictionary

Create one page per term in `术语词典/`. Preferred structure:

```yaml
---
中文: "术语"
english: ""
location: "[[设计文档/主要定义位置]]"
aliases: []
---

# 术语

Definition...
```

Rules:

- Link terms from design docs and inspirations with `[[术语]]` or `[[术语|显示文本]]`.
- The `location` field points to the primary definition or main usage document.

## Content Design Examples

`内容设计案例/` stores examples that test or demonstrate the formal systems:

| Example Type | Typical Location |
|---|---|
| Event examples | `内容设计案例/事件.md` and related pages |
| Monster examples | `内容设计案例/怪物 -例子.md` |
| Map object examples | `内容设计案例/地图物件 -例子Example Map Objects.md` |
| Narrative examples | `内容设计案例/叙事.md` |
| Resource point examples | `内容设计案例/石森林资源点案例.md` |

When an example implies a rule change, record that as an inspiration or update the relevant design
doc only with user approval.

## Hierarchy And Linking

Use these mechanisms instead of Notion relations:

- folders for broad domains;
- Markdown headings for local structure;
- Obsidian wiki links for cross-document references;
- optional YAML frontmatter for lightweight metadata.

## Conflict Handling

When local, exported, remote, or user-provided versions disagree:

1. Pause before writing.
2. List the differences by source/path.
3. Ask the user which version to keep or how to merge.
4. Apply the chosen version after confirmation.
