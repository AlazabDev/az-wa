import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { PageHeader, Panel } from "@/components/azwa/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useNumbers } from "@/lib/azwa-data";
import { analyzeMetaSyncIssue } from "@/lib/meta/sync-diagnosis.functions";

export const Route = createFileRoute("/_authenticated/sync-doctor")({
  head: () => ({
    meta: [
      { title: "Sync Doctor — AzWA" },
      {
        name: "description",
        content: "AI analysis of Meta error logs and sync problems with fix steps per WABA and number.",
      },
      { property: "og:title", content: "Sync Doctor — AzWA" },
      { property: "og:description", content: "AI-powered Meta sync troubleshooting." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SyncDoctorPage,
});

function SyncDoctorPage() {
  const analyze = useServerFn(analyzeMetaSyncIssue);
  const { data: numbers = [] } = useNumbers();
  const [numberId, setNumberId] = useState("");
  const [log, setLog] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await analyze({ data: { numberId: numberId || null, log } });
      if (r.ok) setResult(r.analysis);
      else setError(r.error);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Sync Doctor"
        description="الصق سجل أخطاء Meta أو صف مشكلة المزامنة، واختر الرقم المتأثر للحصول على تشخيص وخطوات إصلاح محددة."
      />
      <div className="grid gap-6" dir="rtl">
        <Panel title="المشكلة">
          <div className="space-y-3">
            <label className="block text-sm">
              الرقم المتأثر
              <select
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm"
                value={numberId}
                onChange={(e) => setNumberId(e.target.value)}
              >
                <option value="">— بدون رقم محدد —</option>
                {numbers.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.display_phone_number} — {n.verified_name ?? n.internal_name ?? ""}
                  </option>
                ))}
              </select>
            </label>
            <Textarea
              rows={10}
              dir="auto"
              placeholder='مثال: {"error":{"message":"(#131030) Recipient phone number not in allowed list","code":131030}} أو: الرسائل لا تصل للـ Inbox منذ أمس'
              value={log}
              onChange={(e) => setLog(e.target.value)}
              className="font-mono text-xs"
            />
            <Button onClick={() => void run()} disabled={loading || log.trim().length < 5}>
              {loading ? "جارٍ التحليل…" : "حلّل واقترح الإصلاح"}
            </Button>
          </div>
        </Panel>
        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {result ? (
          <Panel title="التشخيص وخطوات الإصلاح">
            <div dir="auto" className="whitespace-pre-wrap text-sm leading-7">
              {result}
            </div>
          </Panel>
        ) : null}
      </div>
    </>
  );
}
