import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Phone, MoreVertical, CheckCircle, XCircle, Globe } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const accounts = [
  {
    id: "3773448776290331",
    name: "Mohamed Azab",
    phones: [{ number: "+20 10 04006620", verifiedName: "Mohamed Azab", quality: "GREEN", status: "CONNECTED" }],
    wabaId: "3773448776290331",
    status: "connected",
    templates: 4,
    currency: "USD",
    apps: ["BizWeb", "ASW"],
  },
  {
    id: "1485981793093019",
    name: "Mohamed Azab",
    phones: [{ number: "+20 10 26762988", verifiedName: "Alazab", quality: "GREEN", status: "CONNECTED" }],
    wabaId: "1485981793093019",
    status: "connected",
    templates: 4,
    currency: "USD",
    apps: ["ElevenLabs Agents"],
  },
  {
    id: "2144651456337012",
    name: "Mohamed Azab",
    phones: [{ number: "+1 205-460-5650", verifiedName: "Mohamed Azab", quality: "GREEN", status: "CONNECTED" }],
    wabaId: "2144651456337012",
    status: "connected",
    templates: 9,
    currency: "USD",
    apps: ["ASW", "Kapso"],
  },
  {
    id: "1458856398934130",
    name: "Mohamed Azab",
    phones: [
      { number: "+1 206-479-5608", verifiedName: "Mohamed Azab", quality: "GREEN", status: "CONNECTED" },
      { number: "+1 208-379-9564", verifiedName: "Mohamed Azab", quality: "UNKNOWN", status: "CONNECTED" },
    ],
    wabaId: "1458856398934130",
    status: "connected",
    templates: 20,
    currency: "USD",
    apps: ["ASW"],
  },
  {
    id: "459851797218855",
    name: "alazab",
    phones: [
      { number: "+1 555-728-5727", verifiedName: "alazabfix", quality: "GREEN", status: "CONNECTED" },
      { number: "+1 555-724-5001", verifiedName: "alazab", quality: "GREEN", status: "CONNECTED" },
    ],
    wabaId: "459851797218855",
    status: "connected",
    templates: 34,
    currency: "USD",
    apps: ["ASW"],
  },
  {
    id: "946737044675791",
    name: "UberFix",
    phones: [],
    wabaId: "946737044675791",
    status: "disconnected",
    templates: 0,
    currency: "USD",
    apps: [],
  },
  {
    id: "1198849982358674",
    name: "UberFix",
    phones: [],
    wabaId: "1198849982358674",
    status: "disconnected",
    templates: 5,
    currency: "USD",
    apps: ["ASW", "Jotform Agent"],
  },
  {
    id: "1329792992522819",
    name: "Mohamed Azab",
    phones: [],
    wabaId: "1329792992522819",
    status: "disconnected",
    templates: 0,
    currency: "USD",
    apps: [],
  },
];

const qualityColors: Record<string, string> = {
  GREEN: "bg-success/10 text-success",
  YELLOW: "bg-warning/10 text-warning",
  RED: "bg-destructive/10 text-destructive",
  UNKNOWN: "bg-muted text-muted-foreground",
};

export default function Accounts() {
  const connectedCount = accounts.filter(a => a.status === "connected").length;
  const totalPhones = accounts.reduce((sum, a) => sum + a.phones.length, 0);
  const totalTemplates = accounts.reduce((sum, a) => sum + a.templates, 0);

  return (
    <AppLayout
      title="الحسابات"
      subtitle={`إدارة حسابات واتساب الأعمال — ${connectedCount} متصل من ${accounts.length}`}
      actions={
        <Button size="sm" className="gradient-primary text-primary-foreground">
          <Plus className="h-4 w-4 ml-1" />
          إضافة حساب
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="shadow-card">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">{accounts.length}</p>
              <p className="text-xs text-muted-foreground">حسابات WABA</p>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-success">{totalPhones}</p>
              <p className="text-xs text-muted-foreground">أرقام مرتبطة</p>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-info">{totalTemplates}</p>
              <p className="text-xs text-muted-foreground">إجمالي القوالب</p>
            </CardContent>
          </Card>
        </div>

        {/* Account Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map((account) => (
            <Card key={account.id} className="shadow-card hover:shadow-card-hover transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl gradient-primary flex items-center justify-center">
                      <Phone className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{account.name}</h3>
                      <p className="text-xs text-muted-foreground" dir="ltr">WABA: {account.wabaId}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={account.status === "connected" ? "default" : "destructive"} className="text-xs">
                      {account.status === "connected" ? (
                        <><CheckCircle className="h-3 w-3 ml-1" /> متصل</>
                      ) : (
                        <><XCircle className="h-3 w-3 ml-1" /> غير متصل</>
                      )}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>تعديل</DropdownMenuItem>
                        <DropdownMenuItem>إعادة الاتصال</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">حذف</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Phone Numbers */}
                {account.phones.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {account.phones.map((phone, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs" dir="ltr">{phone.number}</span>
                          <span className="text-xs text-muted-foreground">({phone.verifiedName})</span>
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${qualityColors[phone.quality]}`}>
                          {phone.quality === "GREEN" ? "جودة عالية" : phone.quality === "UNKNOWN" ? "غير محدد" : phone.quality}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {account.phones.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-3 text-center py-2 rounded-lg bg-muted/30">لا توجد أرقام مرتبطة</p>
                )}

                <div className="mt-3 grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-lg bg-muted/50 p-2.5">
                    <p className="text-lg font-bold">{account.templates}</p>
                    <p className="text-xs text-muted-foreground">قوالب</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2.5">
                    <p className="text-lg font-bold">{account.phones.length}</p>
                    <p className="text-xs text-muted-foreground">أرقام</p>
                  </div>
                </div>

                {account.apps.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                    <Globe className="h-3 w-3 text-muted-foreground" />
                    {account.apps.map((app, idx) => (
                      <Badge key={idx} variant="outline" className="text-[10px]">{app}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
