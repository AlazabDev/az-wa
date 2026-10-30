import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  ImageIcon,
  Loader2,
  Play,
  RotateCw,
  Trash2,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  runInboundDiagnostic,
  type DiagnosticSummary,
  type NumberDiagnosticResult,
} from "@/lib/meta/inbound-diagnostic.functions";

type Props = {
  defaultNumberId?: string;
  triggerButton?: React.ReactNode;
};

export function InboundDiagnosticModal({ defaultNumberId, triggerButton }: Props) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [cleanup, setCleanup] = useState(false);
  const [report, setReport] = useState<DiagnosticSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTest = useServerFn(runInboundDiagnostic);

  async function handleStart(targetNumberId?: string) {
    setRunning(true);
    setError(null);
    try {
      const res = await runTest({
        data: {
          numberId: targetNumberId ?? defaultNumberId ?? null,
          cleanup,
        },
      });
      setReport(res);
    } catch (err: any) {
      setError(err?.message || "Failed to complete diagnostic test.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerButton ?? (
          <Button variant="outline" size="sm" className="gap-2">
            <Activity className="h-4 w-4 text-emerald-500" />
            <span>فحص استلام الرسائل والصور</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Activity className="h-5 w-5 text-primary" />
            <span>اختبار استلام الرسائل وحفظ الوسائط (Inbound Diagnostic)</span>
          </DialogTitle>
          <DialogDescription className="text-sm">
            فحص حقيقي يحاكي وصول رسالة وصورة واردة من WhatsApp، ويتأكد من إدراجها بالـ Inbox وحفظ
            الملف محلياً وتوليد رابط المشاركة.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* إعدادات الفحص */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border bg-muted/40">
            <div className="flex items-center space-x-2 space-x-reverse">
              <Switch id="cleanup-toggle" checked={cleanup} onCheckedChange={setCleanup} />
              <Label htmlFor="cleanup-toggle" className="text-sm cursor-pointer">
                حذف بيانات الاختبار تلقائياً بعد الفحص
              </Label>
            </div>

            <Button
              size="sm"
              onClick={() => handleStart()}
              disabled={running}
              className="gap-2"
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>جارٍ الفحص الشامل...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  <span>{defaultNumberId ? "فحص هذا الرقم الآن" : "فحص جميع الأرقام"}</span>
                </>
              )}
            </Button>
          </div>

          {error && (
            <div className="p-3 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* نتائج الفحص */}
          {report && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground border-b pb-2">
                <span>وقت الاختبار: {new Date(report.testedAt).toLocaleTimeString()}</span>
                <Badge variant={report.ok ? "default" : "destructive"}>
                  {report.ok ? "جميع المراحل ناجحة بنسبة 100%" : "توجد أخطاء في بعض المراحل"}
                </Badge>
              </div>

              <div className="space-y-3">
                {report.results.map((item) => (
                  <NumberResultCard key={item.numberId} result={item} />
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NumberResultCard({ result }: { result: NumberDiagnosticResult }) {
  return (
    <div className="rounded-lg border p-4 space-y-3 bg-card">
      <div className="flex items-center justify-between">
        <div className="font-semibold flex items-center gap-2">
          <span>{result.displayPhoneNumber}</span>
          <span className="text-xs text-muted-foreground font-mono">({result.metaPhoneNumberId})</span>
        </div>
        <Badge variant={result.ok ? "default" : "destructive"}>
          {result.ok ? "جاهز ومكتمل" : "فشل الفحص"}
        </Badge>
      </div>

      <div className="space-y-2 text-sm">
        {result.steps.map((s, idx) => (
          <div key={idx} className="flex items-start justify-between gap-2 p-2 rounded bg-muted/30">
            <div className="flex items-start gap-2">
              {s.status === "success" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              )}
              <div>
                <p className="font-medium text-xs">{s.name}</p>
                {s.details && <p className="text-xs text-muted-foreground">{s.details}</p>}
              </div>
            </div>
            {s.durationMs !== undefined && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {s.durationMs}ms
              </span>
            )}
          </div>
        ))}
      </div>

      {result.ok && (
        <div className="pt-2 border-t flex flex-wrap gap-2 text-xs">
          {result.conversationId && (
            <a
              href={`/inbox?conversationId=${result.conversationId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              <span>مشاهدة المحادثة في الـ Inbox</span>
            </a>
          )}

          {result.publicUrl && (
            <a
              href={result.publicUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-emerald-600 hover:underline ms-auto"
            >
              <ImageIcon className="h-3 w-3" />
              <span>فتح الصورة الاختبارية بالرابط العام</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}
