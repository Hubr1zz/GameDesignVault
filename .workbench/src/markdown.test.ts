import { describe, expect, it } from "vitest";
import { anchorKey, linksInValue, parseWikiLink, renderNote, stripFrontmatter } from "./markdown";
import { byStatusThenTitle, groupByClass, imageGroup, statusTone, subFolder } from "./model";
import { noteHref, parseRoute } from "./router";
import type { Note, VaultIndex } from "./types";

const note = (over: Partial<Note> = {}): Note => ({
  title: "Combat",
  class: "design",
  type: "Design",
  status: null,
  frontmatter: {},
  headings: [],
  links: [],
  unresolved: [],
  targets: { Hunter: "design/Hunter.md", "design/Hunter": "design/Hunter.md", Missing: null, "gate.webp": "art/gate.webp" },
  hrefs: { "Hunter.md": "design/Hunter.md", "../art/gate.webp": "art/gate.webp", "gone.png": null },
  ...over
});

const render = (text: string) => renderNote(text, { path: "design/Combat.md", note: note() });

describe("markdown", () => {
  it("drops frontmatter, including one behind a BOM", () => {
    expect(stripFrontmatter("﻿---\ntype: Design\n---\n# T\n")).toBe("# T\n");
    expect(stripFrontmatter("# T\n---\nx\n")).toBe("# T\n---\nx\n");
  });

  it("splits target, anchor and alias, also behind an escaped pipe", () => {
    expect(parseWikiLink("Hunter#Death|the rule", false)).toMatchObject({ target: "Hunter", anchor: "Death", alias: "the rule" });
    expect(parseWikiLink("Hunter\\|H", false)).toMatchObject({ target: "Hunter", alias: "H" });
  });

  it("links resolved wiki links and marks unresolved ones", () => {
    const html = render("See [[Hunter]], [[design/Hunter#Death|death]] and [[Missing]].");
    expect(html).toContain(`<a class="wikilink" href="${noteHref("design/Hunter.md")}">Hunter</a>`);
    expect(html).toContain(`href="${noteHref("design/Hunter.md", "Death")}">death</a>`);
    expect(html).toContain('<span class="wikilink broken" title="链接未能解析">Missing</span>');
  });

  it("keeps a wiki link with an alias intact inside a table cell", () => {
    const html = render("| a | b |\n|---|---|\n| [[Hunter\\|H]] | x |\n");
    expect(html).toContain(`href="${noteHref("design/Hunter.md")}">H</a>`);
  });

  it("embeds images and rewrites Markdown destinations through the index", () => {
    const html = render("![[gate.webp]]\n\n![gate](../art/gate.webp)\n\n[h](Hunter.md#Death) ![x](gone.png) [site](https://example.com)");
    expect(html.match(/src="files\/art\/gate\.webp"/g)).toHaveLength(2);
    expect(html).toContain(`<a href="${noteHref("design/Hunter.md", "Death")}">h</a>`);
    expect(html).toContain('title="图片不存在"');
    expect(html).toContain('href="https://example.com" target="_blank" rel="noopener"');
  });

  it("gives headings ids that match link anchors, and never runs query blocks or HTML", () => {
    const html = render("## 死亡 判定\n\n```dataview\nTABLE x\n```\n\n<script>alert(1)</script>");
    expect(html).toContain(`<h2 id="h-${anchorKey("死亡判定")}">`);
    expect(html).toContain("查询块（dataview）");
    expect(html).not.toContain("<script>");
  });

  it("finds wiki links in frontmatter values", () => {
    expect(linksInValue(["[[Hunter]]", "[[design/Hunter|H]]"])).toEqual([
      { label: "Hunter", target: "Hunter" },
      { label: "H", target: "design/Hunter" }
    ]);
    expect(linksInValue("plain")).toEqual([]);
  });
});

describe("model and routes", () => {
  const index = {
    classes: {
      design: { type: "Design", dir: "design", label: "规则", status: [] },
      idea: { type: "Idea", dir: "ideas", label: "灵感", status: ["New", "Adopted", "Rejected"] }
    },
    notes: {
      "ideas/b.md": note({ title: "Zed", class: "idea", status: "Adopted" }),
      "ideas/sub/a.md": note({ title: "A", class: "idea", status: "New" }),
      "design/Combat.md": note(),
      "README.md": note({ title: "Home", class: null })
    }
  } as unknown as VaultIndex;

  it("groups by class in profile order with unmanaged notes last", () => {
    const groups = groupByClass(index, Object.keys(index.notes));
    expect(groups.map((g) => g.label)).toEqual(["规则", "灵感", "其他"]);
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

  it("derives folders and image groups from paths", () => {
    expect(subFolder(index, "ideas/sub/a.md")).toBe("sub");
    expect(subFolder(index, "ideas/b.md")).toBe("");
    expect(imageGroup("art/sets/7/ui/kit.webp", "art/sets/7/images.yml")).toEqual({ set: "art/sets/7", kind: "ui" });
    expect(imageGroup("art/gate.webp", "art/images.yml")).toEqual({ set: "art", kind: "" });
  });

  it("round-trips note routes with non-ASCII paths and anchors", () => {
    const href = noteHref("设计文档/通用/猎人 Hunter.md", "死亡判定");
    expect(parseRoute(href)).toEqual({ view: "note", path: "设计文档/通用/猎人 Hunter.md", anchor: "死亡判定" });
    expect(parseRoute("#/art?image=a%2Fb.webp")).toEqual({ view: "art", image: "a/b.webp" });
    expect(parseRoute("")).toEqual({ view: "home" });
  });
});
