import { baseName } from "./data";
import type { Note, VaultIndex } from "./types";

// Pure helpers over the index. Nothing here knows a class name or a status name:
// classes, labels and status order all come from the profile through the index.

export const OTHER = "__other";

export type Tone = "todo" | "go" | "done" | "info" | "none";
const TONES: Tone[] = ["todo", "go", "done", "info"];

/** Colour a status by its position in its lifecycle: the first one needs attention. */
export function statusTone(statuses: string[], status: string | null | undefined): Tone {
  const at = status ? statuses.indexOf(status) : -1;
  return at < 0 ? "none" : TONES[Math.min(at, TONES.length - 1)];
}

export function statusesOf(index: VaultIndex, note: Note): string[] {
  return note.class ? (index.classes[note.class]?.status ?? []) : [];
}

export function classLabel(index: VaultIndex, key: string | null): string {
  return key && index.classes[key] ? index.classes[key].label : "其他";
}

export interface Group {
  key: string;
  label: string;
  paths: string[];
}

/** Split note paths into one group per class, in profile order, unmanaged notes last. */
export function groupByClass(index: VaultIndex, paths: string[]): Group[] {
  const buckets = new Map<string, string[]>();
  for (const path of paths) {
    const key = index.notes[path]?.class ?? OTHER;
    buckets.set(key, [...(buckets.get(key) ?? []), path]);
  }
  const order = [...Object.keys(index.classes), OTHER];
  return order
    .filter((key) => buckets.has(key))
    .map((key) => ({ key, label: classLabel(index, key === OTHER ? null : key), paths: buckets.get(key)! }));
}

/** Order by lifecycle position, then by file name. */
export function byStatusThenTitle(index: VaultIndex, paths: string[]): string[] {
  const rank = (path: string) => {
    const note = index.notes[path];
    const at = statusesOf(index, note).indexOf(note.status ?? "");
    return at < 0 ? 99 : at;
  };
  return [...paths].sort((a, b) => rank(a) - rank(b) || baseName(a).localeCompare(baseName(b), "zh-Hans-CN"));
}

/** Folder of a note below its class folder, "" when it sits directly in it. */
export function subFolder(index: VaultIndex, path: string): string {
  const note = index.notes[path];
  const dir = note.class ? index.classes[note.class].dir.replace(/\/+$/, "") : "";
  const rest = dir && path.startsWith(dir + "/") ? path.slice(dir.length + 1) : path;
  const cut = rest.lastIndexOf("/");
  return cut < 0 ? "" : rest.slice(0, cut);
}

export function matchesQuery(path: string, note: Note, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    note.title.toLowerCase().includes(q) ||
    path.toLowerCase().includes(q) ||
    note.headings.some((h) => h.text.toLowerCase().includes(q))
  );
}

export interface ImageGroup {
  set: string;
  kind: string;
}

/** An image's set (its manifest folder) and kind (first folder below the set). */
export function imageGroup(path: string, manifest: string | null): ImageGroup {
  const setDir = manifest ? manifest.slice(0, manifest.lastIndexOf("/")) : path.slice(0, path.lastIndexOf("/"));
  const rest = path.slice(setDir.length + 1);
  const cut = rest.indexOf("/");
  return { set: setDir, kind: cut < 0 ? "" : rest.slice(0, cut) };
}

export const VIA_LABEL: Record<string, string> = { body: "提及", for: "配图" };
