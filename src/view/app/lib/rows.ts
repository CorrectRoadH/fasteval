import type { ReactNode } from "react";
import type { SortKey, ViewResult, ViewRow } from "../types.ts";
import type { T } from "../shared.ts";
import { formatConfigValue, totalTokens } from "./format.ts";

export function resultFromUrl(rows: ViewRow[]): ViewResult | null {
  const p = new URLSearchParams(location.search);
  const id = p.get("modal");
  if (!id) return null;
  const exp = p.get("exp");
  const attempt = parseInt(p.get("a") ?? "0", 10);
  for (const row of rows) {
    for (const result of row.results ?? []) {
      if (result.id === id && (!exp || result.experimentId === exp) && result.attempt === attempt) {
        return result;
      }
    }
  }
  return null;
}

export function buildGroupMap(rows: ViewRow[]): Map<string, ViewRow[]> {
  const map = new Map<string, ViewRow[]>();
  for (const row of rows) {
    if (!row.group) continue;
    if (!map.has(row.group)) map.set(row.group, []);
    map.get(row.group)?.push(row);
  }
  return map;
}

export function compareRows(a: ViewRow, b: ViewRow, key: SortKey): number {
  const av = valueFor(a, key);
  const bv = valueFor(b, key);
  if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv));
  return Number(av) - Number(bv);
}

export function valueFor(row: ViewRow, key: SortKey): string | number {
  if (key === "experiment") return row.label;
  if (key === "model") return row.model || "";
  if (key === "agent") return row.agent;
  if (key === "cost") return row.estimatedCostUSD || 0;
  if (key === "tokens") return totalTokens(row.usage);
  return row[key] || 0;
}

export function configChips(row: ViewRow, t: T): [string, ReactNode][] {
  const exp = row.experiment || {};
  const flags = exp.flags && Object.keys(exp.flags).length
    ? Object.entries(exp.flags).map(([k, v]) => k + "=" + formatConfigValue(v)).join(", ")
    : t("config.flagsNone");
  return [
    [t("config.experiment"), row.experimentId || row.label],
    [t("table.model"), row.model || t("config.default")],
    ["agent", row.agent],
    ["runs", exp.runs ?? row.runs],
    ["earlyExit", exp.earlyExit === undefined ? t("config.notApplicable") : String(exp.earlyExit)],
    ["sandbox", exp.sandbox || t("config.default")],
    ["budget", exp.budget === undefined ? t("config.none") : "$" + exp.budget],
    ["flags", flags],
  ];
}
