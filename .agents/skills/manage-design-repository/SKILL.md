---
name: manage-design-repository
description: Manage a portable Markdown game-design repository with formal design documents, an inspiration inbox, issue capture, terminology, examples, research, images, metadata, wiki links, review gates, backlog, and edit history. Use when an agent needs to set up, read, create, revise, reorganize, audit, or maintain design documentation, or when turning an idea into a formal implementable rule in any repository that has installed this workflow.
---

# Manage Design Repository

Markdown files in the repository are the source of truth. This workflow has three layers, and each rule lives in exactly one of them:

| Layer | Location | Holds |
|---|---|---|
| Core | this skill | How to work: capture, review, promote, record, verify. No folder names, field lists or editor names. |
| Project | `.design-workflow/` | `profile.yml` (classes, fields, statuses, image rules), `project-rules.md` (project-only constraints), `workspace-map.md`, `templates/`. |
| Adapters | `adapters/` in this skill | What one document tool or agent host needs, reserves or writes on its own. |

When two layers disagree, the profile wins for data and the project rules win for behavior. Report the disagreement instead of working around it.

## Start

1. Locate the repository root and read `.design-workflow/profile.yml` completely. If it is missing, stop document mutations and follow `SETUP.md`.
2. Read the project-rules file named in the profile.
3. Read the workspace map when you need structural context, and the backlog before editing.
4. Read `adapters/<name>.md` for an adapter listed in the profile only when the task touches that tool's views, templates or configuration, or when you meet a frontmatter key or file you do not recognize.
5. Search with the fastest available text search before answering or writing. Before broad edits, inspect version-control status and leave unrelated changes alone.

## Commands

`scripts/vault.py` in this skill does the deterministic work. Use it instead of doing the same thing by hand.

| Command | Use it |
|---|---|
| `vault.py context <note>` | Before editing a note. It prints the note's fields, outline and outgoing links, and everything that links to it, grouped by class and status. |
| `vault.py rename <old> <new>` | To move or rename any file or folder. It rewrites wiki links, Markdown links, backticked paths, image manifests and the profile. |
| `vault.py images [paths]` | After adding images. It converts and resizes them and adds their manifest records. |
| `vault.py lint` | At the end of every editing task. |
| `vault.py index` | When a program needs the whole link graph as JSON. |

`rename` and `images` accept `--check` to preview without changing anything.

## Data model

The profile defines every document class: its folder, its `type` value, its required fields and its allowed `status` values. Do not memorize these. Read them from the profile, and start new notes from `templates/<class>.md`.

- `type` names the class and must agree with the folder the note lives in.
- `status` is the lifecycle stage, for classes that have one.
- Relationships are quoted wiki links in YAML lists: `related: ["[[Note]]"]`. Use `[]` when nothing applies. Never invent a relationship to avoid an empty list.
- Link by unique file name. Add a path only when two files share a name. A file that is not Markdown needs its extension.
- Preserve `created`. Set `updated` on a material revision when the class has it.
- Keys matched by `ignore.keys` belong to a document tool. Keep them exactly as found and never add them yourself.
- Never write an absolute path, a machine name or a credential into a tracked file.

`references/metadata-schema.md` explains the field kinds. `references/profile-schema.md` explains the profile.

## Classify the request

- **Read or query**: search and read the exact sources first. Say which class each rule comes from: formal design, inspiration, terminology or example.
- **Capture an inspiration or an issue**: follow the capture sections below.
- **Promote an inspiration**: run both review gates, edit the formal design, then close the inspiration.
- **Change formal design**: run both review gates before editing.
- **Define terminology, add an example, file research**: create the note from its template in its class folder.
- **Maintain structure**: keep meaning intact, move files with `vault.py rename`, and avoid unrelated cleanup.

If you cannot tell whether a change is structural, conceptual or an ordinary note, ask.

## Capture an inspiration

1. Search formal design, inspirations, terminology and examples for the same mechanism, event, content object or purpose.
2. Merge genuine duplicates into the existing note. Keep `created` and set `updated`.
3. Split ideas whose triggers, owning systems, content objects or purposes differ, even when they arrived in one message. Record an unstated relationship as an open question. Do not infer it from proximity.
4. Run the design-completeness review in conversation.
5. Create the note from the inspiration template.
6. Write only the user's idea, actual conflicts with existing design, and short open questions. Phrase open questions as compact labels such as "trigger" or "resolution timing", not as lists of guessed options. Link every concept that already has a page.
7. Leave review commentary, implementation analysis and your own proposals out of the note.
8. Do not write a new idea into formal design unless the user asks.

## Capture an issue

Contradictions, unclear rules, balance worries, production risks and any request to "record a problem" are issues, not inspirations.

1. Create the note from the issue template and link the affected documents.
2. Record evidence, suspected causes, possible fixes and open questions. Never present a guess as a decision.
3. Add an open-question section to a formal document only when the user asks to update that document.

## Review gates for formal design

Run both reviews in conversation before any edit that changes the meaning of a formal design document.

**Design completeness.** The design stands on its own and closes its loop. It fits related systems, pacing, incentives and the intended experience. Rewards, costs, penalties, failure consequences and recovery are stated where they matter. Report the gaps and list related existing pages by title. Explain a related page only when it actually conflicts.

**Implementation clarity.** An implementer does not have to invent core behavior. Triggers, inputs, outputs, states, transitions, timing, boundaries, UI, data and content-script responsibilities are stated. Report the gaps.

**Gate.** While either review has an unresolved gap, do not update formal design. Wait for clarification, save the material as an inspiration if the user wants it kept, or proceed only when the user explicitly asks for a draft with known gaps. In that case, list the gaps in an open-questions section at the end of the page.

## Edit formal design

1. Run `vault.py context` on the target and read the notes that the change could affect: open inspirations and issues that point at it, the terms it defines, its examples.
2. Keep the user's wording unless the request needs a rewrite.
3. Write design rules only. Do not add sections that explain what the page is for or how to read it.
4. Use headings, folders and wiki links for structure.
5. Move or rename files with `vault.py rename`, never by hand. Afterwards check the query blocks it lists, because it does not rewrite queries.

## Promote an inspiration

After the formal document is updated:

1. Set the inspiration's `status` to the profile's adopted value and add the formal document to `related`.
2. If only part of the note was adopted, move that part out and leave the rest open.
3. Keep adopted notes where they are. Their links and history stay valid, and views filter them by `status`.

## Terminology, examples and research

- One page per stable term: meaning, usage, aliases, primary location, related systems.
- Link the first meaningful use of a term in each document to its page.
- Concrete events, encounters, objects, characters, recipes and test cases are examples. If an example implies a new rule, capture that rule as an inspiration or take it through the review gates.
- Research notes describe outside material. They never state this project's rules.

## Images

The profile's `images` section sets where images live, which formats are allowed, the size limits and the file-name patterns that are rejected.

Every image has one record in the nearest manifest file at or above it. The record holds its review status, the notes it belongs to (`for`) and a line of comment. An image joins the link graph through `for`: the notes listed there show the image among their backlinks.

1. Name a file for what it shows. Never keep a hash, clipboard or screenshot name.
2. Put it in the image folder for its topic. Start a new set with its own empty manifest when the project rules ask for one per set.
3. Run `vault.py images <file or folder>`. It converts and resizes the image and adds its record with the default status.
4. Fill in `for` and `note` in the record. Change `status` only on the user's decision.
5. Keep originals outside the repository when they matter.

## Records

After a successful content edit:

1. **Backlog**: the backlog is a folder of task notes, one per item, so that people working at the same time never edit the same file. Delete the notes for work you completed. Add one note for each clear follow-up that nobody has started. To claim a task, set its status to the in-progress value and fill in `owner`.
2. **History**: the commit log is the edit history. When the user has asked you to commit, make one commit per completed task with the message `<category>: <summary>`, using a category from the project rules. Say what changed and why in the body when the summary is not enough.
3. When the profile defines `records.edit_history`, also add one dated line to that file.

Plans, failed attempts and conversation-only reviews are not recorded anywhere.

## Collaboration

When the profile sets `collaboration.formal_design_changes` to `pull_request`:

1. Make a change to formal design on its own branch, never on the main branch.
2. Push the branch and open a pull request. Put the design-completeness review and the implementation-clarity review in its description, so the gate is visible to reviewers.
3. If you cannot open the pull request yourself, give the user the branch name and the link.

Notes outside formal design, such as inspirations, issues, terms, tasks and research, are committed directly unless the user says otherwise.

## Verify

Finish every editing task by running:

```
python .agents/skills/manage-design-repository/scripts/vault.py lint
```

Fix every error your change introduced. Report errors that were already there and warnings you did not resolve. Do not call the task done while your own errors remain. If Python is unavailable, check the same things by hand: required fields for each note you touched, every link you added, and navigation paths.

## Resolve conflicts

When local files, exports, remote copies or pasted excerpts disagree:

1. Do not choose silently.
2. List the differences by source and say what each version means.
3. Ask which to keep or how to merge.
4. Write only after the user decides. Formatting-only differences with an obvious intent are the exception.

## Tools and integrations

Assume no particular editor, agent host, code project or specification system. A tool counts only when the profile lists it. A missing tool must never block ordinary Markdown maintenance.

Saved views, query blocks, editor settings and tool-written keys are projections of the Markdown, never a second source of truth. When you rename a field or move a folder, update the projections the project rules list, and leave every other tool file alone.
