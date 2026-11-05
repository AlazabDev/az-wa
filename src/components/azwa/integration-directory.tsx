import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Copy, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/azwa/page-header";
import {
  INTEGRATION_DIRECTORY,
  searchAzwaHelp,
  type IntegrationDirectoryItem,
} from "@/lib/azwa-integration-catalog";

function IntegrationCard({ item }: { item: IntegrationDirectoryItem }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copyName(name: string) {
    try {
      await navigator.clipboard.writeText(name);
      setCopied(name);
      toast.success("تم نسخ اسم المتغير");
    } catch {
      toast.error("تعذّر النسخ؛ تحقق من أذونات المتصفح");
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm" aria-labelledby={`integration-${item.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`integration-${item.id}`} className="font-semibold text-base">{item.title}</h3>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
          {item.availability === "built-in" ? "مسارات تشغيل موجودة" : "مرجع إعداد فقط"}
        </span>
      </div>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">{item.description}</p>
      {item.requiredEnvironmentNames.length > 0 && (
        <div className="mt-4 space-y-2" aria-label="أسماء المتغيرات المطلوبة">
          {item.requiredEnvironmentNames.map((name) => (
            <div key={name} className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 p-2">
              <code dir="ltr" className="overflow-auto text-xs">{name}</code>
              <Button type="button" variant="ghost" size="sm" onClick={() => void copyName(name)} aria-label={`نسخ اسم ${name}`}>
                {copied === name ? <Check className="size-4" /> : <Copy className="size-4" />}
                <span className="sr-only">نسخ الاسم</span>
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {item.actions.map((action) => (
          <Button key={action.to} asChild variant="outline" size="sm">
            <Link to={action.to}>{action.label}</Link>
          </Button>
        ))}
      </div>
    </section>
  );
}

export function IntegrationDirectory() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {INTEGRATION_DIRECTORY.map((item) => <IntegrationCard key={item.id} item={item} />)}
    </div>
  );
}

export function OperationalHelp() {
  const [query, setQuery] = useState("");
  const items = searchAzwaHelp(query);
  return (
    <Panel title="المساعدة التشغيلية">
      <div className="relative mb-4 max-w-xl">
        <Search aria-hidden="true" className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن الأرقام أو Webhooks أو المفاتيح..." className="pr-9" aria-label="البحث في المساعدة" />
      </div>
      <div className="space-y-3">
        {items.length === 0 ? <p role="status" className="text-sm text-muted-foreground">لا توجد نتائج مطابقة.</p> : items.map((entry) => (
          <article key={entry.question} className="rounded-lg border border-border p-3">
            <h3 className="text-sm font-semibold">{entry.question}</h3>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">{entry.answer}</p>
            <Link to={entry.route} className="mt-2 inline-flex text-sm font-semibold text-primary hover:underline">{entry.linkLabel}</Link>
          </article>
        ))}
      </div>
    </Panel>
  );
}
