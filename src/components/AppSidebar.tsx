import {
  LayoutDashboard,
  Settings,
  Building2,
  MessageCircle,
  Webhook,
  WalletCards,
  FileText,
  GitBranch,
  Users,
  Wrench,
  HardHat,
  FolderKanban,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useRouterState } from "@tanstack/react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

const productionItems = [
  { title: "لوحة التحكم", url: "/legacy", icon: LayoutDashboard },
  { title: "صندوق الوارد", url: "/legacy/inbox", icon: MessageCircle },
  { title: "المالية", url: "/legacy/finance", icon: WalletCards },
  { title: "الويب هوك", url: "/legacy/webhooks", icon: Webhook },
  { title: "الإعدادات", url: "/legacy/settings", icon: Settings },
];

const developmentItems = [
  { title: "المشاريع (تجريبي)", url: "/legacy/projects", icon: FolderKanban },
  { title: "العملاء (تجريبي)", url: "/legacy/clients", icon: Users },
  { title: "الصيانة (تجريبي)", url: "/legacy/maintenance", icon: Wrench },
  { title: "الفرق (تجريبي)", url: "/legacy/teams", icon: HardHat },
  { title: "الحسابات (تجريبي)", url: "/legacy/accounts", icon: Building2 },
  { title: "القوالب (تجريبي)", url: "/legacy/templates", icon: FileText },
  { title: "التدفقات (تجريبي)", url: "/legacy/flows", icon: GitBranch },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (path: string) =>
    path === "/legacy" ? pathname === path : pathname.startsWith(path);
  const items = import.meta.env.DEV ? [...productionItems, ...developmentItems] : productionItems;

  return (
    <Sidebar collapsible="icon" side="right">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="gradient-primary rounded-lg p-2 flex-shrink-0">
            <Building2 className="h-5 w-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="text-right">
              <h2 className="text-sm font-bold text-sidebar-accent-foreground">
                WhatsApp Business Hub
              </h2>
              <p className="text-xs text-sidebar-foreground">Alazab</p>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/60 text-xs">
            التشغيل
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink
                      to={item.url}
                      end={item.url === "/legacy"}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 ml-2" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
