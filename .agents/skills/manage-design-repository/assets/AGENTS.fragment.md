## Design documentation workflow

Keep the repository's agent entry point thin. Before reading or changing managed design documents:

1. Read `.agents/skills/manage-design-repository/SKILL.md` completely.
2. Let the Skill load `.design-workflow/profile.yml`, the configured project-rules file, and workspace map.

Treat repository Markdown as the source of truth. Keep optional editor and engineering integrations disabled unless the profile explicitly enables them.
