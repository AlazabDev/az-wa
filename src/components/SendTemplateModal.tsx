import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Send, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  template: any;
  tenantId: string;
}

export function SendTemplateModal({ open, onClose, template, tenantId }: Props) {
  const { toast } = useToast();

  const [contacts, setContacts] = useState<any[]>([]);
  const [waNumbers, setWaNumbers] = useState<any[]>([]);
  const [selectedContact, setSelectedContact] = useState("");
  const [selectedWaNumber, setSelectedWaNumber] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [contactSearch, setContactSearch] = useState("");

  // Load data whenever modal opens (or tenantId becomes available)
  useEffect(() => {
    if (!open || !tenantId) return;

    const loadData = async () => {
      setLoadingData(true);
      console.log("SendTemplateModal: loading data for tenant", tenantId);

      const [{ data: c, error: ce }, { data: n, error: ne }] = await Promise.all([
        supabase
          .from("contacts")
          .select("id,phone_e164,display_name")
          .eq("organization_id", tenantId)
          .order("display_name")
          .limit(500),
        (supabase.from as any)("wa_numbers")
          .select("id,phone_e164,phone_number_id")
          .eq("organization_id", tenantId)
          .limit(50),
      ]);

      console.log("contacts:", c?.length, ce);
      console.log("wa_numbers:", n?.length, ne);

      setContacts((c as any) || []);
      setWaNumbers((n as any) || []);
      if (n && n.length > 0) setSelectedWaNumber((n as any)[0].id);
      setLoaded(true);
      setLoadingData(false);

      // Extract variables from template body
      const vars: Record<string, string> = {};
      const varList = Array.isArray(template?.variables) ? template.variables : [];
      varList.forEach((_: any, i: number) => {
        vars[String(i + 1)] = "";
      });
      const bodyVars = (template?.body || "").match(/\{\{(\d+)\}\}/g) || [];
      bodyVars.forEach((v: string) => {
        const key = v.replace(/[{}]/g, "");
        if (!vars[key]) vars[key] = "";
      });
      setVariables(vars);
    };

    loadData();
  }, [open, tenantId]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedContact("");
      setSelectedWaNumber("");
      setVariables({});
      setLoaded(false);
      setContactSearch("");
      onClose();
    }
  };

  const handleSend = async () => {
    if (!selectedContact || !selectedWaNumber || !template) return;
    setSending(true);

    // Find or create conversation
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("organization_id", tenantId)
      .eq("whatsapp_number_id", selectedWaNumber)
      .eq("contact_id", selectedContact)
      .eq("status", "open")
      .maybeSingle();

    let conversationId = existing?.id;

    if (!conversationId) {
      const { data: newConv, error: convErr } = await supabase
        .from("conversations")
        .insert({
          organization_id: tenantId,
          whatsapp_number_id: selectedWaNumber,
          contact_id: selectedContact,
          status: "open",
        } as any)
        .select("id")
        .single();

      if (convErr) {
        toast({
          title: "خطأ في إنشاء المحادثة",
          description: convErr.message,
          variant: "destructive",
        });
        setSending(false);
        return;
      }
      conversationId = newConv.id;
    }

    // Build template payload
    const componentParams = Object.entries(variables)
      .sort(([a], [b]) => Number(a) - Number(b))
      .filter(([, v]) => v.trim() !== "")
      .map(([, value]) => ({ type: "text", text: value }));

    const templatePayload: any = {
      name: template.name,
      language: { code: template.language || "ar" },
    };

    if (componentParams.length > 0) {
      templatePayload.components = [{ type: "body", parameters: componentParams }];
    }

    const { data: result, error } = await supabase.functions.invoke("send_message", {
      body: {
        tenant_id: tenantId,
        conversation_id: conversationId,
        template: templatePayload,
      },
    });

    setSending(false);
    if (error || result?.error) {
      toast({
        title: "فشل الإرسال",
        description: error?.message || result?.error,
        variant: "destructive",
      });
    } else {
      toast({ title: "✓ تم إرسال القالب بنجاح" });
      handleOpenChange(false);
    }
  };

  const varKeys = Object.keys(variables).sort((a, b) => Number(a) - Number(b));
  const bodyPreview = (template?.body || "").replace(/\{\{(\d+)\}\}/g, (_: string, k: string) =>
    variables[k] ? `[${variables[k]}]` : `{{${k}}}`,
  );

  const filteredContacts = contacts.filter(
    (c) =>
      !contactSearch ||
      c.display_name?.toLowerCase().includes(contactSearch.toLowerCase()) ||
      c.phone_e164?.includes(contactSearch),
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>إرسال قالب: {template?.name}</DialogTitle>
        </DialogHeader>

        {loadingData ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="mr-2 text-sm text-muted-foreground">جاري تحميل البيانات...</span>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            {/* Preview */}
            {template?.body && (
              <div className="bg-muted/40 rounded-xl p-3 border border-border">
                <p className="text-xs text-muted-foreground mb-1.5">معاينة القالب</p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{bodyPreview}</p>
              </div>
            )}

            {/* Sender number */}
            <div className="space-y-1.5">
              <Label>رقم واتساب المُرسِل</Label>
              {waNumbers.length === 0 ? (
                <p className="text-sm text-destructive">
                  لا توجد أرقام واتساب مضافة. أضف رقمًا من صفحة الأرقام أولاً.
                </p>
              ) : (
                <Select value={selectedWaNumber} onValueChange={setSelectedWaNumber}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="اختر رقم الإرسال..." />
                  </SelectTrigger>
                  <SelectContent>
                    {waNumbers.map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        <span dir="ltr">{n.phone_e164}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Recipient */}
            <div className="space-y-1.5">
              <Label>جهة الاتصال المستلِمة</Label>
              {contacts.length === 0 ? (
                <p className="text-sm text-destructive">
                  لا توجد جهات اتصال. أضف جهة اتصال من صفحة جهات الاتصال أولاً.
                </p>
              ) : (
                <>
                  {/* Search contacts */}
                  <div className="relative">
                    <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="ابحث عن جهة اتصال..."
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      className="pr-8"
                    />
                  </div>
                  <Select value={selectedContact} onValueChange={setSelectedContact}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="اختر جهة اتصال..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {filteredContacts.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">لا توجد نتائج</div>
                      ) : (
                        filteredContacts.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            <div className="flex flex-col">
                              <span>{c.display_name || c.phone_e164}</span>
                              {c.display_name && (
                                <span className="text-xs text-muted-foreground" dir="ltr">
                                  {c.phone_e164}
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>

            {/* Variables */}
            {varKeys.length > 0 && (
              <div className="space-y-2">
                <Label>متغيرات القالب</Label>
                <div className="space-y-2">
                  {varKeys.map((key) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-xs font-mono bg-muted px-2 py-1 rounded border border-border w-12 text-center shrink-0">
                        {`{{${key}}}`}
                      </span>
                      <Input
                        placeholder={`قيمة المتغير ${key}`}
                        value={variables[key]}
                        onChange={(e) =>
                          setVariables((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        className="flex-1 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-row-reverse gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            إلغاء
          </Button>
          <Button
            onClick={handleSend}
            disabled={!selectedContact || !selectedWaNumber || sending || loadingData}
            className="gap-2"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            إرسال
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
