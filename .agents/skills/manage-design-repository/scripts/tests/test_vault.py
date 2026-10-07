"""Tests for vaultlib. Run from the scripts folder: python -m unittest discover -s tests"""
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from vaultlib import images, index, lint, rename  # noqa: E402
from vaultlib.model import Vault  # noqa: E402
from vaultlib.yamlsubset import inline_list, parse_yaml, quote, split_note  # noqa: E402

PROFILE = """schema_version: 2
project_name: "Test"
records:
  backlog: "tasks"
  workspace_map: ".design-workflow/workspace-map.md"
  navigation: ["README.md", ".design-workflow/workspace-map.md"]
classes:
  design:
    dir: "design"
    type: Design
    label: "Rules"
    required: []
  inspiration:
    dir: "ideas"
    type: Inspiration
    required: [status, related, created]
    status: [New, Adopted]
  term:
    dir: "glossary"
    type: Term
    required: [location]
  task:
    dir: "tasks"
    type: Task
    required: [status, related]
    status: [Open, Doing]
fields:
  related:
    kind: links
  location:
    kind: link
  created:
    kind: date
ignore:
  keys: ["_*"]
  dirs: [code]
images:
  dirs: ["art"]
  formats: [webp]
  manifest: "images.yml"
  status: [Unreviewed, Pick, Reference]
  default_status: Unreviewed
  bad_names: ['^image[0-9]*$']
"""

FILES = {
    ".design-workflow/profile.yml": PROFILE,
    ".design-workflow/workspace-map.md": "| `design/` | rules |\n| `design/Combat.md` | combat |\n",
    "README.md": ("# Home\n\n| Page | About |\n|---|---|\n| [[Combat\\|Fight]] | rules |\n\n"
                  "See [[design/Combat]] and [the page](design/Combat.md#tempo).\n"),
    "design/Combat.md": "---\ntype: Design\n---\n# Combat\n\n## Tempo\n\nUses [[Hunter]].\n\n```query\nFROM \"design\"\n```\n",
    "design/Hunter.md": "---\ntype: Design\n_organized: true\n---\n# Hunter\n\nSee [fight](Combat.md) and [[Tempo]].\n",
    "ideas/Idea A.md": ("---\ntype: Inspiration\nstatus: New\nrelated:\n  - \"[[Combat]]\"\ncreated: 2026-01-02\n---\n"
                        "# Idea A\n\nChanges [[Combat#Tempo|tempo]]. Example syntax: `[[Combat]]`.\n"),
    "glossary/Tempo.md": "---\ntype: Term\nlocation: \"[[Combat]]\"\n---\n# Tempo\n",
    "tasks/Write events.md": "---\ntype: Task\nstatus: Open\nrelated: [\"[[Hunter]]\"]\n---\n# Write events\n",
    "art/images.yml": ("images:\n  \"style/gate.webp\":\n    status: Reference\n    for: [\"[[Combat]]\"]\n"
                       "    note: \"a gate, with: colon and # hash\"\n"),
    "art/style/gate.webp": "x",
    "art/sets/1/images.yml": "images:\n  \"ui/kit.webp\":\n    status: Pick\n    for: []\n    note: \"\"\n",
    "art/sets/1/ui/kit.webp": "x",
    "code/README.md": "[[Nowhere]]\n",
}


_ROOTS = []


def tearDownModule():
    for root in _ROOTS:
        shutil.rmtree(root, ignore_errors=True)


def make_vault(extra=None) -> Vault:
    root = Path(tempfile.mkdtemp(prefix="vault-test-"))
    _ROOTS.append(root)
    for rel, text in {**FILES, **(extra or {})}.items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(text.encode("utf-8"))
    return Vault(root)


def errors(v: Vault):
    return [f"[{c}] {w}: {m}" for level, c, w, m in lint.check(v).items if level == "error"]


def text(v: Vault, rel: str) -> str:
    return (v.root / rel).read_text(encoding="utf-8")


class YamlSubset(unittest.TestCase):
    def test_nested_maps_lists_and_quoting(self):
        data = parse_yaml('a: 1\n"k: x": "v \\"q\\" \\\\ z\\nw"  # note\nm:\n  n: [x, "y, z", \'[[A]]\']\n'
                          '  o:\n    - "[[B|c]]"\n    - plain\n  p: {}\nempty:\n')
        self.assertEqual(data["a"], "1")
        self.assertEqual(data["k: x"], 'v "q" \\ z\nw')
        self.assertEqual(data["m"], {"n": ["x", "y, z", "[[A]]"], "o": ["[[B|c]]", "plain"], "p": {}})
        self.assertIsNone(data["empty"])

    def test_writer_round_trips(self):
        value = 'a "b" \\ c\nd # e: f'
        self.assertEqual(parse_yaml("x: " + quote(value) + "\ny: " + inline_list(["[[A]]", "p, q"])),
                         {"x": value, "y": ["[[A]]", "p, q"]})

    def test_frontmatter_with_bom_and_empty_value(self):
        fm, body = split_note("\ufeff---\ntype: Term\nlocation:\n---\n# T\n")
        self.assertEqual(fm, {"type": "Term", "location": None})
        self.assertEqual(body, "# T\n")


class Lint(unittest.TestCase):
    def test_clean_vault(self):
        self.assertEqual(errors(make_vault()), [])

    def test_reports_broken_link_missing_field_and_wrong_folder(self):
        v = make_vault({
            "ideas/Bad.md": "---\ntype: Inspiration\nstatus: Maybe\nrelated: []\n---\n[[Missing]]\n",
            "Loose.md": "---\ntype: Term\nlocation:\n---\n",
        })
        found = "\n".join(errors(v))
        self.assertIn("ideas/Bad.md: missing `created`", found)
        self.assertIn("status `Maybe` not in", found)
        self.assertIn("[[Missing]] does not resolve", found)
        self.assertIn("Loose.md: type `Term` belongs in `glossary/`", found)

    def test_navigation_paths_must_exist_unless_git_ignores_them(self):
        v = make_vault({".gitignore": "# local\n.local-state/\n*.cache\n",
                        ".design-workflow/workspace-map.md": "`design/` `.local-state/` `x.cache` `missing/`\n"})
        found = [e for e in errors(v) if "[navigation]" in e]
        self.assertEqual(found, ["[navigation] .design-workflow/workspace-map.md: `missing/` does not exist"])

    def test_tool_owned_keys_and_ignored_folders_are_left_alone(self):
        report = lint.check(make_vault())
        self.assertEqual([i for i in report.items if "_organized" in i[3] or i[2].startswith("code/")], [])

    def test_image_needs_record_and_record_needs_image(self):
        v = make_vault({"art/style/tree.webp": "x", "art/style/image1.webp": "x",
                        "art/sets/1/images.yml": "images:\n  \"ui/gone.webp\":\n    status: Odd\n    for: [\"[[Nope]]\"]\n"})
        found = "\n".join(errors(v))
        self.assertIn("art/style/tree.webp: no manifest record in art/images.yml", found)
        self.assertIn("art/style/image1.webp: meaningless file name", found)
        self.assertIn("record `ui/gone.webp` has no image file", found)
        self.assertIn("status `Odd` not in", found)
        self.assertIn("for entry does not resolve", found)
        self.assertIn("art/sets/1/ui/kit.webp: no manifest record", found)


class Images(unittest.TestCase):
    def test_sync_adds_missing_records_to_the_nearest_manifest(self):
        v = make_vault({"art/style/tree.webp": "x", "art/sets/1/ui/frame.webp": "x"})
        self.assertEqual(images.sync_manifests(v), 2)
        v = Vault(v.root)
        self.assertEqual(v.image_record("art/style/tree.webp")[2]["status"], "Unreviewed")
        self.assertEqual(v.image_record("art/sets/1/ui/frame.webp")[0], "art/sets/1/images.yml")
        self.assertEqual(v.image_record("art/style/gate.webp")[2]["note"], "a gate, with: colon and # hash")
        self.assertEqual(errors(v), [])


class Index(unittest.TestCase):
    def test_backlinks_are_grouped_by_class(self):
        v = make_vault()
        data = index.build(v)
        sources = {(b["source"], b["via"]) for b in data["backlinks"]["design/Combat.md"]}
        self.assertEqual(sources, {("README.md", "body"), ("design/Hunter.md", "body"), ("ideas/Idea A.md", "related"),
                                   ("ideas/Idea A.md", "body"), ("glossary/Tempo.md", "location"),
                                   ("art/style/gate.webp", "for")})
        report = index.context(v, "design/Combat.md", data)
        self.assertIn("### Rules (1)", report)
        self.assertIn("- [New] Idea A (related)", report)
        self.assertIn("## Images (1)", report)
        self.assertNotIn("_organized", index.context(v, "design/Hunter.md", data))

    def test_find_by_fragment(self):
        v = make_vault()
        self.assertEqual(v.find("Idea")[0], "ideas/Idea A.md")
        self.assertIsNone(v.find("e")[0])


class Rename(unittest.TestCase):
    def test_rename_in_place_rewrites_every_reference(self):
        v = make_vault()
        self.assertEqual(rename.run(v, "Combat", "Combat System"), 0)
        v = Vault(v.root)
        self.assertTrue((v.root / "design/Combat System.md").is_file())
        self.assertIn("| [[Combat System\\|Fight]] |", text(v, "README.md"))
        self.assertIn("[[design/Combat System]]", text(v, "README.md"))
        self.assertIn("(design/Combat System.md#tempo)", text(v, "README.md"))
        idea = text(v, "ideas/Idea A.md")
        self.assertIn('- "[[Combat System]]"', idea)
        self.assertIn("[[Combat System#Tempo|tempo]]", idea)
        self.assertIn("`[[Combat]]`", idea)  # an example in code is not a link
        self.assertIn('location: "[[Combat System]]"', text(v, "glossary/Tempo.md"))
        self.assertIn("[fight](Combat System.md)", text(v, "design/Hunter.md"))
        self.assertIn("`design/Combat System.md`", text(v, ".design-workflow/workspace-map.md"))
        self.assertIn('for: ["[[Combat System]]"]', text(v, "art/images.yml"))
        self.assertEqual(errors(v), [])

    def test_moving_a_note_fixes_its_own_relative_links(self):
        v = make_vault()
        self.assertEqual(rename.run(v, "design/Hunter.md", "glossary/"), 0)
        v = Vault(v.root)
        self.assertIn("[fight](../design/Combat.md)", text(v, "glossary/Hunter.md"))
        self.assertIn("Uses [[Hunter]].", text(v, "design/Combat.md"))

    def test_rename_folder_updates_profile_and_paths(self):
        v = make_vault()
        self.assertEqual(rename.run(v, "design", "rules"), 0)
        v = Vault(v.root)
        self.assertEqual(v.classes["design"]["dir"], "rules")
        self.assertIn("[[rules/Combat]]", text(v, "README.md"))
        self.assertIn("(rules/Combat.md#tempo)", text(v, "README.md"))
        self.assertIn("`rules/`", text(v, ".design-workflow/workspace-map.md"))
        self.assertEqual(errors(v), [])

    def test_new_name_that_collides_gets_a_path(self):
        v = make_vault({"glossary/Hunter.md": "---\ntype: Term\nlocation:\n---\n"})
        self.assertEqual(rename.run(v, "glossary/Tempo.md", "Combat"), 0)
        self.assertIn("[[glossary/Combat]]", text(v, "design/Hunter.md"))

    def test_image_record_follows_the_image(self):
        v = make_vault()
        self.assertEqual(rename.run(v, "art/style/gate.webp", "art/sets/1/ui/"), 0)
        v = Vault(v.root)
        manifest, key, record = v.image_record("art/sets/1/ui/gate.webp")
        self.assertEqual((manifest, key, record["status"]), ("art/sets/1/images.yml", "ui/gate.webp", "Reference"))
        self.assertEqual(v.manifests()["art/images.yml"], {})
        self.assertEqual(errors(v), [])

    def test_check_changes_nothing_and_refuses_existing_target(self):
        v = make_vault()
        before = text(v, "README.md")
        self.assertEqual(rename.run(v, "Combat", "Combat System", check=True), 0)
        self.assertEqual(text(v, "README.md"), before)
        self.assertTrue((v.root / "design/Combat.md").is_file())
        self.assertEqual(rename.run(v, "Combat", "Hunter"), 1)


if __name__ == "__main__":
    unittest.main()
