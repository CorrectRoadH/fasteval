import type { ReactNode } from "react";
import type { T } from "../shared.ts";
import type { Span, ViewJson } from "../types.ts";
import { formatDuration } from "../lib/format.ts";

export function Trace({ spans, t }: { spans: Span[]; t: T }) {
  if (!spans?.length) return <div className="trace-span-meta">{t("trace.noSpans")}</div>;
  const t0 = Math.min(...spans.map((s) => s.startMs));
  const t1 = Math.max(...spans.map((s) => s.endMs));
  const total = Math.max(1, t1 - t0);
  const byId = new Map(spans.map((s) => [s.spanId, s]));
  const depthOf = (span: Span): number => {
    let depth = 0;
    let cur = span;
    const seen = new Set();
    while (cur && cur.parentSpanId && byId.has(cur.parentSpanId) && !seen.has(cur.spanId)) {
      seen.add(cur.spanId);
      const next = byId.get(cur.parentSpanId);
      if (!next) break;
      cur = next;
      depth++;
      if (depth > 40) break;
    }
    return depth;
  };
  const ordered = [...spans].sort((a, b) => a.startMs - b.startMs || depthOf(a) - depthOf(b));
  return (
    <div className="trace">
      <div className="trace-span-meta">
        {t("trace.total")} {formatDuration(total)} · {spans.length} {t("trace.spans")} · {t("trace.clickDetails")}
      </div>
      {ordered.map((span) => {
        const left = ((span.startMs - t0) / total) * 100;
        const width = Math.max(0.6, ((span.endMs - span.startMs) / total) * 100);
        const kind = span.kind || "other";
        const tone = span.status === "error" ? "bad" : "k-" + kind;
        const detail = spanAttrs(span.attributes);
        const row = (
          <summary className="trace-row">
            <div className="trace-label" style={{ paddingLeft: depthOf(span) * 12 }} title={span.name}>
              {kind !== "other" ? <span className={`kind-chip k-${kind}`}>{kind}</span> : null}
              {span.name}
            </div>
            <div className="trace-track">
              <div className={`trace-bar ${tone}`} style={{ left: `${left}%`, width: `${width}%` }} />
            </div>
            <div className="trace-dur num">{formatDuration(span.endMs - span.startMs)}</div>
          </summary>
        );
        return detail ? (
          <details className="span-d" key={span.spanId}>
            {row}
            {detail}
          </details>
        ) : (
          <div className="span-d" key={span.spanId}>
            {row}
          </div>
        );
      })}
    </div>
  );
}

export function spanAttrs(attrs?: Record<string, ViewJson>): ReactNode {
  if (!attrs) return null;
  const hide = /^(code\.|thread\.|target$|busy_ns$|idle_ns$|rpc\.|app_server\.)/;
  const keys = Object.keys(attrs).filter((k) => !hide.test(k));
  if (!keys.length) return null;
  const io = keys.filter((k) => k.startsWith("io."));
  const rest = keys.filter((k) => !k.startsWith("io.")).sort();
  return (
    <div className="span-attrs">
      {io.map((key) => {
        const label = key.replace(/^io\./, "");
        const value = String(attrs[key]);
        return label === "input" || label === "output" ? (
          <div className="attr-io" key={key}>
            <span className="attr-k">{label}</span>
            <pre className="attr-pre">{value}</pre>
          </div>
        ) : (
          <AttrRow key={key} label={label} value={value} />
        );
      })}
      {rest.map((key) => (
        <AttrRow key={key} label={key} value={typeof attrs[key] === "object" ? JSON.stringify(attrs[key]) : String(attrs[key])} />
      ))}
    </div>
  );
}

export function AttrRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="attr-row">
      <span className="attr-k">{label}</span>
      <span className="attr-v">{value}</span>
    </div>
  );
}
