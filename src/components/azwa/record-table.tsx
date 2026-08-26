import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
}: {
  table: string;
  columns: Column[];
  orderBy?: string;
  limit?: number;
  title?: string;
  emptyLabel?: string;
}) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["record-table", table, orderBy, limit],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from(table as any)
        .select("*")
        .order(orderBy, { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    refetchInterval: 30_000,
  });

  return (
    <Panel title={title}>
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
            {data.map((row, i) => (
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
        {!isLoading && data.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        )}
        {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
      </div>
    </Panel>
  );
}
