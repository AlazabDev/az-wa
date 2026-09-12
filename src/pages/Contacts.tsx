import { useEffect, useState, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Search, Plus, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/use-tenant";
import { EmptyState } from "@/components/EmptyState";
import { Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const ContactsPage = () => {
  const { tenantId, loading: tenantLoading } = useTenant();
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search — لا نستعلم DB على كل ضغطة
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(debounceRef.current);
  }, [search]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchContacts = async () => {
    if (!tenantId) return;
    let query = supabase
      .from("contacts")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (search) {
      query = query.or(
        `phone_e164.ilike.%${debouncedSearch}%,display_name.ilike.%${debouncedSearch}%`,
      );
    }
    const { data } = await query.limit(100);
    setContacts(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchContacts();
  }, [tenantId, debouncedSearch]);

  const handleAdd = async () => {
    if (!tenantId || !newPhone) return;
    setSaving(true);
    const phone = newPhone.startsWith("+") ? newPhone : `+${newPhone}`;
    const { error } = await supabase.from("contacts").insert({
      tenant_id: tenantId,
      phone_e164: phone,
      display_name: newName || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تمت إضافة جهة الاتصال" });
      setDialogOpen(false);
      setNewPhone("");
      setNewName("");
      fetchContacts();
    }
  };

  if (tenantLoading || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader title="جهات الاتصال" description="إدارة جهات اتصال واتساب">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              إضافة جهة اتصال
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>إضافة جهة اتصال جديدة</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>رقم الهاتف</Label>
                <Input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+966501234567"
                  dir="ltr"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>الاسم</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="اسم جهة الاتصال"
                  className="mt-1"
                />
              </div>
              <Button onClick={handleAdd} disabled={saving || !newPhone} className="w-full">
                {saving && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
                إضافة
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث بالهاتف أو الاسم..."
            className="pr-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {contacts.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-8">
          <EmptyState
            icon={Users}
            title="لا توجد جهات اتصال"
            description="أضف جهة اتصال أو ستتم إضافتها تلقائيًا عند استقبال رسائل"
          />
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border animate-fade-in">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-right text-xs font-medium text-muted-foreground p-4">
                  رقم الهاتف
                </th>
                <th className="text-right text-xs font-medium text-muted-foreground p-4">
                  اسم العرض
                </th>
                <th className="text-right text-xs font-medium text-muted-foreground p-4">
                  معرف واتساب
                </th>
                <th className="text-right text-xs font-medium text-muted-foreground p-4">
                  تاريخ الإنشاء
                </th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                >
                  <td className="p-4 text-sm font-medium" dir="ltr">
                    {c.phone_e164}
                  </td>
                  <td className="p-4 text-sm">{c.display_name || "—"}</td>
                  <td className="p-4 text-sm text-muted-foreground font-mono text-xs" dir="ltr">
                    {c.wa_id || "—"}
                  </td>
                  <td className="p-4 text-sm text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString("ar")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardLayout>
  );
};

export default ContactsPage;
