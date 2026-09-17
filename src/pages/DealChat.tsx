import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, BellRing, Plus, CheckCircle2, Search, SlidersHorizontal, Settings2, ShieldCheck, MoreVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function DealChat() {
  const pushTemplates = [
    {
      id: "order_confirmed",
      title: "تأكيد الطلب",
      titleColor: "success",
      notificationTitle: "تم تأكيد طلبيتك ✅",
      notificationBody: "تم تأكيد طلبك بنجاح، رقم الطلب {{order_id}}. سيتم تجهيزه قريباً.",
      active: true,
    },
    {
      id: "order_shipped",
      title: "شحن الطلب",
      titleColor: "info",
      notificationTitle: "طلبك في الطريق 🚚",
      notificationBody: "تم شحن طلبك! يمكنك تتبعه باستخدام هذا الرابط: {{tracking_url}}",
      active: true,
    },
    {
      id: "abandoned_cart",
      title: "سلة متروكة",
      titleColor: "warning",
      notificationTitle: "سلتك بانتظارك! 🛒",
      notificationBody: "لقد تركت بعض المنتجات في سلتك. أكمل عملية الشراء الآن قبل نفاد الكمية.",
      active: false,
    },
    {
      id: "appointment_reminder",
      title: "تذكير بموعد",
      titleColor: "purple",
      notificationTitle: "تذكير بموعدك مع {{clinic_name}}",
      notificationBody: "نود تذكيرك بموعدك غداً الساعة {{time}}. يرجى تأكيد الحضور.",
      active: true,
    },
    {
      id: "store_review",
      title: "تقييم المتجر",
      titleColor: "success",
      notificationTitle: "تقييمك يهمنا 🌟",
      notificationBody: "كيف كانت تجربتك معنا؟ يرجى تقييمنا على هذا الرابط.",
      active: true,
    },
    {
      id: "loyalty_points",
      title: "كسب نقاط ولاء",
      titleColor: "success",
      notificationTitle: "نقاط ولاء جديدة 🎉",
      notificationBody: "لقد كسبت {{points}} نقطة ولاء جديدة. رصيدك الحالي هو {{total_points}}.",
      active: true,
    },
    {
      id: "offers",
      title: "العروض والتخفيضات",
      titleColor: "info",
      notificationTitle: "عروض خاصة لك! 🎁",
      notificationBody: "احصل على خصم {{discount}}٪ على مشترياتك القادمة. استخدم الكود {{promo_code}}.",
      active: false,
    }
  ];

  return (
    <AppLayout
      title="ديل شات"
      subtitle="إدارة قوالب المحادثة والإشعارات."
    >
      <div className="space-y-8" dir="rtl">
        {/* DealChat Templates Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold">قوالب ديل شات</h2>
                <p className="text-sm text-muted-foreground">
                  رسائل خاصة بعلامتك التجارية - تُرسل للعملاء الجدد أو الحالية للترحيب أو لتأكيد الطلبات.
                </p>
              </div>
            </div>
            <Button className="bg-[#25D366] hover:bg-[#20bd5a] text-white gap-2">
              <Plus className="w-4 h-4" /> قالب جديد
            </Button>
          </div>

          <Card className="shadow-sm border-border rounded-xl">
            <div className="flex flex-col md:flex-row h-full md:min-h-[400px]">
              {/* Templates List */}
              <div className="w-full md:w-64 border-b md:border-b-0 md:border-l border-border bg-muted/20 p-4">
                <div className="relative mb-4">
                  <Search className="w-4 h-4 absolute right-3 top-2.5 text-muted-foreground" />
                  <Input placeholder="ابحث في القوالب..." className="pr-9 bg-background" />
                </div>
                <div className="space-y-1">
                  <button className="w-full flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20 text-right">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#25D366]"></div>
                      <span className="text-sm font-medium text-foreground">ترحيب بعميل جديد</span>
                    </div>
                  </button>
                  <button className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted text-right text-muted-foreground">
                    <span className="text-sm">تأكيد استلام الطلب</span>
                  </button>
                </div>
              </div>

              {/* Template Editor */}
              <div className="flex-1 p-6">
                <div className="max-w-2xl">
                  <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#25D366]"></div>
                    ترحيب بعميل جديد
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    أضف عميلاً لحياتك، تميز في رسالة الترحيب الأولى.
                  </p>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>الاسم</Label>
                        <Input defaultValue="ترحيب بعميل جديد" />
                      </div>
                      <div className="space-y-2">
                        <Label>اللغة</Label>
                        <Select defaultValue="ar">
                          <SelectTrigger>
                            <SelectValue placeholder="اختر اللغة" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ar">العربية</SelectItem>
                            <SelectItem value="en">English</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>الرسالة</Label>
                        <span className="text-xs text-muted-foreground">
                          يمكنك استخدام المتغيرات مثل &#123;&#123;customer_name&#125;&#125;
                        </span>
                      </div>
                      <Textarea 
                        className="h-32 resize-none" 
                        defaultValue="أهلاً بك {{customer_name}} في متجرنا! يسعدنا تواصلك معنا. كيف يمكننا مساعدتك اليوم؟" 
                      />
                    </div>

                    <div className="pt-2">
                      <Button className="bg-[#25D366] hover:bg-[#20bd5a] text-white px-8">
                        حفظ
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Push Notifications Section */}
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#25D366]/10 flex items-center justify-center">
                <BellRing className="w-5 h-5 text-[#25D366]" />
              </div>
              <div>
                <h2 className="text-xl font-bold">قوالب إشعارات Push</h2>
                <p className="text-sm text-muted-foreground">
                  تخصيص الإشعارات التي تصل للعميل على الموبايل لتشجيعهم على إتمام عملية الشراء، تقييم المنتجات...
                </p>
              </div>
            </div>
            <Button className="bg-[#25D366] hover:bg-[#20bd5a] text-white gap-2">
              <Plus className="w-4 h-4" /> نمط إشعار
            </Button>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {pushTemplates.map((template) => (
              <Card key={template.id} className="shadow-sm border-border flex flex-col hover:border-primary/30 transition-colors">
                <CardHeader className="p-4 pb-2 flex flex-row items-start justify-between space-y-0">
                  <div className="flex items-center gap-2">
                    {template.active && (
                      <CheckCircle2 className="w-4 h-4 text-[#25D366]" />
                    )}
                    <h3 className="font-bold text-sm">{template.title}</h3>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2 text-muted-foreground">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </CardHeader>
                <CardContent className="p-4 pt-2 flex-1 flex flex-col">
                  <div className="space-y-3 flex-1">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">عنوان الإشعار</Label>
                      <div className="bg-muted/50 p-2 rounded text-sm font-medium border border-border/50">
                        {template.notificationTitle}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">نص الإشعار</Label>
                      <div className="bg-muted/50 p-2 rounded text-xs leading-relaxed border border-border/50 h-20 overflow-y-auto text-muted-foreground">
                        {template.notificationBody}
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-[#25D366]/30 text-[#25D366] hover:bg-[#25D366]/10">
                      <Settings2 className="w-3.5 h-3.5" />
                      إعداد المتغيرات
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
