import { useEffect, useState } from "react";

// Hash routes keep the build usable from any folder without server-side routing.

export type Route =
  | { view: "note"; path: string; anchor?: string }
  | { view: "art"; image?: string }
  | { view: "table"; folder: string }
  | { view: "inbox" }
  | { view: "home" };

export function parseRoute(hash: string): Route {
  const [rawPath, rawQuery = ""] = hash.replace(/^#\/?/, "").split("?");
  const query = new URLSearchParams(rawQuery);
  const [view, ...rest] = rawPath.split("/");
  if (view === "note" && rest.length) {
    return { view: "note", path: decodeURIComponent(rest.join("/")), anchor: query.get("h") ?? undefined };
  }
  if (view === "art") return { view: "art", image: query.get("image") ?? undefined };
  if (view === "table" && rest.length) return { view: "table", folder: decodeURIComponent(rest.join("/")) };
  if (view === "inbox") return { view: "inbox" };
  return { view: "home" };
}

export function noteHref(path: string, anchor?: string): string {
  return `#/note/${encodeURIComponent(path)}${anchor ? `?h=${encodeURIComponent(anchor)}` : ""}`;
}

export function artHref(image?: string): string {
  return image ? `#/art?image=${encodeURIComponent(image)}` : "#/art";
}

export const inboxHref = "#/inbox";

/** The table of every managed note in one class folder. */
export const tableHref = (folder: string) => `#/table/${encodeURIComponent(folder)}`;

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
