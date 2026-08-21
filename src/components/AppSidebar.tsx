import { LayoutDashboard, Settings, Building2, MessageCircle, Webhook, WalletCards, FileText, GitBranch, Users, Wrench, HardHat, FolderKanban } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, useSidebar } from "@/components/ui/sidebar";

const productionItems = [
  { title: "لوحة التحكم", url: "/", icon: LayoutDashboard },
  { title: "صندوق الوارد", url: "/inbox", icon: MessageCircle },
  { title: "المالية", url: "/finance", icon: WalletCards },
  { title: "الويب هوك", url: "/webhooks", icon: Webhook },
  { title: "الإعدادات", url: "/settings", icon: Settings },
];

const developmentItems = [
  { title: "المشاريع (تجريبي)", url: "/projects", icon: FolderKanban },
  { title: "العملاء (تجريبي)", url: "/clients", icon: Users },
  { title: "الصيانة (تجريبي)", url: "/maintenance", icon: Wrench },
  { title: "الفرق (تجريبي)", url: "/teams", icon: HardHat },
  { title: "الحسابات (تجريبي)", url: "/accounts", icon: Building2 },
  { title: "القوالب (تجريبي)", url: "/templates", icon: FileText },
  { title: "التدفقات (تجريبي)", url: "/flows", icon: GitBranch },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const items = import.meta.env.DEV ? [...productionItems, ...developmentItems] : productionItems;

  return (
    <Sidebar collapsible="icon" side="right">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="gradient-primary rounded-lg p-2 flex-shrink-0"><Building2 className="h-5 w-5 text-primary-foreground" /></div>
          {!collapsed && <div className="text-right"><h2 className="text-sm font-bold text-sidebar-accent-foreground">WhatsApp Business Hub</h2><p className="text-xs text-sidebar-foreground">Alazab</p></div>}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/60 text-xs">التشغيل</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink to={item.url} end={item.url === "/"} className="hover:bg-sidebar-accent/50" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
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
