import { baseName } from "./data";
import { isBlank } from "./model";
import type { VaultIndex } from "./types";

// Runs the small part of the Dataview query language that plain listings need:
//
//   TABLE [WITHOUT ID] field [AS "Label"], ...   |   LIST
//   FROM "folder"
//   WHERE field = value AND field != null ...
//   SORT field ASC, field DESC
//
// Anything else (functions, OR, GROUP BY, FLATTEN, tag sources ...) is reported as
// unsupported instead of being guessed at, so a table shown here is always exact.

export interface Column {
  field: string;
  label: string;
}

interface Condition {
  field: string;
  negate: boolean;
  value: string | null;
}

export interface Query {
  kind: "table" | "list";
  withoutId: boolean;
  columns: Column[];
  folder: string;
  where: Condition[];
  sort: { field: string; descending: boolean }[];
}

export interface Row {
  path: string;
  cells: unknown[];
}

const SHAPE =
  /^\s*(TABLE(?:\s+WITHOUT\s+ID)?|LIST)(?=\s|$)([\s\S]*?)\sFROM\s+"([^"]+)"(?:\s+WHERE\s([\s\S]*?))?(?:\s+SORT\s([\s\S]*?))?\s*$/i;
const COLUMN = /^([^\s,"]+)(?:\s+AS\s+"([^"]*)")?$/i;
const CONDITION = /^([^\s!="]+)\s*(!=|=)\s*(null|"[^"]*"|[^\s"]+)$/i;
const ORDER = /^([^\s,"]+)(?:\s+(ASC|DESC))?$/i;

export function parseQuery(source: string): Query | null {
  const match = SHAPE.exec(source);
  if (!match) return null;
  const [, head, columnText, folder, whereText, sortText] = match;
  const kind = /^LIST/i.test(head) ? "list" : "table";

  const columns: Column[] = [];
  if (columnText.trim()) {
    if (kind === "list") return null;
    for (const part of columnText.split(",")) {
      const column = COLUMN.exec(part.trim());
      if (!column) return null;
      columns.push({ field: column[1], label: column[2] ?? column[1] });
    }
  }

  const where: Condition[] = [];
  for (const part of whereText ? whereText.trim().split(/\s+AND\s+/i) : []) {
    const condition = CONDITION.exec(part.trim());
    if (!condition) return null;
    const raw = condition[3];
    where.push({
      field: condition[1],
      negate: condition[2] === "!=",
      value: /^null$/i.test(raw) ? null : raw.replace(/^"|"$/g, "")
    });
  }

  const sort: Query["sort"] = [];
  for (const part of sortText ? sortText.split(",") : []) {
    const order = ORDER.exec(part.trim());
    if (!order) return null;
    sort.push({ field: order[1], descending: /^DESC$/i.test(order[2] ?? "") });
  }

  return { kind, withoutId: /WITHOUT\s+ID/i.test(head), columns, folder: folder.replace(/\/+$/, ""), where, sort };
}

/** The folder a query or a saved view lists, for linking to the table of that folder. */
export function queryFolder(source: string): string | null {
  const match = /\bFROM\s+"([^"]+)"/i.exec(source) ?? /inFolder\(\s*"([^"]+)"\s*\)/.exec(source);
  return match ? match[1].replace(/\/+$/, "") : null;
}

export function fieldValue(index: VaultIndex, path: string, field: string): unknown {
  if (field === "file.name") return baseName(path);
  if (field === "file.folder") return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  if (field === "file.link" || field === "file.path") return path;
  return index.notes[path].frontmatter[field];
}

const text = (value: unknown) => (isBlank(value) ? "" : Array.isArray(value) ? value.join(" ") : String(value));

export function runQuery(query: Query, index: VaultIndex): Row[] {
  const paths = Object.keys(index.notes).filter((path) => path.startsWith(query.folder + "/"));
  const kept = paths.filter((path) =>
    query.where.every((condition) => {
      const value = fieldValue(index, path, condition.field);
      const hit = condition.value === null ? isBlank(value) : text(value) === condition.value;
      return hit !== condition.negate;
    })
  );
  const order = query.sort.length ? query.sort : [{ field: "file.name", descending: false }];
  kept.sort((a, b) => {
    for (const { field, descending } of order) {
      const difference = text(fieldValue(index, a, field)).localeCompare(text(fieldValue(index, b, field)), "zh-Hans-CN", {
        numeric: true
      });
      if (difference) return descending ? -difference : difference;
    }
    return 0;
  });
  return kept.map((path) => ({ path, cells: query.columns.map((column) => fieldValue(index, path, column.field)) }));
}
