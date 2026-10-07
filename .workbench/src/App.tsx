import { useCallback, useEffect, useState } from "react";
import { ArtBoard } from "./components/ArtBoard";
import { Inbox } from "./components/Inbox";
import { NotePage } from "./components/NotePage";
import { Sidebar } from "./components/Sidebar";
import { loadData } from "./data";
import { artHref, inboxHref, noteHref, useRoute } from "./router";
import type { VaultData } from "./types";

export function App() {
  const route = useRoute();
  const [data, setData] = useState<VaultData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    loadData()
      .then((next) => {
        setError(null);
        // Keep the old object when nothing changed so open views do not reload.
        setData((previous) => (previous && previous.index.generated === next.index.generated ? previous : next));
      })
      .catch((reason) => setError(String(reason)));
  }, []);

  useEffect(() => {
    refresh();
    // Files change underneath us (an agent, an editor); look again when the tab is used.
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  if (error && !data) return <p className="boot">无法读取数据：{error}</p>;
  if (!data) return <p className="boot">加载中…</p>;

  const { index, lint, log } = data;
  const home = index.notes["README.md"] ? "README.md" : Object.keys(index.notes)[0];
  const notePath = route.view === "note" ? route.path : route.view === "home" ? home : undefined;
  const waiting = Object.values(index.notes).filter((note) => {
    const statuses = note.class ? (index.classes[note.class]?.status ?? []) : [];
    return statuses.length > 0 && note.status === statuses[0];
  }).length;

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href={noteHref(home)}>{index.project ?? "设计工作台"}</a>
        <nav className="views">
          <a className={notePath ? "on" : ""} href={noteHref(home)}>文档</a>
          <a className={route.view === "art" ? "on" : ""} href={artHref()}>
            美术 <span className="count">{Object.keys(index.images).length}</span>
          </a>
          <a className={route.view === "inbox" ? "on" : ""} href={inboxHref}>
            收件箱 <span className="count">{waiting}</span>
          </a>
        </nav>
        <span className="spacer" />
        <a className={`health ${lint.errors ? "bad" : "good"}`} href={inboxHref} title="lint 结果">
          {lint.errors ? `${lint.errors} 个错误` : "检查通过"}
          {lint.warnings ? ` · ${lint.warnings} 个警告` : ""}
        </a>
        <button className="refresh" onClick={refresh} title={`索引生成于 ${index.generated}`}>刷新</button>
      </header>

      {notePath !== undefined && (
        <div className="docs">
          <Sidebar index={index} current={notePath} />
          <NotePage index={index} path={notePath} anchor={route.view === "note" ? route.anchor : undefined} />
        </div>
      )}
      {route.view === "art" && <ArtBoard index={index} selected={route.image} />}
      {route.view === "inbox" && <Inbox index={index} lint={lint} log={log} />}
    </div>
  );
}
