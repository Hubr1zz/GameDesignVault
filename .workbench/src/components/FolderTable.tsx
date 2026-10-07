import { useMemo, useState } from "react";
import { StatusChip, Tag } from "./Chip";
import { baseName } from "../data";
import { valueHtml } from "../markdown";
import { classesInFolder, isBlank, statusTone } from "../model";
import { noteHref } from "../router";
import type { VaultIndex } from "../types";

interface Props {
  index: VaultIndex;
  folder: string;
}

interface Sort {
  column: string;
  descending: boolean;
}

const compare = (a: string, b: string) => a.localeCompare(b, "zh-Hans-CN", { numeric: true });
const plain = (value: unknown) => (isBlank(value) ? "" : Array.isArray(value) ? value.join(" ") : String(value));

/** Every managed note of one class folder as a searchable, sortable table.
 *  Columns come from the profile: the fields of the classes that live there. */
export function FolderTable({ index, folder }: Props) {
  const keys = useMemo(() => classesInFolder(index, folder), [index, folder]);
  const paths = useMemo(
    () => Object.keys(index.notes).filter((path) => keys.includes(index.notes[path].class ?? "")),
    [index, keys]
  );
  const fields = useMemo(
    () =>
      [...new Set(keys.flatMap((key) => index.classes[key].fields))].filter(
        (field) =>
          field !== "status" &&
          // A field that only repeats the file name in every row adds nothing as a column.
          !(paths.length > 0 && paths.every((path) => plain(index.notes[path].frontmatter[field]) === baseName(path)))
      ),
    [index, keys, paths]
  );
  const statuses = useMemo(() => [...new Set(keys.flatMap((key) => index.classes[key].status))], [index, keys]);

  const [query, setQuery] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [onlyBlank, setOnlyBlank] = useState(false);
  const [sort, setSort] = useState<Sort>({ column: "name", descending: false });

  const hasBlank = (path: string) => {
    const note = index.notes[path];
    return (note.class ? index.classes[note.class].required : []).some((field) => isBlank(note.frontmatter[field]));
  };

  const sortKey = (path: string): string => {
    const note = index.notes[path];
    if (sort.column === "name") return baseName(path);
    if (sort.column === "class") return note.class ? index.classes[note.class].label : "";
    if (sort.column === "status") return String(statuses.indexOf(note.status ?? "") + 1).padStart(3, "0");
    if (sort.column === "excerpt") return note.excerpt;
    return plain(note.frontmatter[sort.column]);
  };

  const needle = query.trim().toLowerCase();
  const rows = paths
    .filter((path) => {
      const note = index.notes[path];
      if (statuses.length && hidden.has(note.status ?? "")) return false;
      if (onlyBlank && !hasBlank(path)) return false;
      if (!needle) return true;
      const haystack = [baseName(path), note.excerpt, ...fields.map((field) => plain(note.frontmatter[field]))];
      return haystack.some((value) => value.toLowerCase().includes(needle));
    })
    .sort((a, b) => {
      const difference = compare(sortKey(a), sortKey(b)) || compare(baseName(a), baseName(b));
      return sort.descending ? -difference : difference;
    });

  if (keys.length === 0) {
    return (
      <main className="note-main">
        <p className="empty">“{folder}” 不是受管理的文档目录。</p>
      </main>
    );
  }

  const columns = [
    { id: "name", label: "名称" },
    ...(keys.length > 1 ? [{ id: "class", label: "类" }] : []),
    ...(statuses.length ? [{ id: "status", label: "状态" }] : []),
    ...fields.map((field) => ({ id: field, label: field })),
    { id: "excerpt", label: "摘要" }
  ];
  const blankCount = paths.filter(hasBlank).length;
  const count = (status: string) => paths.filter((path) => index.notes[path].status === status).length;

  return (
    <main className="note-main table-main">
      <header className="table-head">
        <h1>
          {folder} <span className="count">{rows.length} / {paths.length}</span>
        </h1>
        <div className="table-bar">
          <input
            className="search"
            type="search"
            placeholder="搜索名称、字段或摘要"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
          />
          {statuses.map((status) => {
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
                {status} {count(status)}
              </button>
            );
          })}
          <button
            className={`chip tone-todo ${onlyBlank ? "" : "off"}`}
            aria-pressed={onlyBlank}
            onClick={() => setOnlyBlank(!onlyBlank)}
            title="只显示必填字段没有填的条目"
          >
            字段未填 {blankCount}
          </button>
        </div>
      </header>

      <table className="folder-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.id}>
                <button
                  onClick={() =>
                    setSort({ column: column.id, descending: sort.column === column.id && !sort.descending })
                  }
                >
                  {column.label}
                  {sort.column === column.id ? (sort.descending ? " ↓" : " ↑") : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((path) => {
            const note = index.notes[path];
            const spec = note.class ? index.classes[note.class] : undefined;
            return (
              <tr key={path}>
                <td className="cell-name">
                  <a href={noteHref(path)} title={path}>{baseName(path)}</a>
                </td>
                {keys.length > 1 && <td>{spec && <Tag>{spec.label}</Tag>}</td>}
                {statuses.length > 0 && (
                  <td>
                    <StatusChip status={note.status} statuses={spec?.status ?? []} />
                  </td>
                )}
                {fields.map((field) => (
                  <td
                    key={field}
                    dangerouslySetInnerHTML={{
                      // A field another class in this folder owns is simply not applicable here.
                      __html: spec?.fields.includes(field) ? valueHtml(note.frontmatter[field], path, note, index) : ""
                    }}
                  />
                ))}
                <td className="cell-excerpt">{note.excerpt}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty">没有符合条件的条目</p>}
    </main>
  );
}
