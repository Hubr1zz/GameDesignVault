import { useEffect, useMemo, useState } from "react";
import { StatusChip } from "./Chip";
import { baseName, fileUrl, thumbUrl } from "../data";
import { imageGroup, statusTone } from "../model";
import { artHref, noteHref } from "../router";
import type { ImageRecord, VaultIndex } from "../types";

// The board reads nothing but index.images, which comes from the image manifests.
// If image management moves to another tool, only the manifests need to follow.

interface Props {
  index: VaultIndex;
  selected?: string;
}

interface Item {
  path: string;
  record: ImageRecord;
  set: string;
  kind: string;
}

type Grouping = "set" | "kind";

const natural = (a: string, b: string) => a.localeCompare(b, "zh-Hans-CN", { numeric: true });

function commonPrefix(values: string[]): string {
  if (values.length === 0) return "";
  const parts = values.map((v) => v.split("/"));
  let depth = 0;
  while (parts.every((p) => p.length > depth && p[depth] === parts[0][depth])) depth++;
  return parts[0].slice(0, depth).join("/");
}

export function ArtBoard({ index, selected }: Props) {
  const [grouping, setGrouping] = useState<Grouping>("set");
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const items = useMemo<Item[]>(
    () =>
      Object.entries(index.images).map(([path, record]) => ({ path, record, ...imageGroup(path, record.manifest) })),
    [index]
  );
  const root = useMemo(() => commonPrefix([...new Set(items.map((i) => i.set))]), [items]);
  const setLabel = (set: string) => (set === root ? baseName(root) || "图片" : set.slice(root ? root.length + 1 : 0));

  const statuses = index.image_status;
  const counts = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const item of items) tally[item.record.status ?? ""] = (tally[item.record.status ?? ""] ?? 0) + 1;
    return tally;
  }, [items]);

  const visible = items.filter((i) => !hidden.has(i.record.status ?? ""));
  const sections = useMemo(() => {
    const [outer, inner] = grouping === "set" ? (["set", "kind"] as const) : (["kind", "set"] as const);
    const map = new Map<string, Map<string, Item[]>>();
    for (const item of visible) {
      const groups = map.get(item[outer]) ?? new Map<string, Item[]>();
      groups.set(item[inner], [...(groups.get(item[inner]) ?? []), item]);
      map.set(item[outer], groups);
    }
    return [...map.entries()]
      .sort(([a], [b]) => natural(a, b))
      .map(([key, groups]) => ({
        key,
        groups: [...groups.entries()]
          .sort(([a], [b]) => natural(a, b))
          .map(([sub, list]) => ({ sub, list: list.sort((a, b) => natural(a.path, b.path)) }))
      }));
  }, [visible, grouping]);

  const ordered = sections.flatMap((s) => s.groups.flatMap((g) => g.list));
  const at = selected ? ordered.findIndex((i) => i.path === selected) : -1;
  const current = selected ? (ordered[at] ?? items.find((i) => i.path === selected)) : undefined;

  useEffect(() => {
    if (!current) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") window.location.hash = artHref();
      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (step && at >= 0 && ordered[at + step]) window.location.hash = artHref(ordered[at + step].path);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, at, ordered]);

  const label = (key: string, by: "set" | "kind") => (by === "set" ? setLabel(key) : key || "未分类");
  const [outer, inner] = grouping === "set" ? (["set", "kind"] as const) : (["kind", "set"] as const);

  return (
    <main className="art">
      <div className="art-bar">
        <div className="segmented" role="group" aria-label="分组方式">
          <button className={grouping === "set" ? "on" : ""} onClick={() => setGrouping("set")}>按图集</button>
          <button className={grouping === "kind" ? "on" : ""} onClick={() => setGrouping("kind")}>按类别</button>
        </div>
        <div className="filters">
          {[...statuses, ...Object.keys(counts).filter((s) => !statuses.includes(s))].map((status) => {
            const off = hidden.has(status);
            return (
              <button
                key={status}
                className={`chip tone-${statusTone(statuses, status)} ${off ? "off" : ""}`}
                aria-pressed={!off}
                onClick={() => {
                  const next = new Set(hidden);
                  if (off) next.delete(status);
                  else next.add(status);
                  setHidden(next);
                }}
              >
                {status || "无记录"} {counts[status] ?? 0}
              </button>
            );
          })}
        </div>
        <span className="count">{visible.length} / {items.length} 张</span>
      </div>

      {sections.map((section) => (
        <section key={section.key} className="art-section">
          <h2>{label(section.key, outer)}</h2>
          {section.groups.map((group) => (
            <div key={group.sub} className="art-group">
              <h3>{label(group.sub, inner)}</h3>
              <div className="grid">
                {group.list.map((item) => (
                  <a key={item.path} className="card" href={artHref(item.path)} title={item.record.note || item.path}>
                    <img src={thumbUrl(item.path)} alt={baseName(item.path)} loading="lazy" />
                    <span className="card-foot">
                      <span className={`dot tone-${statusTone(statuses, item.record.status)}`} />
                      <span className="card-name">{baseName(item.path).replace(/\.[^.]+$/, "")}</span>
                    </span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
      {visible.length === 0 && <p className="empty">没有符合筛选条件的图片</p>}

      {current && (
        <div className="lightbox" onClick={() => (window.location.hash = artHref())}>
          <figure onClick={(event) => event.stopPropagation()}>
            <img src={fileUrl(current.path)} alt={baseName(current.path)} />
            <figcaption>
              <div className="lb-title">
                <strong>{baseName(current.path)}</strong>
                <StatusChip status={current.record.status} statuses={statuses} />
              </div>
              <div className="note-path">{current.path} · {current.record.kb} KB</div>
              {current.record.note && <p>{current.record.note}</p>}
              {current.record.for.length > 0 && (
                <p>
                  用于：
                  {current.record.for.map((target, i) => (
                    <span key={target}>
                      {i > 0 && "、"}
                      <a href={noteHref(target)}>{baseName(target)}</a>
                    </span>
                  ))}
                </p>
              )}
              <div className="lb-nav">
                <button disabled={at <= 0} onClick={() => (window.location.hash = artHref(ordered[at - 1].path))}>
                  ← 上一张
                </button>
                <span className="count">{at >= 0 ? `${at + 1} / ${ordered.length}` : ""}</span>
                <button
                  disabled={at < 0 || at >= ordered.length - 1}
                  onClick={() => (window.location.hash = artHref(ordered[at + 1].path))}
                >
                  下一张 →
                </button>
                <button onClick={() => (window.location.hash = artHref())}>关闭</button>
              </div>
            </figcaption>
          </figure>
        </div>
      )}
    </main>
  );
}
