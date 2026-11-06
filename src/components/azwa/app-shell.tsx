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
  ChevronsLeft,
  ChevronsRight,
  Files,
  FileText,
  GitBranch,
  Inbox,
  Menu,
  X,
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
      { label: "قوالب الرسائل", to: "/templates", icon: FileText },
      { label: "تدفقات واتساب", to: "/flows", icon: GitBranch },
      { label: "الحملات", to: "/campaigns", icon: Megaphone },
      { label: "الأتمتة", to: "/automation", icon: Bot },
    ],
  },
  {
    section: "إدارة واتساب",
    items: [
      { label: "المحافظ التجارية", to: "/infrastructure", icon: Building2 },
      { label: "حسابات واتساب للأعمال", to: "/wabas", icon: Network },
      { label: "أرقام الهواتف", to: "/numbers", icon: Phone },
      { label: "تطبيق Meta", to: "/meta-app", icon: AppWindow },
      { label: "خطافات الويب", to: "/webhooks", icon: Webhook },
      { label: "مفاتيح الربط", to: "/credentials", icon: KeyRound },
    ],
  },
  {
    section: "التشغيل والمراقبة",
    items: [
      { label: "المراقبة المباشرة", to: "/monitor", icon: Activity },
      { label: "الصحة والتشخيص", to: "/health", icon: Activity },
      { label: "التنبيهات", to: "/alerts", icon: Bell },
      { label: "مصادر الإشعارات", to: "/notifications", icon: Bell },
      { label: "الأخطاء", to: "/errors", icon: AlertTriangle },
      { label: "تشخيص المزامنة بالذكاء الاصطناعي", to: "/sync-doctor", icon: AlertTriangle },
      { label: "قوائم الانتظار", to: "/queues", icon: ListChecks },
      { label: "الرسائل المتعثرة", to: "/dead-letter", icon: Boxes },
      { label: "سجل واجهات API", to: "/api-logs", icon: ScrollText },
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
      { label: "مراجعة تطبيق Meta", to: "/app-review", icon: Video },
      { label: "المستخدمون والصلاحيات", to: "/users", icon: ShieldCheck },
      { label: "سجل التدقيق", to: "/audit", icon: ScrollText },
      { label: "الإعدادات", to: "/settings", icon: Settings },
    ],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [email, setEmail] = useState("");
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: numbers = [] } = useNumbers();

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (mounted) setEmail(data.user?.email ?? "");
    }).catch(() => {
      if (mounted) setEmail("");
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [mobileOpen]);

  const critical = numbers.filter((number) => number.health === "critical").length;
  const warning = numbers.filter((number) => number.health === "warning").length;
  const systemHealth = critical > 0 ? "critical" : warning > 0 ? "warning" : "healthy";

  return (
    <div dir="rtl" className="flex min-h-screen bg-background text-foreground">
      {mobileOpen && (
        <button
          type="button"
          aria-label="إغلاق القائمة"
          className="fixed inset-0 z-30 bg-[#030957]/45 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        id="azwa-main-navigation"
        aria-label="التنقل الرئيسي"
        className={cn(
          "fixed inset-y-0 right-0 z-40 flex h-dvh flex-col border-l border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl transition-transform duration-200 lg:sticky lg:top-0 lg:z-10 lg:h-screen lg:translate-x-0 lg:shadow-none",
          mobileOpen ? "translate-x-0" : "translate-x-full",
          collapsed ? "w-72 lg:w-[76px]" : "w-72 lg:w-[264px]",
        )}
      >
        <div className="flex h-17 shrink-0 items-center gap-3 border-b border-sidebar-border px-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground shadow-sm">
            A
          </div>
          {(!collapsed || mobileOpen) && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-extrabold tracking-tight">AzWA</div>
              <div className="truncate text-[11px] text-muted-foreground">إدارة أعمال واتساب</div>
            </div>
          )}
          <button type="button" className="rounded-md p-2 hover:bg-sidebar-accent lg:hidden" onClick={() => setMobileOpen(false)} aria-label="إغلاق القائمة">
            <X className="size-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 py-5" aria-label="الأقسام">
          {NAV.map((group, groupIndex) => (
            <div key={groupIndex}>
              {group.section && (!collapsed || mobileOpen) && (
                <div className="px-3 pb-2 text-[11px] font-bold text-muted-foreground">
                  {group.section}
                </div>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(`${item.to}/`));
                  return (
                    <Link
                      key={`${groupIndex}-${item.to}-${item.label}`}
                      to={item.to}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        active && "bg-[color:var(--azwa-nav-active)] font-semibold text-[color:var(--azwa-nav-active-text)]",
                      )}
                    >
                      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
                      {(!collapsed || mobileOpen) && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="hidden items-center gap-3 border-t border-sidebar-border px-5 py-4 text-xs hover:bg-sidebar-accent lg:flex"
          aria-label={collapsed ? "توسيع القائمة" : "طي القائمة"}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronsLeft className="size-4" /> : <ChevronsRight className="size-4" />}
          {!collapsed && <span>طي القائمة</span>}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur-sm sm:px-6">
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-lg border border-border lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="فتح القائمة"
            aria-controls="azwa-main-navigation"
            aria-expanded={mobileOpen}
          >
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 flex-1"><ScopeSelector /></div>
          <div className="flex items-center gap-3 text-xs sm:gap-4">
            <div className="hidden items-center gap-2 sm:flex">
              <span className="text-muted-foreground">حالة النظام</span>
              <StatusBadge value={systemHealth} />
            </div>
            <span
              dir="ltr"
              className="hidden min-w-0 max-w-[220px] truncate text-xs text-muted-foreground md:block"
              title={email}
            >
              {email || "—"}
            </span>
            <button
              type="button"
              onClick={() => {
                void supabase.auth.signOut().finally(() => {
                  window.location.assign("/auth");
                });
              }}
              className="flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent"
            >
              <LogOut className="size-4" /> <span className="hidden sm:inline">تسجيل الخروج</span>
            </button>
          </div>
        </header>
        <main id="main-content" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
