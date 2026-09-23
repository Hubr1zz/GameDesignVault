---
name: manage-design-repository
description: Manage a portable Markdown game-design repository with formal design documents, an inspiration inbox, issue capture, terminology, examples, metadata, wiki links, review gates, backlog, and edit history. Use when an agent needs to set up, read, create, revise, reorganize, audit, or maintain design documentation, or when turning an idea into a formal implementable rule in any repository that has installed this workflow.
---

# Manage Design Repository

Treat Markdown files in the target repository as the durable source of truth. Keep the workflow independent of any specific editor, project name, machine path, game codebase, or remote database.

## Start

1. Locate the repository root and read `.design-workflow/profile.yml` completely.
2. If the profile is missing, stop document mutations and follow the package `SETUP.md`.
3. Resolve every configured path relative to the repository root. Never embed an absolute path in repository files.
4. Read the configured project-rules file completely before acting; it contains target-specific constraints and integration boundaries.
5. Read the configured workspace map when structural context is needed.
6. Before editing, read the configured backlog and search relevant Markdown with the fastest available text search.
7. Before broad edits, inspect version-control status and preserve unrelated user changes.

## Use one portable data model

Store structured properties in YAML frontmatter and relationships as quoted wiki links. Use lowercase property names.

For every newly created or substantially reorganized managed note:

- write the schema required for its document class from `references/metadata-schema.md`;
- use `related: []` when no valid relationship exists instead of inventing one;
- prefer a unique basename in links, and use a path only to resolve ambiguity;
- verify required properties after writing;
- omit editor-specific properties unless the profile explicitly enables them.

The Markdown frontmatter is canonical. Editor caches, saved views, local settings, exports, and remote copies are not separate sources of truth.

## Classify the request

- **Read/query**: search and read exact sources before answering; identify whether each rule is formal, inspirational, terminological, or illustrative.
- **Capture inspiration**: follow the inspiration workflow.
- **Capture issue**: follow the issue workflow.
- **Define terminology**: follow the terminology workflow.
- **Change formal design**: run both review gates before editing.
- **Maintain structure**: preserve document meaning, update obvious inbound links and navigation, and avoid unrelated cleanup.

## Capture inspiration

1. Search formal design, inspirations, terminology, and examples for the same mechanism, event, content object, or design purpose.
2. Merge genuine duplicates. Preserve `created` and set `updated` to the current date.
3. Split independent ideas when triggers, owning systems, content objects, or purposes differ. Record an unspecified relationship as an open question; do not infer it from proximity.
4. Perform the design-completeness review in conversation.
5. Create the note in the configured inspiration directory with `category: inspiration` and the required inspiration metadata.
6. Record only the user's idea summary, actual conflicts, and concise open questions. Do not store review commentary or invented solutions in the note.
7. Do not promote a new idea into formal design unless the user explicitly requests it.

## Capture an issue

Treat contradictions, unclear rules, balance concerns, production risks, and requests to “record a problem” as issues rather than ordinary ideas.

1. Store the note in the configured inspiration directory with `category: inspiration` and `kind: Issue`.
2. Link affected documents.
3. Record evidence, suspected causes, possible fixes, and open questions without presenting guesses as decisions.
4. Add an open-question section to formal design only when the user asks to update that document.

## Review formal design changes

Before materially changing a formal design document, perform both reviews in conversation.

### Design completeness review

Check that the design:

- stands on its own and forms a functional loop;
- fits related systems, pacing, incentives, and intended player experience;
- defines rewards, costs, penalties, failure consequences, and recovery where relevant.

Output `设计完整性问题` and `相关内容` (or equivalent labels in the repository language). Under related content, list titles only unless an actual conflict needs explanation.

### Implementation clarity review

Check that an implementer does not need to invent core behavior. Verify triggers, inputs, outputs, states, transitions, timing, boundaries, UI, data, and content-script responsibilities.

Output `实现不清晰问题` (or the repository-language equivalent) when gaps exist.

### Gate

Do not update formal design while either review has unresolved gaps. Wait for clarification, save the material as inspiration if requested, or proceed only when the user explicitly requests a draft with known gaps.

## Edit formal design

1. Read the target and nearby related documents.
2. Preserve user meaning while improving clarity only as required by the request.
3. Keep formal pages focused on design rules; do not add meta-sections explaining the page's purpose unless requested.
4. Use headings, folders, frontmatter, and wiki links as the document graph.
5. Apply the formal-document metadata schema and update `updated`.
6. When moving or renaming files, repair obvious links and navigation.

## Maintain terminology and examples

- Create one page per stable term. Define meaning, usage, aliases, primary location, related systems, and links.
- Link meaningful uses of existing terms back to the term page.
- Keep concrete events, encounters, objects, characters, recipes, and test cases in the configured examples directory.
- If an example implies a new rule, capture it as inspiration or use the formal-design review gate.

## Maintain repository records

After successful project-content edits:

1. Reopen the backlog. Remove completed items and add only clear, not-started follow-ups.
2. Reopen the edit history. Add a concise dated entry for completed content changes.
3. Do not record plans, failed attempts, conversation-only reviews, or workflow-package maintenance in the content history.

## Resolve conflicts

When local files, exports, remote content, or user excerpts disagree:

1. Do not choose silently.
2. List differences by source and explain the conflicting meaning.
3. Ask which version to retain or how to merge.
4. Write only after resolution, except for unambiguous formatting-only differences.

## Keep integrations optional

Do not assume Obsidian, Tolaria, Notion, a code project, an issue tracker, or a specification system exists. Use an integration only when the profile enables it and the tool is available. A missing integration must not block ordinary Markdown maintenance.

Read these resources only when relevant:

- `references/metadata-schema.md`: creating, normalizing, or auditing managed notes.
- `references/profile-schema.md`: setup, migration, or repository-layout changes.

Use `scripts/set_frontmatter_category.py` for deterministic recursive category normalization when Python is available; otherwise edit safely with available tools and verify the result.
