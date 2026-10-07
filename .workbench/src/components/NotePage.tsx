import { useEffect, useMemo, useRef, useState } from "react";
import { StatusChip, Tag } from "./Chip";
import { baseName, loadNoteText, thumbUrl } from "../data";
import { headingId, renderNote, valueHtml } from "../markdown";
import { VIA_LABEL, byStatusThenTitle, classLabel, groupByClass, statusesOf } from "../model";
import { artHref, noteHref, tableHref } from "../router";
import type { Note, VaultIndex } from "../types";

interface Props {
  index: VaultIndex;
  path: string;
  anchor?: string;
}

export function NotePage({ index, path, anchor }: Props) {
  const note: Note | undefined = index.notes[path];
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const article = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(null);
    if (!note) return;
    loadNoteText(path)
      .then((value) => !cancelled && setText(value))
      .catch((reason) => !cancelled && setError(String(reason)));
    return () => {
      cancelled = true;
    };
  }, [path, index.generated, note]);

  const html = useMemo(
    () => (text === null || !note ? "" : renderNote(text, { path, note, index })),
    [text, note, path, index]
  );

  useEffect(() => {
    if (!html) return;
    const target = anchor ? document.getElementById(headingId(anchor)) : null;
    if (target) target.scrollIntoView({ block: "start" });
    else article.current?.scrollTo({ top: 0 });
  }, [html, anchor]);

  if (!note) {
    return (
      <main className="note-main">
        <p className="empty">找不到这篇笔记：{path}</p>
      </main>
    );
  }

  const hasTitleHeading = note.headings.some((h) => h.level === 1);
  const fields = Object.entries(note.frontmatter).filter(
    ([key, value]) => key !== "type" && key !== "status" && !key.startsWith("_") && value !== null && value !== ""
  );

  return (
    <>
      <main className="note-main" ref={article}>
        <header className="note-head">
          <div className="note-meta">
            {note.class ? (
              <a className="tag" href={tableHref(index.classes[note.class].dir)} title="打开这一类的表格">
                {classLabel(index, note.class)}
              </a>
            ) : (
              <Tag>{classLabel(index, note.class)}</Tag>
            )}
            <StatusChip status={note.status} statuses={statusesOf(index, note)} />
            <span className="note-path">{path}</span>
          </div>
          {!hasTitleHeading && <h1>{note.title}</h1>}
          {fields.length > 0 && (
            <dl className="fields">
              {fields.map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd dangerouslySetInnerHTML={{ __html: valueHtml(value, path, note, index) }} />
                </div>
              ))}
            </dl>
          )}
        </header>
        {error && <p className="empty">读取失败：{error}</p>}
        {text === null && !error && <p className="empty">加载中…</p>}
        <article className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
      </main>
      <Relations index={index} path={path} note={note} />
    </>
  );
}

/** The typed backlinks panel: who points here, grouped by class and lifecycle. */
function Relations({ index, path, note }: { index: VaultIndex; path: string; note: Note }) {
  const incoming = index.backlinks[path] ?? [];
  const vias = new Map<string, string[]>();
  for (const link of incoming) {
    if (index.notes[link.source]) vias.set(link.source, [...(vias.get(link.source) ?? []), link.via]);
  }
  const groups = groupByClass(index, [...vias.keys()]);
  const images = incoming.filter((link) => link.via === "for" && index.images[link.source]).map((l) => l.source);
  const outgoing = groupByClass(index, [...new Set(note.links.map((l) => l.target))].filter((p) => index.notes[p]));
  const outline = note.headings.filter((h) => h.level === 2 || h.level === 3);

  const how = (source: string) => {
    const fields = (vias.get(source) ?? []).filter((v) => v !== "body");
    return fields.length ? fields.join("、") : VIA_LABEL.body;
  };

  return (
    <aside className="relations">
      {outline.length > 0 && (
        <section>
          <h2>大纲</h2>
          <ul className="outline">
            {outline.map((h, i) => (
              <li key={i} className={`level-${h.level}`}>
                <a href={noteHref(path, h.text)}>{h.text.replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, "$2")}</a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>链入 <span className="count">{vias.size}</span></h2>
        {groups.length === 0 && <p className="empty">没有其他笔记指向这里</p>}
        {groups.map((group) => (
          <div key={group.key} className="rel-group">
            <h3>
              {group.label} <span className="count">{group.paths.length}</span>
            </h3>
            <ul>
              {byStatusThenTitle(index, group.paths).map((source) => {
                const from = index.notes[source];
                return (
                  <li key={source}>
                    <StatusChip status={from.status} statuses={statusesOf(index, from)} />
                    <a href={noteHref(source)} title={from.excerpt || source}>{baseName(source)}</a>
                    <span className="via">{how(source)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      {images.length > 0 && (
        <section>
          <h2>图片 <span className="count">{images.length}</span></h2>
          <div className="rel-thumbs">
            {images.map((image) => (
              <a key={image} href={artHref(image)} title={baseName(image)}>
                <img src={thumbUrl(image)} alt={baseName(image)} loading="lazy" />
              </a>
            ))}
          </div>
        </section>
      )}

      {outgoing.length > 0 && (
        <section>
          <h2>链出</h2>
          {outgoing.map((group) => (
            <div key={group.key} className="rel-group">
              <h3>{group.label}</h3>
              <p className="inline-links">
                {group.paths.map((target, i) => (
                  <span key={target}>
                    {i > 0 && "、"}
                    <a href={noteHref(target)} title={index.notes[target].excerpt || target}>{baseName(target)}</a>
                  </span>
                ))}
              </p>
            </div>
          ))}
        </section>
      )}

      {note.unresolved.length > 0 && (
        <section>
          <h2>未解析的链接</h2>
          <ul>
            {note.unresolved.map((target, i) => (
              <li key={i} className="wikilink broken">{target}</li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
