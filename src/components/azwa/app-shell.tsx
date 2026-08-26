import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Bot,
  Boxes,
  Building2,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  Inbox,
  Image,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Megaphone,
  Network,
  Phone,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  Webhook,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { ScopeSelector } from "./scope-selector";
import { useNumbers } from "@/lib/azwa-data";
import { StatusBadge } from "./status-badge";

type NavItem = { label: string; to?: string; icon: typeof Inbox; phase?: string };

const NAV: Array<{ section?: string; items: NavItem[] }> = [
  {
    items: [
      { label: "Overview", to: "/dashboard", icon: LayoutDashboard },
      { label: "Inbox", icon: Inbox, phase: "Phase 4" },
      { label: "Contacts", icon: Users, phase: "Phase 4" },
      { label: "Media", icon: Image, phase: "Phase 5" },
      { label: "Templates", icon: FileText, phase: "Phase 6" },
      { label: "Campaigns", icon: Megaphone, phase: "Phase 6" },
      { label: "Automation", icon: Bot, phase: "Phase 6" },
    ],
  },
  {
    section: "WhatsApp Infrastructure",
    items: [
      { label: "Business Portfolio", to: "/infrastructure", icon: Building2 },
      { label: "WABAs", to: "/wabas", icon: Network },
      { label: "Phone Numbers", to: "/numbers", icon: Phone },
      { label: "Webhooks", to: "/webhooks", icon: Webhook },
      { label: "Credentials", to: "/credentials", icon: KeyRound },
    ],
  },
  {
    section: "Operations",
    items: [
      { label: "Health & Diagnostics", to: "/health", icon: Activity },
      { label: "Alerts", icon: Bell, phase: "Phase 7" },
      { label: "Errors", icon: AlertTriangle, phase: "Phase 7" },
      { label: "Queues", to: "/queues", icon: ListChecks },
      { label: "Dead Letter Queue", to: "/queues", icon: Boxes },
      { label: "API Logs", to: "/api-logs", icon: ScrollText },
      { label: "Webhook Events", to: "/webhooks", icon: Webhook },
    ],
  },
  {
    section: "Analytics",
    items: [
      { label: "Analytics", icon: BarChart3, phase: "Phase 7" },
      { label: "Reports", icon: BarChart3, phase: "Phase 7" },
    ],
  },
  {
    section: "Administration",
    items: [
      { label: "Users & Roles", to: "/users", icon: ShieldCheck },
      { label: "Audit Logs", to: "/audit", icon: ScrollText },
      { label: "Settings", to: "/settings", icon: Settings },
    ],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: numbers = [] } = useNumbers();

  const critical = numbers.filter((n) => n.health === "critical").length;
  const warning = numbers.filter((n) => n.health === "warning").length;
  const systemHealth = critical > 0 ? "critical" : warning > 0 ? "warning" : "healthy";

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "sticky top-0 flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-200",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary font-bold text-sidebar-primary-foreground">
            A
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-tight">AzWA</div>
              <div className="truncate text-[10px] uppercase tracking-widest opacity-70">
                Operations OS
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-4">
          {NAV.map((group, gi) => (
            <div key={gi}>
              {group.section && !collapsed && (
                <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest opacity-50">
                  {group.section}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = item.to && pathname === item.to;
                  const content = (
                    <>
                      <Icon className="size-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {!collapsed && item.phase && (
                        <span className="ml-auto rounded bg-sidebar-accent px-1.5 py-0.5 text-[9px] uppercase opacity-70">
                          {item.phase}
                        </span>
                      )}
                    </>
                  );
                  return item.to ? (
                    <Link
                      key={item.label}
                      to={item.to}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        active && "bg-sidebar-accent text-sidebar-accent-foreground",
                      )}
                    >
                      {content}
                    </Link>
                  ) : (
                    <div
                      key={item.label}
                      title="Not built yet — later delivery phase"
                      className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-3 py-2 text-sm opacity-45"
                    >
                      {content}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 border-t border-sidebar-border px-4 py-3 text-xs hover:bg-sidebar-accent"
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-border bg-card px-6">
          <ScopeSelector />
          <div className="ml-auto flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">System health</span>
              <StatusBadge value={systemHealth} />
            </div>
            <button
              onClick={() => supabase.auth.signOut()}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent"
            >
              <LogOut className="size-3.5" /> Sign out
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
