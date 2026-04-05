import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Phone, MoreVertical, CheckCircle, XCircle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const accounts = [
  {
    id: 1,
    name: "متجر الإلكترونيات",
    phone: "+966 50 123 4567",
    businessId: "1234567890",
    status: "connected",
    templates: 5,
    flows: 3,
    messagesThisMonth: "8.2K",
  },
  {
    id: 2,
    name: "مطعم السعادة",
    phone: "+966 55 987 6543",
    businessId: "0987654321",
    status: "connected",
    templates: 3,
    flows: 2,
    messagesThisMonth: "5.1K",
  },
  {
    id: 3,
    name: "متجر الأزياء",
    phone: "+966 54 111 2233",
    businessId: "1122334455",
    status: "disconnected",
    templates: 4,
    flows: 1,
    messagesThisMonth: "0",
  },
  {
    id: 4,
    name: "عيادة الصحة",
    phone: "+966 56 444 5566",
    businessId: "5566778899",
    status: "connected",
    templates: 2,
    flows: 2,
    messagesThisMonth: "11.2K",
  },
];

export default function Accounts() {
  return (
    <AppLayout
      title="الحسابات"
      subtitle="إدارة حسابات واتساب الأعمال المتعددة"
      actions={
        <Button size="sm" className="gradient-whatsapp text-primary-foreground">
          <Plus className="h-4 w-4 ml-1" />
          إضافة حساب
        </Button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {accounts.map((account) => (
          <Card key={account.id} className="shadow-card hover:shadow-card-hover transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-xl gradient-whatsapp flex items-center justify-center">
                    <Phone className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{account.name}</h3>
                    <p className="text-xs text-muted-foreground" dir="ltr">{account.phone}</p>
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

              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <p className="text-lg font-bold">{account.templates}</p>
                  <p className="text-xs text-muted-foreground">قوالب</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <p className="text-lg font-bold">{account.flows}</p>
                  <p className="text-xs text-muted-foreground">تدفقات</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <p className="text-lg font-bold">{account.messagesThisMonth}</p>
                  <p className="text-xs text-muted-foreground">رسائل</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mt-3">
                معرف النشاط التجاري: <span dir="ltr">{account.businessId}</span>
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppLayout>
  );
}
