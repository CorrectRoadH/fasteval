import type { ViewUsage } from "../types.ts";

export function prettyJson(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function previewText(value: string): string {
  return String(value).split("\n").find((line) => line.trim()) || "";
}

export function truncate(value: unknown, n: number): string {
  const str = String(value);
  return str.length > n ? str.slice(0, n) + " ... [+" + (str.length - n) + " chars]" : str;
}

export function formatConfigValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function totalTokens(usage?: ViewUsage): number {
  return (usage?.inputTokens || 0) + (usage?.outputTokens || 0) + (usage?.cacheReadTokens || 0) + (usage?.cacheWriteTokens || 0);
}

export function formatPercent(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0%";
  return Math.round(value * 100) + "%";
}

/** 断言 / judge 分数本就是 0–1,直接展示原值(去掉末尾零),不转百分比。pass-rate 之类的「比率」仍用 formatPercent。 */
export function formatScore(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0";
  return String(Number(value.toFixed(2)));
}

export function formatDuration(ms?: number): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "0ms";
  if (ms >= 60000) return (ms / 60000).toFixed(1) + "m";
  if (ms >= 1000) return (ms / 1000).toFixed(2) + "s";
  return Math.round(ms) + "ms";
}

export function formatTokens(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 1000000) return (value / 1000000).toFixed(2) + "M";
  if (value >= 1000) return (value / 1000).toFixed(1) + "k";
  return String(Math.round(value));
}

export function formatCost(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "$0";
  return "$" + value.toFixed(value < 1 ? 3 : 2);
}

export function formatDateTime(iso?: string): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatClock(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
