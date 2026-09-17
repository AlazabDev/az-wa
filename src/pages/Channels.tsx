import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Settings, 
  MessageSquare, 
  MessageCircle, 
  Instagram, 
  Send,
  Mail,
  Twitter,
  Music2,
  Headset
} from "lucide-react";

export default function Channels() {
  const channels = [
    {
      id: "dealchat",
      name: "ديل شات - DealChat",
      icon: <div className="relative">
        <MessageCircle className="w-8 h-8 text-blue-500" />
        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
          <span className="text-[8px] font-bold text-white">...</span>
        </div>
      </div>,
      status: "مفعلة",
      statusColor: "success",
      description: "ويب شات + تطبيق PWA",
      actions: [
        { label: "إدارة ومعاينة", variant: "default" },
        { label: "إعدادات", variant: "outline" }
      ]
    },
    {
      id: "whatsapp",
      name: "واتساب",
      icon: <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center text-white"><MessageSquare className="w-6 h-6" /></div>,
      status: "مربوط",
      statusColor: "success",
      description: "1 / 1 حسابات",
      actions: [
        { label: "إعدادات", variant: "outline" }
      ]
    },
    {
      id: "instagram",
      name: "انستجرام DM",
      icon: <div className="w-10 h-10 bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-500 rounded-xl flex items-center justify-center text-white"><Instagram className="w-6 h-6" /></div>,
      status: "غير مربوط",
      statusColor: "secondary",
      description: "0 / 1 حسابات",
      actions: [
        { label: "ربط", variant: "outline" }
      ]
    },
    {
      id: "messenger",
      name: "ماسنجر",
      icon: <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center text-white"><MessageCircle className="w-6 h-6" /></div>,
      status: "غير مربوط",
      statusColor: "secondary",
      description: "0 / 1 حسابات",
      actions: [
        { label: "ربط", variant: "outline" }
      ]
    },
    {
      id: "telegram",
      name: "تيليجرام",
      icon: <div className="w-10 h-10 bg-sky-500 rounded-xl flex items-center justify-center text-white"><Send className="w-6 h-6" /></div>,
      status: "غير مربوط",
      statusColor: "secondary",
      description: "0 / 1 حسابات",
      actions: [
        { label: "ربط", variant: "outline" }
      ]
    },
    {
      id: "email",
      name: "البريد الإلكتروني",
      icon: <div className="w-10 h-10 bg-slate-700 rounded-xl flex items-center justify-center text-white"><Mail className="w-6 h-6" /></div>,
      status: "غير مربوط",
      statusColor: "secondary",
      description: "0 / 1 حسابات",
      actions: [
        { label: "ربط", variant: "outline" }
      ]
    },
    {
      id: "twitter",
      name: "X (تويتر)",
      icon: <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center text-white"><Twitter className="w-6 h-6" /></div>,
      status: "غير مربوط",
      statusColor: "secondary",
      description: "0 / 1 حسابات",
      actions: [
        { label: "ربط", variant: "outline" }
      ]
    },
    {
      id: "tiktok",
      name: "تيك توك",
      icon: <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center text-white"><Music2 className="w-6 h-6" /></div>,
      status: "قريباً",
      statusColor: "purple",
      description: "",
      actions: [
        { label: "أبلغني", variant: "outline" }
      ]
    }
  ];

  return (
    <AppLayout
      title="القنوات – أومني تشانل"
      subtitle="كل قناة بحالتها وقدراتها — والأتمتة والذكاء يتكيفان تلقائياً مع ما تدعمه كل قناة."
    >
      <div className="space-y-6" dir="rtl">
        <Card className="shadow-sm border-border rounded-xl overflow-hidden relative">
          <div className="absolute inset-0 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5"></div>
          
          <CardContent className="p-0 relative z-10 bg-card/50 backdrop-blur-sm">
            <div className="divide-y divide-border">
              {channels.map((channel, i) => (
                <div key={channel.id} className="flex items-center justify-between p-5 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-4">
                    {channel.icon}
                    <div className="flex flex-col">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-[15px]">{channel.name}</span>
                        {channel.status && (
                          <Badge 
                            variant={
                              channel.statusColor === 'success' ? 'default' : 
                              channel.statusColor === 'purple' ? 'outline' : 'secondary'
                            }
                            className={
                              channel.statusColor === 'success' ? 'bg-[#25D366] hover:bg-[#20bd5a] text-white border-transparent shadow-sm' :
                              channel.statusColor === 'purple' ? 'border-purple-300 bg-purple-50 text-purple-600 shadow-sm' : 'shadow-sm'
                            }
                          >
                            {channel.status}
                          </Badge>
                        )}
                        {channel.description && (
                          <span className="text-xs text-muted-foreground font-mono bg-muted/60 px-2 py-0.5 rounded-md">
                            {channel.description}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {channel.actions.map((action, j) => (
                      <Button 
                        key={j} 
                        variant={action.variant as any} 
                        className={
                          action.variant === 'default' 
                            ? "bg-[#25D366] hover:bg-[#20bd5a] text-white shadow-sm font-medium" 
                            : "border-[#25D366]/50 text-[#25D366] hover:bg-[#25D366]/10 hover:text-[#20bd5a] font-medium"
                        }
                        size="sm"
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="fixed bottom-6 right-6 z-50">
        <Button className="rounded-full h-12 pr-4 pl-2 bg-[#25D366] hover:bg-[#20bd5a] shadow-lg text-white gap-3">
          تواصل مع الدعم
          <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center text-white">
            <Headset className="w-4 h-4" />
          </div>
        </Button>
      </div>
    </AppLayout>
  );
}
