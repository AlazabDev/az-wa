import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readWebhookMonitor } from "@/lib/meta/webhook-monitor.functions";

import { Panel } from "./page-header";
import { StatusBadge } from "./status-badge";

type Source = "audit" | "events" | "unmapped";
type Verification = "all" | "valid" | "invalid";

type Column = {
  key: string;
  label: string;
  kind?: "date" | "mono" | "bool" | "status";
};

const EVENT_TYPES = [
  "messages",
  "message_template_status_update",
  "account_update",
  "account_alerts",
  "account_review_update",
  "business_capability_update",
  "phone_number_quality_update",
  "phone_number_name_update",
  "flows",
];

const SOURCE_LABELS: Record<Source, string> = {
  audit: "Request Audit",
  events: "Processed Events",
  unmapped: "Unmapped Numbers",
};

const COLUMNS: Record<Source, Column[]> = {
  audit: [
    { key: "received_at", label: "Received", kind: "date" },
    { key: "method", label: "Method", kind: "mono" },
    { key: "event_type", label: "Event" },
    { key: "verification_type", label: "Verification" },
    { key: "verification_valid", label: "Valid", kind: "bool" },
    { key: "http_status", label: "HTTP", kind: "mono" },
    { key: "meta_phone_number_id", label: "Phone Number ID", kind: "mono" },
    { key: "meta_waba_id", label: "WABA ID", kind: "mono" },
  ],
  events: [
    { key: "received_at", label: "Received", kind: "date" },
    { key: "event_type", label: "Event" },
    { key: "signature_valid", label: "Signature", kind: "bool" },
    { key: "status", label: "Status", kind: "status" },
    { key: "attempts", label: "Attempts", kind: "mono" },
    { key: "meta_phone_number_id", label: "Phone Number ID", kind: "mono" },
    { key: "meta_waba_id", label: "WABA ID", kind: "mono" },
    { key: "processed_at", label: "Processed", kind: "date" },
  ],
  unmapped: [
    { key: "last_seen_at", label: "Last seen", kind: "date" },
    { key: "meta_phone_number_id", label: "Phone Number ID", kind: "mono" },
    { key: "meta_waba_id", label: "WABA ID", kind: "mono" },
    { key: "display_phone_number", label: "Display number", kind: "mono" },
    { key: "occurrences", label: "Occurrences", kind: "mono" },
    { key: "resolved", label: "Resolved", kind: "bool" },
    { key: "first_seen_at", label: "First seen", kind: "date" },
  ],
};

function SelectField({
  value,
  onChange,
  children,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  ariaLabel: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring"
    >
      {children}
    </select>
  );
}

function renderCell(value: unknown, kind: Column["kind"]) {
  if (value === null || value === undefined || value === "") return "—";

  if (kind === "date") {
    return <span className="whitespace-nowrap text-xs text-muted-foreground">{new Date(String(value)).toLocaleString()}</span>;
  }
  if (kind === "mono") return <span className="font-mono text-xs">{String(value)}</span>;
  if (kind === "status") return <StatusBadge value={String(value)} />;
  if (kind === "bool") {
    return value ? (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
        <CheckCircle2 className="size-3.5" /> Yes
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
        <CircleAlert className="size-3.5" /> No
      </span>
    );
  }
  return <span className="text-sm">{String(value)}</span>;
}

export function WebhookTrafficMonitor() {
  const readMonitor = useServerFn(readWebhookMonitor);
  const [source, setSource] = useState<Source>("audit");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [eventType, setEventType] = useState("");
  const [verification, setVerification] = useState<Verification>("all");
  const [verificationType, setVerificationType] = useState("");
  const [httpStatus, setHttpStatus] = useState("");
  const [eventStatus, setEventStatus] = useState("");

  const queryInput = useMemo(
    () => ({
      source,
      page,
      pageSize: 50,
      search,
      eventType: source === "unmapped" ? "" : eventType,
      verificationType: source === "audit" ? verificationType : "",
      verification,
      httpStatus: source === "audit" ? httpStatus : "",
      eventStatus: source === "audit" ? "" : eventStatus,
    }),
    [source, page, search, eventType, verificationType, verification, httpStatus, eventStatus],
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["webhook-monitor", queryInput],
    queryFn: () => readMonitor({ data: queryInput }),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });

  const rows = data?.rows ?? [];
  const columns = COLUMNS[source];

  function changeSource(next: Source) {
    setSource(next);
    setPage(1);
  }

  function resetPage(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  return (
    <Panel
      title="Live Webhook Traffic"
      actions={
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-1.5 size-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(SOURCE_LABELS) as Source[]).map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={source === item ? "default" : "outline"}
              onClick={() => changeSource(item)}
            >
              {SOURCE_LABELS[item]}
            </Button>
          ))}
          <span className="ml-auto self-center text-xs text-muted-foreground">
            Live refresh: 5s{data?.refreshedAt ? ` · ${new Date(data.refreshedAt).toLocaleTimeString()}` : ""}
          </span>
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
          <Input
            value={search}
            onChange={(event) => resetPage(setSearch, event.target.value)}
            placeholder="Phone Number ID / WABA ID"
            className="xl:col-span-2"
          />

          {source !== "unmapped" ? (
            <>
              <Input
                list="webhook-event-types"
                value={eventType}
                onChange={(event) => resetPage(setEventType, event.target.value)}
                placeholder="Event type"
              />
              <datalist id="webhook-event-types">
                {EVENT_TYPES.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </>
          ) : null}

          {source !== "unmapped" ? (
            <SelectField
              ariaLabel="Verification state"
              value={verification}
              onChange={(value) => {
                setVerification(value as Verification);
                setPage(1);
              }}
            >
              <option value="all">All verification</option>
              <option value="valid">Verified</option>
              <option value="invalid">Failed verification</option>
            </SelectField>
          ) : null}

          {source === "audit" ? (
            <>
              <SelectField
                ariaLabel="Verification type"
                value={verificationType}
                onChange={(value) => resetPage(setVerificationType, value)}
              >
                <option value="">All methods</option>
                <option value="verify_token">Verify Token</option>
                <option value="signature">X-Hub-Signature-256</option>
              </SelectField>
              <SelectField
                ariaLabel="HTTP status"
                value={httpStatus}
                onChange={(value) => resetPage(setHttpStatus, value)}
              >
                <option value="">All HTTP</option>
                <option value="200">200</option>
                <option value="400">400</option>
                <option value="401">401</option>
                <option value="403">403</option>
                <option value="503">503</option>
              </SelectField>
            </>
          ) : (
            <SelectField
              ariaLabel="Processing state"
              value={eventStatus}
              onChange={(value) => resetPage(setEventStatus, value)}
            >
              <option value="">All states</option>
              {source === "events" ? (
                <>
                  <option value="received">Received</option>
                  <option value="processing">Processing</option>
                  <option value="processed">Processed</option>
                  <option value="failed">Failed</option>
                  <option value="unmapped_number_event">Unmapped</option>
                </>
              ) : (
                <>
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                </>
              )}
            </SelectField>
          )}
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                {columns.map((column) => (
                  <th key={column.key} className="whitespace-nowrap px-3 py-2 font-medium">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={String(row["id"] ?? index)} className="border-b border-border/60 last:border-0">
                  {columns.map((column) => (
                    <td key={column.key} className="px-3 py-2 align-top">
                      {renderCell(row[column.key], column.kind)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {isLoading ? <p className="py-10 text-center text-sm text-muted-foreground">Loading webhook traffic…</p> : null}
          {isError ? (
            <p className="py-10 text-center text-sm text-destructive">
              {error instanceof Error ? error.message : "Unable to load webhook traffic"}
            </p>
          ) : null}
          {!isLoading && !isError && rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No matching webhook records.</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            {data?.total.toLocaleString() ?? 0} records · page {data?.page ?? page} of {data?.totalPages ?? 1}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft className="mr-1 size-3.5" /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= (data?.totalPages ?? 1) || isFetching}
              onClick={() => setPage((current) => current + 1)}
            >
              Next <ChevronRight className="ml-1 size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
