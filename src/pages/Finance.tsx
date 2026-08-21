import { ChangeEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { FileImage, Loader2, Play, RefreshCw, Upload } from "lucide-react";

const MAX_FILES_PER_UPLOAD = 25;

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function Finance() {
  const qc = useQueryClient();
  const { currentTenantId, currentRole } = useAuth();
  const canOperate = currentRole === "operator" || currentRole === "admin";
  const [batchName, setBatchName] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const { data: batches, isLoading } = useQuery({
    queryKey: ["finance-batches", currentTenantId],
    enabled: Boolean(currentTenantId),
    queryFn: async () => {
      const { data, error } = await supabase.from("finance_batches")
        .select("id,name,status,total_documents,processed_documents,failed_documents,currency,total_amount,created_at")
        .eq("tenant_id", currentTenantId!)
        .order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 10000,
  });

  const { data: recentDocs } = useQuery({
    queryKey: ["finance-documents", currentTenantId],
    enabled: Boolean(currentTenantId),
    queryFn: async () => {
      const { data, error } = await supabase.from("finance_documents")
        .select("id,batch_id,file_name,status,doc_type,vendor,invoice_number,invoice_date,currency,total_amount,confidence,error_message,created_at")
        .eq("tenant_id", currentTenantId!).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 5000,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenantId) throw new Error("لا يوجد Tenant محدد");
      if (!canOperate) throw new Error("تحتاج صلاحية operator أو admin");
      if (!files.length) throw new Error("اختر صورة واحدة على الأقل");
      const selected = files.slice(0, MAX_FILES_PER_UPLOAD);
      const encoded = await Promise.all(selected.map(async (file) => ({
        file_name: file.name,
        mime: file.type || "image/jpeg",
        data_base64: await fileToBase64(file),
      })));
      const { data, error } = await supabase.functions.invoke("finance-ingest", {
        body: { tenant_id: currentTenantId, batch_name: batchName.trim() || undefined, files: encoded },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as any;
    },
    onSuccess: (data) => {
      toast.success(`تمت إضافة ${data.created ?? 0} صورة للمعالجة`);
      setFiles([]);
      setBatchName("");
      qc.invalidateQueries({ queryKey: ["finance-batches"] });
      qc.invalidateQueries({ queryKey: ["finance-documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const workerMutation = useMutation({
    mutationFn: async (batchId: string) => {
      if (!currentTenantId) throw new Error("لا يوجد Tenant محدد");
      const { data, error } = await supabase.functions.invoke("finance-worker", {
        body: { tenant_id: currentTenantId, batch_id: batchId, limit: 3 },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as any;
    },
    onSuccess: (data) => {
      toast.success(`تمت معالجة ${data.processed ?? 0} مستندات — المتبقي ${data.remaining ?? 0}`);
      qc.invalidateQueries({ queryKey: ["finance-batches"] });
      qc.invalidateQueries({ queryKey: ["finance-documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const byBatch = useMemo(() => {
    const map = new Map<string, typeof recentDocs>();
    for (const doc of recentDocs ?? []) {
      if (!doc.batch_id) continue;
      const current = map.get(doc.batch_id) ?? [];
      current.push(doc);
      map.set(doc.batch_id, current);
    }
    return map;
  }, [recentDocs]);

  const handleFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    setFiles(chosen.slice(0, MAX_FILES_PER_UPLOAD));
  };

  return (
    <AppLayout title="المالية" subtitle="استقبال صور المستندات → Milano → Azure Vision → Foundry">
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4" /> دفعة صور جديدة</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Input value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="اسم الدفعة (اختياري)" disabled={!canOperate} />
            <Input type="file" accept="image/*" multiple onChange={handleFiles} disabled={!canOperate || uploadMutation.isPending} />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">{files.length} صورة محددة — الحد {MAX_FILES_PER_UPLOAD} في الرفع الواحد</span>
              <Button onClick={() => uploadMutation.mutate()} disabled={!canOperate || !files.length || uploadMutation.isPending}>
                {uploadMutation.isPending ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Upload className="h-4 w-4 ml-2" />}
                رفع إلى Milano
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">الدفعات</h2>
            <Button variant="outline" size="sm" onClick={() => { qc.invalidateQueries({ queryKey: ["finance-batches"] }); qc.invalidateQueries({ queryKey: ["finance-documents"] }); }}>
              <RefreshCw className="h-4 w-4 ml-1" /> تحديث
            </Button>
          </div>
          {isLoading ? <p className="text-sm text-muted-foreground">جاري التحميل...</p> : !batches?.length ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">لا توجد دفعات مالية حتى الآن.</CardContent></Card>
          ) : batches.map((batch) => {
            const pct = batch.total_documents ? Math.round(((batch.processed_documents + batch.failed_documents) / batch.total_documents) * 100) : 0;
            const docs = byBatch.get(batch.id) ?? [];
            return (
              <Card key={batch.id}>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2"><h3 className="font-semibold">{batch.name}</h3><Badge variant="outline">{batch.status}</Badge></div>
                      <p className="text-xs text-muted-foreground mt-1">{new Date(batch.created_at).toLocaleString("ar-EG")}</p>
                    </div>
                    <Button size="sm" onClick={() => workerMutation.mutate(batch.id)} disabled={!canOperate || workerMutation.isPending || batch.status === "completed"}>
                      {workerMutation.isPending ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <Play className="h-4 w-4 ml-1" />}
                      معالجة 3
                    </Button>
                  </div>
                  <Progress value={pct} />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>الإجمالي: <b>{batch.total_documents}</b></div>
                    <div>تم: <b>{batch.processed_documents}</b></div>
                    <div>فشل: <b>{batch.failed_documents}</b></div>
                    <div>القيمة: <b>{batch.currency ? `${batch.total_amount} ${batch.currency}` : "حسب العملة"}</b></div>
                  </div>
                  {docs.length > 0 && <div className="border rounded-md overflow-hidden">
                    {docs.slice(0, 8).map((doc) => <div key={doc.id} className="flex items-center justify-between gap-3 px-3 py-2 border-b last:border-b-0 text-xs">
                      <div className="flex items-center gap-2 min-w-0"><FileImage className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{doc.file_name || doc.invoice_number || doc.id}</span></div>
                      <div className="flex items-center gap-2 shrink-0"><span>{doc.vendor || doc.doc_type || "—"}</span><Badge variant={doc.status === "failed" ? "destructive" : "outline"}>{doc.status}</Badge></div>
                    </div>)}
                  </div>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
