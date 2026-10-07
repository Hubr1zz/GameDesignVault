"""A local, read-only web server for the workbench. It listens on this machine only."""
from __future__ import annotations

import json
import mimetypes
import os
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from . import site
from .model import PROFILE, Vault

TYPES = {".md": "text/markdown; charset=utf-8", ".yml": "text/plain; charset=utf-8",
         ".webp": "image/webp", ".svg": "image/svg+xml", ".js": "text/javascript; charset=utf-8",
         ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8",
         ".json": "application/json; charset=utf-8"}


class Site:
    """The vault and its derived data, rebuilt when a file changes."""

    def __init__(self, root: Path, dist: Path | None):
        self.root, self.dist = root, dist
        self._lock = threading.Lock()
        self._checked = 0.0
        self._signature = None
        self.vault: Vault | None = None
        self.data: dict[str, bytes] = {}
        self.files: set[str] = set()
        self.images: set[str] = set()

    def _scan(self, ignore_dirs):
        count, newest = 0, (self.root / PROFILE).stat().st_mtime_ns
        for d, dirs, names in os.walk(self.root):
            rel = Path(d).relative_to(self.root).as_posix()
            dirs[:] = [x for x in dirs if not x.startswith(".")
                       and (x if rel == "." else f"{rel}/{x}") not in ignore_dirs]
            for n in names:
                count += 1
                try:
                    newest = max(newest, os.stat(os.path.join(d, n)).st_mtime_ns)
                except OSError:
                    pass
        return count, newest

    def refresh(self):
        with self._lock:
            now = time.monotonic()
            if self.vault is not None and now - self._checked < 1.0:
                return
            self._checked = now
            if self.vault is not None and self._scan(self.vault.ignore_dirs) == self._signature:
                return
            self.vault = Vault(self.root)
            self._signature = self._scan(self.vault.ignore_dirs)
            self.data = {name: json.dumps(value, ensure_ascii=False).encode("utf-8")
                         for name, value in site.data(self.vault).items()}
            self.files = set(self.vault.files)
            self.images = set(self.vault.images())


class Handler(BaseHTTPRequestHandler):
    site: Site
    server_version = "vault-workbench"

    def log_message(self, *args):
        pass

    def _send(self, body: bytes, content_type: str, status: int = 200):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _missing(self):
        self._send(b"not found", "text/plain; charset=utf-8", 404)

    def _file(self, path: Path):
        kind = TYPES.get(path.suffix.lower()) or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        self._send(path.read_bytes(), kind)

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        s = self.site
        try:
            s.refresh()
            path = unquote(urlparse(self.path).path).lstrip("/")
            if path.startswith("data/"):
                body = s.data.get(path[5:])
                return self._send(body, TYPES[".json"]) if body is not None else self._missing()
            if path.startswith("files/"):
                rel = path[6:]
                # Only files the vault indexes are served: nothing hidden, nothing outside it.
                return self._file(s.root / rel) if rel in s.files else self._missing()
            if path.startswith("thumbs/") and path.endswith(".webp"):
                rel = path[7:-5]
                if rel not in s.images:
                    return self._missing()
                small = site.thumbnail(s.vault, rel)
                return self._send(small, TYPES[".webp"]) if small is not None else self._file(s.root / rel)
            if s.dist is None:
                return self._send("The workbench front end has not been built. Run `npm install` and "
                                  f"`npm run build` in {site.WORKBENCH}/.".encode("utf-8"),
                                  "text/plain; charset=utf-8", 503)
            target = (s.dist / (path or "index.html")).resolve()
            if s.dist.resolve() not in target.parents or not target.is_file():
                return self._missing()
            self._file(target)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as exc:  # keep serving; show the problem to whoever asked
            self._send(f"error: {exc}".encode("utf-8"), "text/plain; charset=utf-8", 500)


def make_server(root: Path, port: int, dist: Path | None, tries: int = 20) -> ThreadingHTTPServer:
    handler = type("BoundHandler", (Handler,), {"site": Site(root, dist)})
    last = None
    for candidate in range(port, port + tries):
        try:
            return ThreadingHTTPServer(("127.0.0.1", candidate), handler)
        except OSError as exc:
            last = exc
    raise SystemExit(f"error: no free port between {port} and {port + tries - 1} ({last})")


def run(v: Vault, port: int = 8765, open_browser: bool = True, build: bool = True) -> int:
    dist = site.ensure_frontend(v.root, build)
    server = make_server(v.root, port, dist)
    url = f"http://127.0.0.1:{server.server_address[1]}/"
    print(f"workbench: {url}  (read-only, this machine only; Ctrl+C to stop)")
    if open_browser:
        threading.Timer(0.5, webbrowser.open, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0
