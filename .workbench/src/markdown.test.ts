import { describe, expect, it } from "vitest";
import { anchorKey, parseWikiLink, renderNote, stripFrontmatter, valueHtml } from "./markdown";
import { byStatusThenTitle, classesInFolder, groupByClass, imageGroup, statusTone, subFolder } from "./model";
import { parseQuery, queryFolder, runQuery } from "./query";
import { noteHref, parseRoute, tableHref } from "./router";
import type { Note, VaultIndex } from "./types";

const BOM = String.fromCharCode(0xfeff);

const note = (over: Partial<Note> = {}): Note => ({
  title: "Combat",
  class: "design",
  type: "Design",
  status: null,
  frontmatter: {},
  headings: [],
  links: [],
  unresolved: [],
  targets: {
    Hunter: "design/Hunter.md",
    "design/Hunter": "design/Hunter.md",
    Missing: null,
    "gate.webp": "art/gate.webp",
    "Ideas.base": "Ideas.base",
    "Plain.base": "Plain.base"
  },
  hrefs: { "Hunter.md": "design/Hunter.md", "../art/gate.webp": "art/gate.webp", "gone.png": null },
  excerpt: "",
  ...over
});

const term = (name: string, english: string, location: string | null): Note =>
  note({
    title: name,
    class: "term",
    type: "Term",
    frontmatter: { type: "Term", name, english, location },
    targets: { Hunter: "design/Hunter.md" },
    excerpt: `${name} means something.`
  });

const index = {
  classes: {
    design: { type: "Design", dir: "design", label: "规则", status: [], required: [], fields: [] },
    idea: { type: "Idea", dir: "ideas", label: "灵感", status: ["New", "Adopted", "Rejected"], fields: ["status", "created"] },
    issue: { type: "Issue", dir: "ideas", label: "问题", status: ["Open"], fields: ["status"] },
    term: { type: "Term", dir: "glossary", label: "术语", status: [], fields: ["name", "english", "location"] }
  },
  notes: {
    "ideas/b.md": note({ title: "Zed", class: "idea", status: "Adopted", frontmatter: { status: "Adopted", created: "2026-01-02" } }),
    "ideas/sub/a.md": note({ title: "A", class: "idea", status: "New", frontmatter: { status: "New", created: "2026-03-04" } }),
    "design/Combat.md": note(),
    "design/Hunter.md": note({ title: "Hunter", excerpt: "A hunter fights." }),
    "glossary/Tempo.md": term("Tempo", "Tempo", '[[Hunter]]'),
    "glossary/Grit.md": term("Grit", "", null),
    "glossary/Armor 10.md": term("Armor 10", "Armor", '[[Hunter]]'),
    "glossary/Armor 2.md": term("Armor 2", "Armor", '[[Hunter]]'),
    "README.md": note({ title: "Home", class: null })
  },
  views: { "Ideas.base": ["ideas"], "Plain.base": ["nowhere"] }
} as unknown as VaultIndex;

const render = (text: string) => renderNote(text, { path: "design/Combat.md", note: index.notes["design/Combat.md"], index });

describe("markdown", () => {
  it("drops frontmatter, including one behind a BOM", () => {
    expect(stripFrontmatter(`${BOM}---\ntype: Design\n---\n# T\n`)).toBe("# T\n");
    expect(stripFrontmatter("# T\n---\nx\n")).toBe("# T\n---\nx\n");
  });

  it("splits target, anchor and alias, also behind an escaped pipe", () => {
    expect(parseWikiLink("Hunter#Death|the rule", false)).toMatchObject({ target: "Hunter", anchor: "Death", alias: "the rule" });
    expect(parseWikiLink("Hunter\\|H", false)).toMatchObject({ target: "Hunter", alias: "H" });
  });

  it("links resolved wiki links with the target's excerpt as a hint, and marks unresolved ones", () => {
    const html = render("See [[Hunter]], [[design/Hunter#Death|death]] and [[Missing]].");
    expect(html).toContain(`<a class="wikilink" href="${noteHref("design/Hunter.md")}" title="A hunter fights.">Hunter</a>`);
    expect(html).toContain(`href="${noteHref("design/Hunter.md", "Death")}" title="A hunter fights.">death</a>`);
    expect(html).toContain('<span class="wikilink broken" title="链接未能解析">Missing</span>');
  });

  it("keeps a wiki link with an alias intact inside a table cell", () => {
    const html = render("| a | b |\n|---|---|\n| [[Hunter\\|H]] | x |\n");
    expect(html).toContain(`href="${noteHref("design/Hunter.md")}" title="A hunter fights.">H</a>`);
  });

  it("embeds images and rewrites Markdown destinations through the index", () => {
    const html = render("![[gate.webp]]\n\n![gate](../art/gate.webp)\n\n[h](Hunter.md#Death) ![x](gone.png) [site](https://example.com)");
    expect(html.match(/src="files\/art\/gate\.webp"/g)).toHaveLength(2);
    expect(html).toContain(`<a href="${noteHref("design/Hunter.md", "Death")}">h</a>`);
    expect(html).toContain('title="图片不存在"');
    expect(html).toContain('href="https://example.com" target="_blank" rel="noopener"');
  });

  it("gives headings ids that match link anchors and never passes HTML through", () => {
    const html = render("## 死亡 判定\n\n<script>alert(1)</script>");
    expect(html).toContain(`<h2 id="h-${anchorKey("死亡判定")}">`);
    expect(html).not.toContain("<script>");
  });

  it("sends a saved view of a note tool to this tool's table of the same folder", () => {
    const html = render("[[Ideas.base|Ideas]] and [[Plain.base]]");
    expect(html).toContain(`<a class="wikilink" href="${tableHref("ideas")}">Ideas</a>`);
    expect(html).toContain('<a class="wikilink file" href="files/Plain.base"');
  });

  it("renders frontmatter values with their links", () => {
    const source = index.notes["glossary/Tempo.md"];
    expect(valueHtml('[[Hunter]]', "glossary/Tempo.md", source, index)).toContain(`href="${noteHref("design/Hunter.md")}"`);
    expect(valueHtml(["a", "<b>"], "x", source, index)).toBe("a、&lt;b&gt;");
    expect(valueHtml(null, "x", source, index)).toContain("—");
  });
});

describe("queries", () => {
  it("parses the supported shape", () => {
    const query = parseQuery('TABLE english AS "English", location AS "所在文档"\nFROM "glossary"\nWHERE name != null AND location = null\nSORT file.folder ASC, name DESC');
    expect(query).toEqual({
      kind: "table",
      withoutId: false,
      columns: [
        { field: "english", label: "English" },
        { field: "location", label: "所在文档" }
      ],
      folder: "glossary",
      where: [
        { field: "name", negate: true, value: null },
        { field: "location", negate: false, value: null }
      ],
      sort: [
        { field: "file.folder", descending: false },
        { field: "name", descending: true }
      ]
    });
    expect(parseQuery('LIST FROM "ideas"')).toMatchObject({ kind: "list", folder: "ideas", columns: [] });
    expect(parseQuery('TABLE WITHOUT ID name FROM "glossary/"')).toMatchObject({ withoutId: true, folder: "glossary" });
  });

  it("refuses anything outside that shape instead of guessing", () => {
    for (const source of [
      'TABLE name FROM "g" WHERE contains(name, "a")',
      'TABLE name FROM "g" WHERE a = 1 OR b = 2',
      'TABLE name FROM "g" GROUP BY name',
      'TABLE name FROM "g" SORT name ASC LIMIT 5',
      "TABLE name FROM #tag",
      'TABLE length(name) AS "n" FROM "g" FLATTEN x',
      'LIST name FROM "g"',
      "views:\n  - type: cards"
    ]) {
      expect(parseQuery(source), source).toBeNull();
    }
  });

  it("filters on blank and equal values and sorts naturally", () => {
    const all = runQuery(parseQuery('TABLE english FROM "glossary" SORT name ASC')!, index);
    expect(all.map((row) => row.path)).toEqual([
      "glossary/Armor 2.md",
      "glossary/Armor 10.md",
      "glossary/Grit.md",
      "glossary/Tempo.md"
    ]);
    expect(all[0].cells).toEqual(["Armor"]);
    const missing = runQuery(parseQuery('TABLE english FROM "glossary" WHERE name != null AND location = null')!, index);
    expect(missing.map((row) => row.path)).toEqual(["glossary/Grit.md"]);
    const armor = runQuery(parseQuery('LIST FROM "glossary" WHERE english = "Armor" SORT file.name DESC')!, index);
    expect(armor.map((row) => row.path)).toEqual(["glossary/Armor 10.md", "glossary/Armor 2.md"]);
  });

  it("shows a supported query block as a table and links to the folder's table view", () => {
    const html = render('```dataview\nTABLE english AS "English", location AS "Where"\nFROM "glossary"\nWHERE location != null\nSORT name ASC\n```');
    expect(html).toContain("<th>文件</th><th>English</th><th>Where</th>");
    expect(html.match(/<tr>/g)).toHaveLength(4);
    expect(html).toContain(`href="${noteHref("glossary/Tempo.md")}" title="Tempo means something.">Tempo</a>`);
    expect(html).toContain(`href="${noteHref("design/Hunter.md")}"`);
    expect(html).toContain(`3 条 · <a href="${tableHref("glossary")}">在表格视图中打开</a>`);
    expect(render('```dataview\nLIST FROM "glossary" WHERE english = "none"\n```')).toContain("没有符合条件的条目");
  });

  it("says so when it does not run a block, and still points at the folder", () => {
    const base = render('```base\nviews:\n  - filters:\n      and:\n        - file.inFolder("ideas")\n```');
    expect(base).toContain("这个查询块未执行");
    expect(base).toContain(`href="${tableHref("ideas")}"`);
    expect(render('```dataview\nTABLE x FROM "glossary" GROUP BY x\n```')).toContain("这个查询块未执行");
    expect(queryFolder('TABLE x FROM "a/b/"')).toBe("a/b");
  });
});

describe("model and routes", () => {
  it("groups by class in profile order with unmanaged notes last", () => {
    const groups = groupByClass(index, Object.keys(index.notes));
    expect(groups.map((g) => g.label)).toEqual(["规则", "灵感", "术语", "其他"]);
  });

  it("orders by lifecycle position and colours the first status as needing attention", () => {
    expect(byStatusThenTitle(index, ["ideas/b.md", "ideas/sub/a.md"])).toEqual(["ideas/sub/a.md", "ideas/b.md"]);
    expect(["New", "Adopted", "Rejected", null].map((s) => statusTone(index.classes.idea.status, s))).toEqual([
      "todo",
      "go",
      "done",
      "none"
    ]);
  });

  it("derives folders, shared class folders and image groups from paths", () => {
    expect(subFolder(index, "ideas/sub/a.md")).toBe("sub");
    expect(subFolder(index, "ideas/b.md")).toBe("");
    expect(classesInFolder(index, "ideas/")).toEqual(["idea", "issue"]);
    expect(classesInFolder(index, "nowhere")).toEqual([]);
    expect(imageGroup("art/sets/7/ui/kit.webp", "art/sets/7/images.yml")).toEqual({ set: "art/sets/7", kind: "ui" });
    expect(imageGroup("art/gate.webp", "art/images.yml")).toEqual({ set: "art", kind: "" });
  });

  it("round-trips routes with non-ASCII paths and anchors", () => {
    const href = noteHref("设计文档/通用/猎人 Hunter.md", "死亡判定");
    expect(parseRoute(href)).toEqual({ view: "note", path: "设计文档/通用/猎人 Hunter.md", anchor: "死亡判定" });
    expect(parseRoute(tableHref("术语词典"))).toEqual({ view: "table", folder: "术语词典" });
    expect(parseRoute("#/art?image=a%2Fb.webp")).toEqual({ view: "art", image: "a/b.webp" });
    expect(parseRoute("")).toEqual({ view: "home" });
  });
});
