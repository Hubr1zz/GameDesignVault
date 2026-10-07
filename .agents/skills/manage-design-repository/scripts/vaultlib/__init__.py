"""Deterministic tooling for a Markdown design repository.

Everything project-specific comes from `.design-workflow/profile.yml`. No module
here names a folder, a field or an editor.

    yamlsubset  the YAML subset used by profiles, frontmatter and image manifests
    model       the vault: files, notes, link resolution, image manifests
    lint        validation of notes, links, navigation, images and templates
    images      image conversion and manifest synchronisation
    index       the derived link graph and the `context` report
    rename      moving or renaming files while rewriting every reference
"""
