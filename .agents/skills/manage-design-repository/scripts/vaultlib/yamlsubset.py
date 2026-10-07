"""A dependency-free reader and writer for the YAML subset this workflow uses:
nested maps, lists of scalars (block or inline) and plain or quoted scalars."""
from __future__ import annotations

import re

FRONTMATTER = re.compile(r"\A---[ \t]*\r?\n(.*?)(?:\r?\n)?---[ \t]*(?:\r?\n|\Z)", re.S)
_ESCAPES = {"n": "\n", "t": "\t", '"': '"', "\\": "\\"}
_ESCAPED = re.compile(r"\\(.)")


def _scalar(raw: str):
    s = raw.strip()
    if s in ("", "~", "null"):
        return None
    if len(s) >= 2 and s[0] == s[-1] == "'":
        return s[1:-1]
    if len(s) >= 2 and s[0] == s[-1] == '"':
        return _ESCAPED.sub(lambda m: _ESCAPES.get(m.group(1), m.group(0)), s[1:-1])
    return s


def _strip_comment(line: str) -> str:
    quote, skip = None, False
    for i, ch in enumerate(line):
        if skip:
            skip = False
        elif quote:
            if ch == "\\" and quote == '"':
                skip = True
            elif ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
        elif ch == "#" and (i == 0 or line[i - 1] in " \t"):
            return line[:i]
    return line


def _split_key(line: str):
    """Split `key: rest` at the first colon outside quotes."""
    quote = None
    for i, ch in enumerate(line):
        if quote:
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
        elif ch == ":" and (i + 1 == len(line) or line[i + 1] in " \t"):
            return line[:i], line[i + 1:]
    return None, None


def _inline_list(s: str) -> list:
    items, cur, quote, skip = [], "", None, False
    for ch in s.strip()[1:-1]:
        if skip:
            cur, skip = cur + ch, False
        elif quote:
            cur += ch
            if ch == "\\" and quote == '"':
                skip = True
            elif ch == quote:
                quote = None
        elif ch in "\"'":
            quote, cur = ch, cur + ch
        elif ch == ",":
            items.append(cur)
            cur = ""
        else:
            cur += ch
    if cur.strip():
        items.append(cur)
    return [_scalar(x) for x in items]


def parse_yaml(text: str):
    rows = []
    for raw in text.lstrip("﻿").splitlines():
        line = _strip_comment(raw).rstrip()
        if line.strip():
            rows.append((len(line) - len(line.lstrip(" ")), line.strip()))

    def block(i: int, indent: int):
        if i < len(rows) and rows[i][1].startswith("- "):
            out = []
            while i < len(rows) and rows[i][0] >= indent and rows[i][1].startswith("- "):
                out.append(_scalar(rows[i][1][2:]))
                i += 1
            return out, i
        out = {}
        while i < len(rows) and rows[i][0] == indent and not rows[i][1].startswith("- "):
            key, rest = _split_key(rows[i][1])
            if key is None:
                raise ValueError(f"cannot parse line: {rows[i][1]!r}")
            key, rest = _scalar(key), rest.strip()
            i += 1
            if rest in (">", ">-", "|", "|-"):
                parts = []
                while i < len(rows) and rows[i][0] > indent:
                    parts.append(rows[i][1])
                    i += 1
                out[key] = " ".join(parts)
            elif rest.startswith("[") and rest.endswith("]"):
                out[key] = _inline_list(rest)
            elif rest == "{}":
                out[key] = {}
            elif rest:
                out[key] = _scalar(rest)
            elif i < len(rows) and (rows[i][0] > indent or (rows[i][0] == indent and rows[i][1].startswith("- "))):
                out[key], i = block(i, rows[i][0])
            else:
                out[key] = None
        return out, i

    if not rows:
        return {}
    value, _ = block(0, rows[0][0])
    return value


def split_note(text: str):
    """Return (frontmatter dict or None, body)."""
    text = text.lstrip("﻿")
    m = FRONTMATTER.match(text)
    if not m:
        return None, text
    try:
        data = parse_yaml(m.group(1))
    except ValueError:
        return {"__unparsable__": True}, text[m.end():]
    return (data if isinstance(data, dict) else {}), text[m.end():]


def quote(value) -> str:
    """Write a scalar as a double-quoted YAML string."""
    s = "" if value is None else str(value)
    for raw, escaped in (("\\", "\\\\"), ('"', '\\"'), ("\n", "\\n"), ("\t", "\\t")):
        s = s.replace(raw, escaped)
    return '"' + s + '"'


def inline_list(values) -> str:
    return "[" + ", ".join(quote(x) for x in values or []) + "]"
