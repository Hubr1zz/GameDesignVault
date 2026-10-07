import { useState } from "react";
import { StatusChip, Tag } from "./Chip";
import { baseName, isNote } from "../data";
import { statusTone, subFolder } from "../model";
import { noteHref } from "../router";
import type { Commit, LintReport, VaultIndex } from "../types";

interface Props {
  index: VaultIndex;
  lint: LintReport;
  log: Commit[];
}

/** What is waiting for a decision: every class that has a lifecycle, opened on its
 *  first status, plus the lint report and the recent commits. */
export function Inbox({ index, lint, log }: Props) {
  const lifecycles = Object.entries(index.classes).filter(([, spec]) => spec.status.length > 0);
  return (
    <main className="inbox">
      <div className="inbox-main">
        {lifecycles.map(([key]) => (
          <ClassCard key={key} index={index} classKey={key} />
        ))}
      </div>
      <div className="inbox-side">
        <LintCard lint={lint} index={index} />
        <LogCard log={log} />
      </div>
    </main>
  );
}

function ClassCard({ index, classKey }: { index: VaultIndex; classKey: string }) {
  const spec = index.classes[classKey];
  const [status, setStatus] = useState(spec.status[0]);
  const paths = Object.keys(index.notes).filter((p) => index.notes[p].class === classKey);
  const count = (s: string) => paths.filter((p) => index.notes[p].status === s).length;
  const created = (p: string) => String(index.notes[p].frontmatter.created ?? "");
  const shown = paths
    .filter((p) => index.notes[p].status === status)
    .sort((a, b) => created(b).localeCompare(created(a)) || a.localeCompare(b, "zh-Hans-CN"));

  return (
    <section className="card-panel">
      <header>
        <h2>{spec.label}</h2>
        <div className="tabs">
          {spec.status.map((s) => (
            <button
              key={s}
              className={`chip tone-${statusTone(spec.status, s)} ${s === status ? "" : "off"}`}
              aria-pressed={s === status}
              onClick={() => setStatus(s)}
            >
              {s} {count(s)}
            </button>
          ))}
        </div>
      </header>
      {shown.length === 0 && <p className="empty">没有处于 {status} 的条目</p>}
      <ul className="rows">
        {shown.map((path) => {
          const note = index.notes[path];
          const fm = note.frontmatter;
          const folder = subFolder(index, path);
          return (
            <li key={path}>
              <a href={noteHref(path)}>{baseName(path)}</a>
              <span className="row-meta">
                {folder && <Tag>{folder}</Tag>}
                {typeof fm.scope === "string" && <Tag>{fm.scope}</Tag>}
                {typeof fm.owner === "string" && fm.owner && <Tag>{fm.owner}</Tag>}
                {typeof fm.created === "string" && <span className="date">{fm.created}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function LintCard({ lint, index }: { lint: LintReport; index: VaultIndex }) {
  return (
    <section className="card-panel">
      <header>
        <h2>检查结果</h2>
        <div className="tabs">
          <span className={`chip ${lint.errors ? "tone-bad" : "tone-go"}`}>{lint.errors} 个错误</span>
          <span className={`chip ${lint.warnings ? "tone-todo" : "tone-done"}`}>{lint.warnings} 个警告</span>
        </div>
      </header>
      {lint.items.length === 0 && <p className="empty">全部通过</p>}
      <ul className="rows lint">
        {lint.items.map((item, i) => {
          const where = item.where.replace(/:\d+$/, "");
          return (
            <li key={i} className={item.level}>
              <div>
                <Tag>{item.check}</Tag>{" "}
                {isNote(where) && index.notes[where] ? <a href={noteHref(where)}>{item.where}</a> : item.where}
              </div>
              <div className="lint-message">{item.message}</div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function LogCard({ log }: { log: Commit[] }) {
  const days = new Map<string, Commit[]>();
  for (const commit of log.slice(0, 40)) days.set(commit.date, [...(days.get(commit.date) ?? []), commit]);
  return (
    <section className="card-panel">
      <header>
        <h2>最近修改</h2>
      </header>
      {log.length === 0 && <p className="empty">没有提交记录</p>}
      {[...days.entries()].map(([date, commits]) => (
        <div key={date} className="log-day">
          <h3>{date}</h3>
          <ul className="rows">
            {commits.map((commit) => (
              <li key={commit.hash} title={`${commit.hash} · ${commit.author}`}>
                {commit.category && <Tag>{commit.category}</Tag>} {commit.summary}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
