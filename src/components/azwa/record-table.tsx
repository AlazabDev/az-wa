import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { readRecordTable } from "@/lib/record-table.functions";
import { Button } from "@/components/ui/button";

import { Panel } from "./page-header";
import { StatusBadge } from "./status-badge";

type Row = Record<string, unknown>;

export type Column = {
  key: string;
  label: string;
  kind?: "text" | "mono" | "status" | "date" | "json" | "bool";
};

function renderCell(value: unknown, kind: Column["kind"]) {
  if (value === null || value === undefined || value === "") return "—";
  switch (kind) {
    case "status":
      return <StatusBadge value={String(value)} />;
    case "date":
      return (
        <span className="text-xs text-muted-foreground">
          {new Date(String(value)).toLocaleString()}
        </span>
      );
    case "mono":
      return <span className="font-mono text-xs">{String(value)}</span>;
    case "bool":
      return <StatusBadge value={value ? "enabled" : "disabled"} />;
    case "json":
      return (
        <span className="line-clamp-2 max-w-md font-mono text-[11px] text-muted-foreground">
          {JSON.stringify(value)}
        </span>
      );
    default:
      return <span className="text-sm">{String(value)}</span>;
  }
}

export function RecordTable({
  table,
  columns,
  orderBy = "created_at",
  limit = 100,
  title,
  emptyLabel = "No records yet.",
  searchText = "",
  searchKeys = [],
  filters = {},
  actions,
}: {
  table: string;
  columns: Column[];
  orderBy?: string;
  limit?: number;
  title?: string;
  emptyLabel?: string;
  searchText?: string;
  searchKeys?: string[];
  filters?: Record<string, string | undefined>;
  actions?: React.ReactNode;
}) {
  const readRecords = useServerFn(readRecordTable);
  const [page, setPage] = useState(1);

  const {
    data,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["record-table", table, orderBy, limit, page],
    queryFn: () => readRecords({ data: { table, orderBy, limit, page } }),
    refetchInterval: 30_000,
    // Reset to page 1 if filters/search change handled by parent
  });

  const rows: Row[] = data?.rows ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;
  const currentPage = data?.page ?? page;

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredRows = rows.filter((row) => {
    const passesSearch =
      !normalizedSearch ||
      (searchKeys.length > 0 ? searchKeys : columns.map((col) => col.key)).some((key) =>
        String(row[key] ?? "")
          .toLowerCase()
          .includes(normalizedSearch),
      );

    const passesFilters = Object.entries(filters).every(
      ([key, value]) => !value || String(row[key] ?? "") === value,
    );

    return passesSearch && passesFilters;
  });

  const panelActions = (
    <div className="flex items-center gap-3">
      {actions}
      {totalPages > 1 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>
            {(currentPage - 1) * limit + 1}–{Math.min(currentPage * limit, total)} / {total}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="tabular-nums">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={page >= totalPages || isLoading}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <Panel {...(title ? { title } : {})} actions={panelActions}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-muted-foreground">
              {columns.map((c) => (
                <th key={c.key} className="py-2 pr-4 font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, i) => (
              <tr key={String(row["id"] ?? i)} className="border-b border-border/60 last:border-0">
                {columns.map((c) => (
                  <td key={c.key} className="py-2 pr-4 align-top">
                    {renderCell(row[c.key], c.kind)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {isError ? (
          <p className="py-8 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : "Unable to load records"}
          </p>
        ) : null}

        {!isLoading && !isError && filteredRows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : null}

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : null}
      </div>

      {/* Bottom pagination for large datasets */}
      {totalPages > 1 && !isLoading && (
        <div className="flex items-center justify-between border-t border-border pt-3 mt-3">
          <p className="text-xs text-muted-foreground">
            {total.toLocaleString()} total records · page {currentPage} of {totalPages}
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage(1)}
            >
              First
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage(totalPages)}
            >
              Last
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
