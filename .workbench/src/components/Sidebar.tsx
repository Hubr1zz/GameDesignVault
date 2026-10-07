import { useMemo, useState } from "react";
import { StatusChip } from "./Chip";
import { baseName } from "../data";
import { groupByClass, matchesQuery, statusesOf, subFolder } from "../model";
import { noteHref } from "../router";
import type { VaultIndex } from "../types";

interface Props {
  index: VaultIndex;
  current?: string;
}

const LARGE_GROUP = 30;

/** Every note, grouped by class and then by folder, with a title filter. */
export function Sidebar({ index, current }: Props) {
  const [query, setQuery] = useState("");
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => {
    const paths = Object.keys(index.notes).filter((p) => matchesQuery(p, index.notes[p], query));
    return groupByClass(index, paths).map((group) => {
      const folders = new Map<string, string[]>();
      for (const path of group.paths) {
        const folder = subFolder(index, path);
        folders.set(folder, [...(folders.get(folder) ?? []), path]);
      }
      const sorted = [...folders.entries()]
        .sort(([a], [b]) => a.localeCompare(b, "zh-Hans-CN"))
        .map(([folder, items]) => ({
          folder,
          items: items.sort((a, b) => baseName(a).localeCompare(baseName(b), "zh-Hans-CN"))
        }));
      return { ...group, folders: sorted };
    });
  }, [index, query]);

  const currentClass = current ? (index.notes[current]?.class ?? "__other") : undefined;

  return (
    <nav className="sidebar">
      <input
        className="search"
        type="search"
        placeholder="筛选标题、路径或小标题"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {groups.map((group) => {
        // Long lists start closed unless the reader is inside them or is filtering.
        const openByDefault = group.paths.length <= LARGE_GROUP || group.key === currentClass || query !== "";
        const open = toggled[group.key] ?? openByDefault;
        return (
          <section key={group.key} className="side-group">
            <button
              className="side-heading"
              aria-expanded={open}
              onClick={() => setToggled({ ...toggled, [group.key]: !open })}
            >
              <span>{open ? "▾" : "▸"} {group.label}</span>
              <span className="count">{group.paths.length}</span>
            </button>
            {open &&
              group.folders.map(({ folder, items }) => (
                <div key={folder}>
                  {folder && <div className="side-folder">{folder}</div>}
                  <ul>
                    {items.map((path) => {
                      const note = index.notes[path];
                      return (
                        <li key={path}>
                          <a className={path === current ? "active" : undefined} href={noteHref(path)} title={path}>
                            <span className="side-title">{baseName(path)}</span>
                            <StatusChip status={note.status} statuses={statusesOf(index, note)} />
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
          </section>
        );
      })}
      {groups.length === 0 && <p className="empty">没有匹配的笔记</p>}
    </nav>
  );
}
