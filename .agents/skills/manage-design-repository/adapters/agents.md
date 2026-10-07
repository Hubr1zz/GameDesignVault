# Adapter: agent hosts

The workflow lives in one place, `.agents/skills/manage-design-repository/`. Each agent host gets a thin entry point that leads there. An entry point contains a pointer and nothing else, so no rule is ever written twice.

## Entry points

| Host | Entry point | Contents |
|---|---|---|
| Any agent that reads `AGENTS.md` (Codex, Tolaria's AI features and others) | `AGENTS.md` at the repository root | The fragment in `assets/AGENTS.fragment.md`. |
| Codex skills | `.agents/skills/<skill>/SKILL.md` with `agents/openai.yaml` | The skill itself. Codex discovers it here. |
| Claude Code | `.claude/CLAUDE.md` | One line that points to `AGENTS.md`. |
| Claude Code skills | `.claude/skills/<skill>/SKILL.md` | Frontmatter with the same `name` and `description`, and a body that says to read the skill under `.agents/skills/`. |
| Another host | Its own instruction file | The same pointer to `AGENTS.md`. |

## Rules

- Change behavior in the skill or in `.design-workflow/`, never in an entry point.
- When a skill's `description` changes, update its wrappers so they trigger on the same requests.
- A host feature that enforces the workflow, such as a hook that runs lint when a session ends or before a commit, is optional. Install one only when the user asks, and make it call `scripts/vault.py lint` so that every host enforces the same checks.
- A host that cannot run Python follows the manual checks in the skill's Verify section.
