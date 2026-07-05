---
name: gamedesignvault-manager
description: >
  Manage the "GameDesignVault" Markdown/Obsidian workspace for the game design project
  "Hunting in Darkness". Use this skill whenever the user wants to read, edit, reorganize,
  or create local Markdown design documents; record new inspirations or issues; add or link
  terminology; maintain folders, wiki links, and optional YAML frontmatter; resolve conflicts
  between local, exported, and remote content; maintain the shared pending-work backlog in
  `待办清单.md`; or summarize completed project-content edits in `修改历史.md`. Trigger on
  phrases such as "new idea/inspiration", "record this", "add term/terminology",
  "reorganize docs", "update the design doc", and Chinese phrases including "我有新的灵感"、
  "我想到了"、"有个新想法"、"我有个想法"、"修改XXX机制"、"新机制"、"我们讨论一下"、"记录一下"。
  When the user proposes a design, always perform both a game-design completeness review and an
  implementation-clarity review in the conversation before updating formal design documents.
---

# GameDesignVault Markdown Manager

Operate on the local `GameDesignVault` Markdown vault. The authoritative source of truth is the
Markdown files in this repository, not any Notion database, exported archive, or remote copy.

## Before You Start

1. Read `Agent维护/workspace-map.md` to understand the folder map and document responsibilities.
2. Read `待办清单.md` before editing so you know which follow-up tasks are already tracked.
3. Inspect the current files with `rg --files` and search content with `rg` before editing.
4. Treat Obsidian wiki links (`[[Page]]`, `[[folder/Page|label]]`) and folder structure as the
   primary document graph. YAML frontmatter is optional metadata, not the hierarchy itself.
5. Check `git status --short` before larger edits. If existing unrelated changes are present, leave
   them alone.

## Mandatory Pre-Edit Review

When the user proposes a new design, mechanic, workflow, content rule, or structural rule change,
complete the following reviews in the conversation before updating any formal file under `设计文档/`.

### 1. Game Designer Review

Review the idea as a professional game designer first. Check whether the design is:

- complete enough to stand on its own;
- functionally closed rather than only a fragment;
- harmonious with existing systems, pacing, incentives, and player experience;
- clear about rewards, penalties, and failure consequences.

In the conversation, summarize:

- `设计完整性问题`
- `相关内容`

For `相关内容`, only list relevant current content titles, preferably as wiki-link style references.
Do not add extra analysis there unless an actual conflict exists.

### 2. Implementation Review

Review the same idea as a programmer or systems implementer. Check whether the design is:

- specified enough to implement without inventing core behavior;
- clear about triggers, inputs, outputs, states, transitions, and edge cases;
- explicit enough for UI, data, content scripting, and rule execution.

This review should appear in the conversation when:

- the user wants to promote the idea into formal design documents;
- the user asks to finalize or formalize the rule;
- the requested edit would materially change `设计文档/`.

Do not record Implementation Review details inside inspiration notes.

### Blocking Rule

If either review finds unresolved gaps, do not update formal design documents yet.

Instead:

1. Present the gaps to the user in the conversation.
2. Separate them into:
   - `设计完整性问题`
   - `实现不清晰问题`
3. Wait for clarification, or record the idea in `灵感库/` if the user wants it saved before it is
   fully resolved.

Only update `设计文档/` after both reviews pass or the user explicitly tells you to document it as a
draft with known gaps.

## Core Workflows

### 1. Add a New Inspiration

When the user shares a new idea, mechanic, content seed, UX note, art reference, or unresolved design
question:

1. Search `设计文档/`, `灵感库/`, `术语词典/`, and `内容设计案例/` for related concepts.
2. Run the Game Designer Review in the conversation.
3. Create a new `.md` file under `灵感库/` with a concise Chinese title unless the user requests an
   English title. Use a filename that can stand alone in Obsidian.
4. Add YAML frontmatter. Prefer:

   ```yaml
   ---
   status: New
   category: Design
   type: Content
   related:
     - "[[相关文档]]"
   created: YYYY-MM-DD
   ---
   ```

   Set `type` to exactly one of:
   - `Content` for concrete game content, such as a specific item, line of text, character, event,
     encounter, or other authored content;
   - `System` for a change to or definition of game rules, mechanics, procedures, or systemic
     behavior.

   Do not use `Inspiration` as a `type`; being stored in `灵感库/` already identifies the note as an
   inspiration-library entry.

5. In the body, record only:
   - the user's idea summary;
   - current design conflicts, if any.
6. You may refine, condense, or clarify the user's wording when recording, as long as you do not
   change the intended meaning.
7. Do not record design-goal analysis, passed checks, implementation review details, suggestions, or
   open decomposition questions inside the inspiration note.
8. Do not directly merge a fresh inspiration into formal `设计文档/` unless the user explicitly asks.
   New ideas go to `灵感库/` first.

### 2. Add a New Issue

When the user reports a problem, contradiction, unclear rule, balance concern, or production risk:

1. Prefer creating an issue-style Markdown note in `灵感库/` with `category: 问题Issue` and
   `status: New`.
2. Treat requests such as “记录问题”, “记下这个问题”, “这个设计不好但还没想好怎么改”, and
   equivalent wording as issue-recording requests, not ordinary idea-recording requests.
3. Link affected documents in `related`.
4. Record evidence, suspected cause, possible fixes, and open questions.
5. If the issue belongs directly inside a design doc, add a short `待解决` or `Open Questions`
   section only when the user asks to update that document.

### 3. Add Terminology

When the user defines a new game term, or a design doc uses a recurring term that needs a stable
definition:

1. Search `术语词典/` to confirm whether the term already exists.
2. If absent, create `术语词典/<术语>.md` with YAML frontmatter:

   ```yaml
   ---
   中文: "术语"
   english: ""
   location: "[[设计文档/主要定义位置]]"
   aliases: []
   ---
   ```

3. The page body should start with `# 术语` and then give the definition, usage notes, related
   systems, and links back to primary design documents.
4. Link the first meaningful occurrence in design or inspiration text back to the term with
   `[[术语]]` or `[[术语|显示文本]]`.

### 4. Update Design Documents

When editing `设计文档/`:

1. Read the target file and nearby related files first.
2. If the edit changes design meaning rather than just wording or links, run both the Game Designer
   Review and the Implementation Review in the conversation first.
3. Preserve the user's wording unless the requested change requires rewriting it.
4. Use wiki links for cross-document references and term references.
5. Use folders, headings, and wiki links for hierarchy. Do not recreate Notion-style relation trees.
6. If adding optional YAML frontmatter, keep it small and useful, such as `status`, `type`, `phase`,
   `related`, or `updated`.
7. When moving or renaming files, update obvious inbound links and any curated navigation pages.

### 5. Query / Read Design Content

When the user asks about existing design:

1. Search with `rg` across the relevant directories.
2. Read the exact Markdown files before answering.
3. Summarize the relevant rule, note whether it is formal design (`设计文档/`), inspiration
   (`灵感库/`), terminology (`术语词典/`), or example content (`内容设计案例/`), and mention any
   conflicts or open questions you notice.

### 6. Maintain The Pending Backlog

After every document-editing request:

1. Re-open `待办清单.md`.
2. Remove items that were fully completed by the current edit.
3. Add any newly discovered, clearly scoped, not-started follow-up tasks.
4. Keep entries concise and action-oriented.
5. Do not use the backlog for already completed work, vague ideas with no next action, or issues
   that are still being actively edited in the same request.

### 7. Maintain Edit History

After every successful modification to project content:

1. Re-open `修改历史.md`.
2. Add a concise summary row for that turn's completed edits.
3. Fill in both `分类` and `内容`.
4. Use the current date.
5. Group closely related edits into one row when that is easier to read.
6. Do not add planned work, failed attempts, or purely conversational review notes.
7. Do not record meta-maintenance changes outside the design project itself, such as updates to
   `Agent维护/`, skill rules, or other workflow-only changes.

Recommended categories include:

- `决战战斗`
- `探索狩猎`
- `营地建设`
- `美术`
- `叙事设定`
- `UI/表现`
- `术语词典`
- `文档整理`
- `其他`

## Version Conflict Rule

If local files, exported content, remote content, or user-provided snippets disagree:

1. Do not silently choose one version.
2. List the differences with file/source names and the conflicting text or meaning.
3. Ask the user which version to keep or how to merge.
4. Only apply edits after the user chooses, unless the conflict is purely formatting and the intended
   content is unambiguous.

## Important Rules

- Markdown files in `GameDesignVault` are the source of truth.
- Do not use Notion tools or Notion database IDs for normal work in this vault.
- New ideas always enter `灵感库/` first unless the user explicitly asks to update formal design docs.
- When recording user ideas or rules, you may improve phrasing and extract the core meaning as long
  as the content itself does not change.
- Term definitions live in `术语词典/`; references should link back with `[[术语]]`.
- Hierarchy is maintained through folders, headings, and wiki links, with optional YAML frontmatter
  for metadata.
- Maintain `待办清单.md` as the single shared list of not-started follow-up work.
- Maintain `修改历史.md` as the running summary of completed project-content edits only.
- Formal design changes must pass both the Game Designer Review and the Implementation Review first.
- When uncertain whether a change is structural, conceptual, or just a note, ask before editing.
- In `related`, use the target note's unique basename by default, such as `[[C]]`, rather than a
  full vault path such as `[[A/B/C]]`. Use a path only when duplicate basenames make the short link
  ambiguous.
- Whenever creating a Git commit, write a commit message that briefly summarizes the content of
  that commit.
