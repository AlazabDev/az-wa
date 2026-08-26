import { cn } from "@/lib/utils";

const tone: Record<string, string> = {
  healthy: "bg-success/12 text-success border-success/30",
  pass: "bg-success/12 text-success border-success/30",
  warning: "bg-warning/15 text-warning-foreground border-warning/40",
  critical: "bg-destructive/12 text-destructive border-destructive/30",
  fail: "bg-destructive/12 text-destructive border-destructive/30",
  offline: "bg-muted text-muted-foreground border-border",
  unknown: "bg-muted text-muted-foreground border-border",
  active: "bg-success/12 text-success border-success/30",
  missing: "bg-destructive/12 text-destructive border-destructive/30",
  disabled: "bg-muted text-muted-foreground border-border",
  pending: "bg-warning/15 text-warning-foreground border-warning/40",
};

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  const key = value.toLowerCase();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        tone[key] ?? "bg-muted text-muted-foreground border-border",
        className,
      )}
    >
      {value}
    </span>
  );
}
