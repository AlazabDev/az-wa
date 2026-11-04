import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  AppWindow,
  BarChart3,
  Bell,
  Bot,
  Boxes,
  Building2,
  ChevronLeft,
  ChevronRight,
  Files,
  FileText,
  GitBranch,
  Inbox,
  Image,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Megaphone,
  MessageCircle,
  Network,
  Phone,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  Video,
  Webhook,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { ScopeSelector } from "./scope-selector";
import { useNumbers } from "@/lib/azwa-data";
import { StatusBadge } from "./status-badge";

type NavItem = { label: string; to: string; icon: typeof Inbox };
type NavGroup = { section?: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    items: [
      { label: "لوحة المعلومات", to: "/dashboard", icon: LayoutDashboard },
      { label: "صندوق الوارد", to: "/inbox", icon: Inbox },
      { label: "جهات الاتصال", to: "/contacts", icon: Users },
      { label: "الوسائط", to: "/media", icon: Image },
      { label: "الملفات", to: "/files", icon: Files },
      { label: "القوالب", to: "/templates", icon: FileText },
      { label: "التدفقات", to: "/flows", icon: GitBranch },
      { label: "الحملات", to: "/campaigns", icon: Megaphone },
      { label: "الأتمتة", to: "/automation", icon: Bot },
    ],
  },
  {
    section: "التكامل",
    items: [
      { label: "البنية التحتية", to: "/infrastructure", icon: Building2 },
      { label: "حسابات WABA", to: "/wabas", icon: Network },
      { label: "أرقام الواتساب", to: "/numbers", icon: Phone },
      { label: "تطبيق Meta", to: "/meta-app", icon: AppWindow },
      { label: "الويبهوك", to: "/webhooks", icon: Webhook },
      { label: "مفاتيح API", to: "/credentials", icon: KeyRound },
    ],
  },
  {
    section: "التشغيل",
    items: [
      { label: "المراقبة الحية", to: "/monitor", icon: Activity },
      { label: "الصحة والتشخيص", to: "/health", icon: Activity },
      { label: "التنبيهات", to: "/alerts", icon: Bell },
      { label: "الأخطاء", to: "/errors", icon: AlertTriangle },
      { label: "طبيب المزامنة (AI)", to: "/sync-doctor", icon: AlertTriangle },
      { label: "الطوابير", to: "/queues", icon: ListChecks },
      { label: "الرسائل المتعطلة", to: "/dead-letter", icon: Boxes },
      { label: "سجلات API", to: "/api-logs", icon: ScrollText },
    ],
  },
  {
    section: "التحليلات",
    items: [
      { label: "التحليلات", to: "/analytics", icon: BarChart3 },
      { label: "التقارير", to: "/reports", icon: BarChart3 },
    ],
  },
  {
    section: "الإدارة",
    items: [
      { label: "استوديو مراجعة Meta", to: "/app-review", icon: Video },
      { label: "المستخدمون والأدوار", to: "/users", icon: ShieldCheck },
      { label: "سجلات التدقيق", to: "/audit", icon: ScrollText },
      { label: "الإعدادات", to: "/settings", icon: Settings },
    ],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [email, setEmail] = useState("");
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: numbers = [] } = useNumbers();

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active && data.user?.email) setEmail(data.user.email);
    });
    return () => {
      active = false;
    };
  }, []);

  const critical = numbers.filter((number) => number.health === "critical").length;
  const warning = numbers.filter((number) => number.health === "warning").length;
  const systemHealth = critical > 0 ? "critical" : warning > 0 ? "warning" : "healthy";
  const initial = email ? email.charAt(0).toUpperCase() : "A";

  return (
    <div className="flex h-screen min-h-0 bg-background">
      <aside
        className={cn(
          "flex h-screen shrink-0 flex-col border-l border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-200",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <MessageCircle className="size-5" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-foreground">AzWA</div>
              <div className="truncate text-[11px] text-muted-foreground">نظام إدارة واتساب</div>
            </div>
          )}
          <button
            onClick={() => setCollapsed((value) => !value)}
            title={collapsed ? "توسيع القائمة" : "طي القائمة"}
            className="mr-auto rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {collapsed ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 py-4">
          {NAV.map((group, groupIndex) => (
            <div key={groupIndex}>
              {group.section && !collapsed && (
                <div className="px-3 pb-1.5 text-[11px] font-medium text-muted-foreground">
                  {group.section}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.to;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted hover:text-foreground",
                        active &&
                          "bg-sidebar-accent font-medium text-sidebar-accent-foreground hover:bg-sidebar-accent",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-sidebar-border px-3 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {initial}
            </div>
            {!collapsed && (
              <span
                dir="ltr"
                className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
                title={email}
              >
                {email || "—"}
              </span>
            )}
            <button
              onClick={() => {
                void supabase.auth.signOut().finally(() => {
                  window.location.assign("/auth");
                });
              }}
              title="تسجيل الخروج"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-5">
          <div className="flex items-center gap-2">
            <MessageCircle className="size-5 text-primary" />
            <span className="text-sm font-bold text-foreground">AzWA</span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <ScopeSelector />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">حالة النظام</span>
              <StatusBadge value={systemHealth} />
            </div>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
