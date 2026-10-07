import MarkdownIt from "markdown-it";
import type { Env, MarkdownIt as Markdown, RendererRule } from "markdown-it";
import { baseName, fileUrl, isImage, isNote } from "./data";
import { noteHref } from "./router";
import type { Note } from "./types";

// Renders a note body to HTML. Link resolution is never done here: the index
// already says what every link as written points to (note.targets, note.hrefs),
// so the page shows exactly what lint checked.

const FRONTMATTER = /^﻿?---[ \t]*\r?\n[\s\S]*?\r?\n?---[ \t]*(?:\r?\n|$)/;
const QUERY_BLOCKS = new Set(["dataview", "dataviewjs", "base"]);
const EXTERNAL = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

export interface RenderEnv {
  path: string;
  note: Note;
}

export function stripFrontmatter(text: string): string {
  return text.replace(FRONTMATTER, "");
}

/** Same normalisation lint uses to compare a link anchor with a heading. */
export function anchorKey(text: string): string {
  return text.replace(/[\s#:|^[\]*_`]+/g, "").toLowerCase();
}

export const headingId = (text: string) => `h-${anchorKey(text)}`;

interface WikiLink {
  embed: boolean;
  target: string;
  anchor: string;
  alias: string;
}

export function parseWikiLink(inner: string, embed: boolean): WikiLink {
  const pipe = inner.indexOf("|");
  let target = pipe >= 0 ? inner.slice(0, pipe) : inner;
  const alias = pipe >= 0 ? inner.slice(pipe + 1).trim() : "";
  target = target.trimEnd().replace(/\\$/, "");
  const hash = target.indexOf("#");
  const anchor = hash >= 0 ? target.slice(hash + 1).trim() : "";
  return { embed, target: (hash >= 0 ? target.slice(0, hash) : target).trim(), anchor, alias };
}

// The renderer hands rules a loosely typed env; ours is always a RenderEnv.
const envOf = (env: Env | undefined) => env as unknown as RenderEnv;

function createRenderer(): Markdown {
  const md = new MarkdownIt({ html: false, linkify: false, breaks: true });
  const escape = md.utils.escapeHtml;
  // Keep destinations exactly as written so they match the keys in note.hrefs.
  md.normalizeLink = (url: string) => url;

  md.inline.ruler.before("link", "wikilink", (state, silent) => {
    const { src, pos } = state;
    const embed = src.startsWith("![[", pos);
    if (!embed && !src.startsWith("[[", pos)) return false;
    const start = pos + (embed ? 3 : 2);
    const end = src.indexOf("]]", start);
    if (end < 0) return false;
    const inner = src.slice(start, end);
    if (!inner.trim() || inner.includes("\n") || inner.includes("[[")) return false;
    if (!silent) state.push("wikilink", "", 0).meta = { ...parseWikiLink(inner, embed) };
    state.pos = end + 2;
    return true;
  });

  md.renderer.rules.wikilink = (tokens, idx, _options, env) => {
    const link = tokens[idx].meta as unknown as WikiLink;
    const { path: current, note } = envOf(env);
    const path = link.target ? note.targets[link.target] : current;
    const shown = link.target.slice(link.target.lastIndexOf("/") + 1);
    const label = escape(link.alias || [shown, link.anchor].filter(Boolean).join(" › "));
    if (!path) return `<span class="wikilink broken" title="链接未能解析">${label}</span>`;
    if (isImage(path)) {
      return link.embed
        ? `<img class="embed" src="${escape(fileUrl(path))}" alt="${label}" loading="lazy">`
        : `<a class="wikilink" href="${escape(fileUrl(path))}" target="_blank" rel="noopener">${label}</a>`;
    }
    if (isNote(path)) {
      return `<a class="wikilink" href="${escape(noteHref(path, link.anchor || undefined))}">${label}</a>`;
    }
    return `<a class="wikilink file" href="${escape(fileUrl(path))}" target="_blank" rel="noopener">${label}</a>`;
  };

  const renderToken: RendererRule = (tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options);

  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const href = String(token.attrGet("href") ?? "");
    if (EXTERNAL.test(href)) {
      token.attrSet("target", "_blank");
      token.attrSet("rel", "noopener");
    } else if (!href.startsWith("#")) {
      const [written, fragment] = href.split("#");
      const path = envOf(env).note.hrefs[written];
      if (!path) token.attrJoin("class", "broken");
      else if (isNote(path)) token.attrSet("href", noteHref(path, fragment));
      else {
        token.attrSet("href", fileUrl(path));
        token.attrSet("target", "_blank");
      }
    }
    return renderToken(tokens, idx, options, env, self);
  };

  md.renderer.rules.image = (tokens, idx, _options, env) => {
    const token = tokens[idx];
    const written = String(token.attrGet("src") ?? "");
    const alt = escape(token.content);
    if (EXTERNAL.test(written)) return `<img src="${escape(written)}" alt="${alt}" loading="lazy">`;
    const path = envOf(env).note.hrefs[written.split("#")[0]];
    if (!path) return `<span class="wikilink broken" title="图片不存在">${alt || escape(written)}</span>`;
    return `<img class="embed" src="${escape(fileUrl(path))}" alt="${alt}" loading="lazy">`;
  };

  md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const inline = tokens[idx + 1];
    if (inline?.type === "inline") tokens[idx].attrSet("id", headingId(inline.content));
    return renderToken(tokens, idx, options, env, self);
  };

  const fence = md.renderer.rules.fence!;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const language = tokens[idx].info.trim().split(/\s+/)[0];
    if (!QUERY_BLOCKS.has(language)) return fence(tokens, idx, options, env, self);
    return (
      `<div class="query-block"><div class="query-label">查询块（${escape(language)}）· 只在笔记工具中执行</div>` +
      `<pre><code>${escape(tokens[idx].content)}</code></pre></div>`
    );
  };

  return md;
}

let renderer: Markdown | undefined;

export function renderNote(text: string, env: RenderEnv): string {
  renderer ??= createRenderer();
  return renderer.render(stripFrontmatter(text), env as unknown as Env);
}

/** Wiki links inside a frontmatter value, for showing fields as links. */
export function linksInValue(value: unknown): { label: string; target: string }[] {
  const items = Array.isArray(value) ? value : [value];
  const found: { label: string; target: string }[] = [];
  for (const item of items) {
    if (typeof item !== "string") continue;
    for (const match of item.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const link = parseWikiLink(match[1], false);
      found.push({ label: link.alias || baseName(link.target), target: link.target });
    }
  }
  return found;
}
