// The shape of data/index.json, data/lint.json and data/log.json as written by vaultlib.

export interface Heading {
  level: number;
  text: string;
}

export interface Link {
  target: string;
  via: string;
  anchor?: string;
}

export interface Note {
  title: string;
  class: string | null;
  type: string | null;
  status: string | null;
  frontmatter: Record<string, unknown>;
  headings: Heading[];
  links: Link[];
  unresolved: string[];
  /** Wiki-link target as written -> vault path, or null when it does not resolve. */
  targets: Record<string, string | null>;
  /** Markdown link destination as written -> vault path, or null. */
  hrefs: Record<string, string | null>;
  /** First line of prose, as plain text. */
  excerpt: string;
}

export interface ImageRecord {
  manifest: string | null;
  status: string | null;
  for: string[];
  note: string;
  kb: number;
}

export interface ClassSpec {
  type: string;
  dir: string;
  label: string;
  status: string[];
  /** Frontmatter keys every note of the class must have. */
  required: string[];
  /** Frontmatter keys the class carries, required ones first. */
  fields: string[];
}

export interface Backlink {
  source: string;
  via: string;
}

export interface VaultIndex {
  generated: string;
  project: string | null;
  classes: Record<string, ClassSpec>;
  image_status: string[];
  notes: Record<string, Note>;
  images: Record<string, ImageRecord>;
  backlinks: Record<string, Backlink[]>;
  /** Saved views of a note tool (for example *.base) -> the folders they filter on. */
  views: Record<string, string[]>;
}

export interface LintItem {
  level: "error" | "warning";
  check: string;
  where: string;
  message: string;
}

export interface LintReport {
  errors: number;
  warnings: number;
  items: LintItem[];
}

export interface Commit {
  hash: string;
  date: string;
  author: string;
  category: string | null;
  summary: string;
}

export interface VaultData {
  index: VaultIndex;
  lint: LintReport;
  log: Commit[];
}
