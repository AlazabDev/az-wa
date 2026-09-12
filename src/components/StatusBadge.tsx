import { Badge } from "@/components/ui/badge";

type StatusType = "success" | "warning" | "danger" | "info" | "neutral";

interface StatusBadgeProps {
  status: StatusType;
  label: string;
}

const statusStyles: Record<StatusType, string> = {
  success: "bg-success/10 text-success border-success/20 hover:bg-success/15",
  warning: "bg-warning/10 text-warning border-warning/20 hover:bg-warning/15",
  danger: "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/15",
  info: "bg-info/10 text-info border-info/20 hover:bg-info/15",
  neutral: "bg-muted text-muted-foreground border-border hover:bg-muted/80",
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <Badge variant="outline" className={`text-xs font-medium ${statusStyles[status]}`}>
      {label}
    </Badge>
  );
}
