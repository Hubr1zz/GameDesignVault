import MarkdownIt from "markdown-it";
import type { Env, MarkdownIt as Markdown, RendererRule } from "markdown-it";
import { baseName, fileUrl, isImage, isNote } from "./data";
import { classesInFolder, isBlank } from "./model";
import { parseQuery, queryFolder, runQuery } from "./query";
import { noteHref, tableHref } from "./router";
import type { Note, VaultIndex } from "./types";

// Renders a note body to HTML. Link resolution is never done here: the index
// already says what every link as written points to (note.targets, note.hrefs),
// so the page shows exactly what lint checked.

const FRONTMATTER = /^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n?---[ \t]*(?:\r?\n|$)/;
const QUERY_BLOCKS = new Set(["dataview", "dataviewjs", "base"]);
const EXTERNAL = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const WIKILINK = /(!?)\[\[([^\]]+)\]\]/g;

export interface RenderEnv {
  path: string;
  note: Note;
  index: VaultIndex;
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

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A wiki link as HTML. `source` is the note the link was written in, whose
 *  index entry says where the link leads. */
export function wikiLinkHtml(link: WikiLink, sourcePath: string, source: Note, index: VaultIndex): string {
  const path = link.target ? source.targets[link.target] : sourcePath;
  const shown = link.target.slice(link.target.lastIndexOf("/") + 1);
  const label = escapeHtml(link.alias || [shown, link.anchor].filter(Boolean).join(" › "));
  if (!path) return `<span class="wikilink broken" title="链接未能解析">${label}</span>`;
  if (isImage(path)) {
    return link.embed
      ? `<img class="embed" src="${escapeHtml(fileUrl(path))}" alt="${label}" loading="lazy">`
      : `<a class="wikilink" href="${escapeHtml(fileUrl(path))}" target="_blank" rel="noopener">${label}</a>`;
  }
  if (isNote(path)) {
    // The excerpt turns every link to a term into a definition on hover.
    const hint = index.notes[path]?.excerpt;
    const title = hint ? ` title="${escapeHtml(hint)}"` : "";
    return `<a class="wikilink" href="${escapeHtml(noteHref(path, link.anchor || undefined))}"${title}>${label}</a>`;
  }
  // A saved view of a note tool: offer this tool's own table of the same folder.
  const folder = (index.views[path] ?? []).find((f) => classesInFolder(index, f).length > 0);
  if (folder) return `<a class="wikilink" href="${escapeHtml(tableHref(folder))}">${label}</a>`;
  return `<a class="wikilink file" href="${escapeHtml(fileUrl(path))}" target="_blank" rel="noopener">${label}</a>`;
}

/** A frontmatter value as HTML: wiki links become links, lists are joined. */
export function valueHtml(value: unknown, sourcePath: string, source: Note, index: VaultIndex): string {
  if (isBlank(value)) return '<span class="blank">—</span>';
  if (Array.isArray(value)) {
    return value.length ? value.map((item) => valueHtml(item, sourcePath, source, index)).join("、") : "";
  }
  let html = "";
  let last = 0;
  const raw = String(value);
  for (const match of raw.matchAll(WIKILINK)) {
    html += escapeHtml(raw.slice(last, match.index));
    html += wikiLinkHtml(parseWikiLink(match[2], match[1] === "!"), sourcePath, source, index);
    last = match.index + match[0].length;
  }
  return html + escapeHtml(raw.slice(last));
}

function queryHtml(language: string, source: string, index: VaultIndex): string {
  const folder = queryFolder(source);
  const table = folder && classesInFolder(index, folder).length ? tableHref(folder) : null;
  const open = table ? ` · <a href="${escapeHtml(table)}">在表格视图中打开</a>` : "";
  const query = language === "dataview" ? parseQuery(source) : null;

  if (!query) {
    return (
      `<div class="query-block"><div class="query-label">这个查询块未执行：工作台只执行简单的 TABLE / LIST 查询${open}</div>` +
      `<details><summary>查询原文（${escapeHtml(language)}）</summary><pre><code>${escapeHtml(source)}</code></pre></details></div>`
    );
  }

  const rows = runQuery(query, index);
  const caption = `<div class="query-label">${rows.length} 条${open}</div>`;
  if (rows.length === 0) return `<div class="query-result"><p class="empty">没有符合条件的条目</p>${caption}</div>`;

  const link = (path: string) => {
    const hint = index.notes[path].excerpt;
    return `<a class="wikilink" href="${escapeHtml(noteHref(path))}"${hint ? ` title="${escapeHtml(hint)}"` : ""}>${escapeHtml(baseName(path))}</a>`;
  };
  if (query.kind === "list") {
    return `<div class="query-result"><ul>${rows.map((row) => `<li>${link(row.path)}</li>`).join("")}</ul>${caption}</div>`;
  }
  const head = [...(query.withoutId ? [] : ["文件"]), ...query.columns.map((column) => column.label)];
  const body = rows.map((row) => {
    const cells = row.cells.map((cell) => `<td>${valueHtml(cell, row.path, index.notes[row.path], index)}</td>`);
    return `<tr>${query.withoutId ? "" : `<td>${link(row.path)}</td>`}${cells.join("")}</tr>`;
  });
  return (
    `<div class="query-result"><table><thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>` +
    `<tbody>${body.join("")}</tbody></table>${caption}</div>`
  );
}

// The renderer hands rules a loosely typed env; ours is always a RenderEnv.
const envOf = (env: Env | undefined) => env as unknown as RenderEnv;

function createRenderer(): Markdown {
  const md = new MarkdownIt({ html: false, linkify: false, breaks: true });
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
    const { path, note, index } = envOf(env);
    return wikiLinkHtml(tokens[idx].meta as unknown as WikiLink, path, note, index);
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
    const alt = escapeHtml(token.content);
    if (EXTERNAL.test(written)) return `<img src="${escapeHtml(written)}" alt="${alt}" loading="lazy">`;
    const path = envOf(env).note.hrefs[written.split("#")[0]];
    if (!path) return `<span class="wikilink broken" title="图片不存在">${alt || escapeHtml(written)}</span>`;
    return `<img class="embed" src="${escapeHtml(fileUrl(path))}" alt="${alt}" loading="lazy">`;
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
    return queryHtml(language, tokens[idx].content, envOf(env).index);
  };

  return md;
}

let renderer: Markdown | undefined;

export function renderNote(text: string, env: RenderEnv): string {
  renderer ??= createRenderer();
  return renderer.render(stripFrontmatter(text), env as unknown as Env);
}
