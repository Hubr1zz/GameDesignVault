import type { Commit, LintReport, VaultData, VaultIndex } from "./types";

// Every request is a relative GET, so the same build works behind `vault.py serve`
// and as a static export under any base path.

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

export const fileUrl = (path: string) => `files/${encodePath(path)}`;
export const thumbUrl = (path: string) => `thumbs/${encodePath(path)}.webp`;

async function getJson<T>(name: string): Promise<T> {
  const response = await fetch(`data/${name}`, { cache: "no-cache" });
  if (!response.ok) throw new Error(`data/${name}: ${response.status}`);
  return (await response.json()) as T;
}

export async function loadData(): Promise<VaultData> {
  const [index, lint, log] = await Promise.all([
    getJson<VaultIndex>("index.json"),
    getJson<LintReport>("lint.json"),
    getJson<Commit[]>("log.json")
  ]);
  // A server started before an update may still send the older, smaller index.
  index.views ??= {};
  for (const spec of Object.values(index.classes)) {
    spec.fields ??= [];
    spec.required ??= spec.fields;
  }
  for (const note of Object.values(index.notes)) note.excerpt ??= "";
  return { index, lint, log };
}

export async function loadNoteText(path: string): Promise<string> {
  const response = await fetch(fileUrl(path), { cache: "no-cache" });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.text();
}

const IMAGE = /\.(webp|png|jpe?g|gif|svg|bmp|tiff?)$/i;
export const isImage = (path: string) => IMAGE.test(path);
export const isNote = (path: string) => /\.md$/i.test(path);

/** File name without folder and without the .md extension. */
export function baseName(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return isNote(name) ? name.slice(0, -3) : name;
}
