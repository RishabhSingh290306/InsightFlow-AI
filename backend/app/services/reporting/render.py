"""Presentation-only renderers for a `Report`.

Both functions take an already-assembled `ReportRead` and resolve each `SectionBlock`
from its `payload` — they never compute artifacts or call the LLM. `report_to_html`
produces a self-contained printable document (used for the public share fallback and
the `export?format=pdf` route); `report_to_markdown` produces GitHub-flavored Markdown.
Charts render as data tables here (the live React view shows interactive Recharts).
"""
from __future__ import annotations

import html
from datetime import datetime

from app.schemas.report import ReportRead, SectionBlock


def _esc(text: str | None) -> str:
    return html.escape(text or "")


def _block_md(block: SectionBlock) -> str:
    if block.kind in ("prose", "custom_note"):
        return block.text or ""
    if block.kind == "chart":
        spec = block.payload
        lines = [f"**{_esc(spec.get('title'))}** ({_esc(spec.get('chart_type'))})",
                 f"_{_esc(spec.get('business_question'))}_"]
        data = spec.get("data", []) or []
        if data:
            cols = list(data[0].keys())
            lines.append("| " + " | ".join(_esc(c) for c in cols) + " |")
            lines.append("| " + " | ".join("---" for _ in cols) + " |")
            for row in data[:20]:
                lines.append("| " + " | ".join(_esc(str(row.get(c, ""))) for c in cols) + " |")
        return "\n".join(lines)
    if block.kind == "sql":
        p = block.payload
        lines = [f"**Q: {_esc(p.get('business_question'))}**"]
        if p.get("explanation"):
            lines.append(_esc(p.get("explanation")))
        lines.append("```sql\n" + _esc(p.get("sql", "")) + "\n```")
        for ins in p.get("insights", []) or []:
            lines.append(f"- {_esc(ins)}")
        return "\n".join(lines)
    if block.kind == "table":
        p = block.payload
        cols = p.get("columns", []) or []
        lines = ["| " + " | ".join(_esc(c) for c in cols) + " |",
                 "| " + " | ".join("---" for _ in cols) + " |"]
        for row in p.get("rows", []) or []:
            lines.append("| " + " | ".join(_esc(str(c)) for c in row) + " |")
        return "\n".join(lines)
    if block.kind == "lineage":
        return "\n".join(
            f"- v{v['version']} · {_esc(v['origin'])} · {_esc(v['filename'])}"
            for v in block.payload.get("versions", [])
        )
    return ""


def report_to_markdown(report: ReportRead) -> str:
    parts = [f"# {report.title}", "", f"_Generated: {report.generated_at}_", ""]
    if not report.ai_available:
        parts.append("_AI narration unavailable — rule-based report._", "")
    for sec in report.sections:
        parts.append(f"## {sec.title}")
        for b in sec.blocks:
            text = _block_md(b)
            if text:
                parts.append(text)
        parts.append("")
    return "\n".join(parts).strip() + "\n"


def _block_html(block: SectionBlock) -> str:
    if block.kind in ("prose", "custom_note"):
        return f"<p>{_esc(block.text)}</p>"
    if block.kind == "chart":
        spec = block.payload
        rows = (spec.get("data", []) or [])
        if not rows:
            return f"<p><em>{_esc(spec.get('title'))}</em> — no data.</p>"
        cols = list(rows[0].keys())
        thead = "<tr>" + "".join(f"<th>{_esc(c)}</th>" for c in cols) + "</tr>"
        body = ""
        for r in rows[:20]:
            body += "<tr>" + "".join(f"<td>{_esc(str(r.get(c, '')))}</td>" for c in cols) + "</tr>"
        return (f"<figure><figcaption><strong>{_esc(spec.get('title'))}</strong> "
                f"({_esc(spec.get('chart_type'))}) — {_esc(spec.get('business_question'))}</figcaption>"
                f"<table><thead>{thead}</thead><tbody>{body}</tbody></table></figure>")
    if block.kind == "sql":
        p = block.payload
        insights = "".join(f"<li>{_esc(i)}</li>" for i in (p.get("insights", []) or []))
        return (f"<div class='sql'><p><strong>Q: {_esc(p.get('business_question'))}</strong></p>"
                f"<p>{_esc(p.get('explanation'))}</p>"
                f"<pre><code>{_esc(p.get('sql', ''))}</code></pre>"
                f"<ul>{insights}</ul></div>")
    if block.kind == "table":
        p = block.payload
        cols = p.get("columns", []) or []
        thead = "<tr>" + "".join(f"<th>{_esc(c)}</th>" for c in cols) + "</tr>"
        body = "".join(
            "<tr>" + "".join(f"<td>{_esc(str(c))}</td>" for c in row) + "</tr>"
            for row in (p.get("rows", []) or [])
        )
        return f"<table><thead>{thead}</thead><tbody>{body}</tbody></table>"
    if block.kind == "lineage":
        items = "".join(
            f"<li>v{v['version']} · {_esc(v['origin'])} · {_esc(v['filename'])}</li>"
            for v in block.payload.get("versions", [])
        )
        return f"<ul>{items}</ul>"
    return ""


_CSS = """
body{font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;color:#111;line-height:1.5}
h1{font-size:1.8rem}h2{font-size:1.3rem;margin-top:2rem;border-bottom:1px solid #eee;padding-bottom:.3rem}
table{border-collapse:collapse;width:100%;margin:.5rem 0;font-size:.9rem}
th,td{border:1px solid #ddd;padding:.35rem .6rem;text-align:left}
pre{background:#f5f5f5;padding:.6rem;border-radius:6px;overflow:auto}
figure{margin:1rem 0}figcaption{font-weight:600;margin-bottom:.3rem}
"""


def report_to_html(report: ReportRead) -> str:
    sections_html = ""
    for sec in report.sections:
        blocks = "".join(_block_html(b) for b in sec.blocks)
        sections_html += f"<section><h2>{_esc(sec.title)}</h2>{blocks}</section>"
    banner = "" if report.ai_available else "<p><em>AI narration unavailable — rule-based report.</em></p>"
    return (
        f"<!DOCTYPE html><html lang='en'><head><meta charset='utf-8'>"
        f"<meta name='viewport' content='width=device-width,initial-scale=1'>"
        f"<title>{_esc(report.title)}</title><style>{_CSS}</style></head>"
        f"<body><h1>{_esc(report.title)}</h1>"
        f"<p><small>Generated: {_esc(str(report.generated_at))}</small></p>{banner}{sections_html}"
        f"<footer><p>Generated with InsightFlow AI</p></footer></body></html>"
    )
