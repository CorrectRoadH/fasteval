import type { ReactNode } from "react";
import type { SortKey, SortState } from "../types.ts";

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

export function SortHeader({
  name,
  sortKey,
  sort,
  onSort,
}: {
  name: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
}) {
  const sorted = sort.key === sortKey ? (sort.dir === 1 ? "asc" : "desc") : undefined;
  return (
    <th>
      <button data-sorted={sorted} onClick={() => onSort(sortKey)}>
        {name}
      </button>
    </th>
  );
}

export function Kpi({ label, value, className = "", title }: { label: string; value: ReactNode; className?: string; title?: string }) {
  return (
    <div className="detail-kpi">
      <span>{label}</span>
      <b className={className} title={title}>
        {value}
      </b>
    </div>
  );
}
