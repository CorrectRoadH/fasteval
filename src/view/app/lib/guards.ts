import type { CodeSource, ObjectRecord, Span, TranscriptEvent } from "../types.ts";

export function asSources(value: unknown): CodeSource[] | null {
  if (!Array.isArray(value)) return null;
  return value.every(isCodeSource) ? value : null;
}

export function isCodeSource(value: unknown): value is CodeSource {
  return isObjectRecord(value) && typeof value.path === "string" && typeof value.content === "string";
}

export function asEvents(value: unknown): TranscriptEvent[] | null {
  if (!Array.isArray(value)) return null;
  return value.every(isTranscriptEvent) ? value : null;
}

export function asSpans(value: unknown): Span[] | null {
  if (!Array.isArray(value)) return null;
  return value.every(isSpan) ? value : null;
}

export function isTranscriptEvent(value: unknown): value is TranscriptEvent {
  if (!isObjectRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "message":
      return (value.role === "assistant" || value.role === "user") && typeof value.text === "string";
    case "action.called":
      return typeof value.callId === "string" && typeof value.name === "string";
    case "action.result":
      return typeof value.callId === "string";
    case "subagent.called":
      return typeof value.callId === "string" && typeof value.name === "string";
    case "subagent.completed":
      return typeof value.callId === "string";
    case "input.requested":
      return isObjectRecord(value.request);
    case "thinking":
      return typeof value.text === "string";
    case "compaction":
      return true;
    case "error":
      return typeof value.message === "string";
    default:
      return false;
  }
}

export function isSpan(value: unknown): value is Span {
  return (
    isObjectRecord(value) &&
    typeof value.traceId === "string" &&
    typeof value.spanId === "string" &&
    typeof value.name === "string" &&
    typeof value.startMs === "number" &&
    typeof value.endMs === "number"
  );
}

export function isObjectRecord(value: unknown): value is ObjectRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
