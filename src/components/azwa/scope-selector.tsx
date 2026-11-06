import { useEffect, useMemo } from "react";
import { Globe, Building2, Network, Phone, RefreshCw } from "lucide-react";

import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useScope, type Scope } from "@/lib/scope";
import { usePortfolios, useWabas, useNumbers } from "@/lib/azwa-data";
import { normalizeWhatsappPhone, whatsappAccountLabel, whatsappAccountName } from "@/lib/azwa-number-labels";

export function scopeKey(scope: Pick<Scope, "kind" | "id">): string {
  return `${scope.kind}:${scope.id ?? ""}`;
}

export function ScopeSelector() {
  const { scope, setScope } = useScope();
  const portfolioQuery = usePortfolios();
  const wabaQuery = useWabas();
  const numberQuery = useNumbers();
  const portfolios = portfolioQuery.data ?? [];
  const wabas = wabaQuery.data ?? [];
  const numbers = numberQuery.data ?? [];

  const options = useMemo(() => {
    const list = new Map<string, Scope>();
    list.set("all:", { kind: "all", id: null, label: "كل حسابات واتساب" });
    for (const p of portfolios) {
      list.set(`business:${p.id}`, { kind: "business", id: p.id, label: p.name || "محفظة تجارية" });
    }
    for (const w of wabas) {
      list.set(`waba:${w.id}`, { kind: "waba", id: w.id, label: w.name?.trim() || "حساب واتساب للأعمال" });
    }
    for (const n of numbers) {
      list.set(`number:${n.id}`, {
        kind: "number",
        id: n.id,
        label: whatsappAccountLabel(n.display_phone_number, n.internal_name || n.verified_name),
      });
    }
    return list;
  }, [portfolios, wabas, numbers]);

  const loaded = portfolioQuery.isSuccess && wabaQuery.isSuccess && numberQuery.isSuccess;
  const failed = portfolioQuery.isError || wabaQuery.isError || numberQuery.isError;
  const selectedKey = scopeKey(scope);
  const selected = options.get(selectedKey);

  // Inventories may change (number removed, user switches account, or stored
  // scope from another session). Do not keep a stale UUID as the active scope.
  useEffect(() => {
    if (!loaded) return;
    if (!selected) {
      setScope(options.get("all:")!);
    } else if (selected.label !== scope.label) {
      setScope(selected);
    }
  }, [loaded, selected, scope.label, setScope, options]);

  const Icon = scope.kind === "all" ? Globe :
    scope.kind === "business" ? Building2 : scope.kind === "waba" ? Network : Phone;

  return (
    <div className="flex min-w-0 items-center gap-2" dir="rtl">
      <label htmlFor="azwa-scope-select" className="hidden shrink-0 text-xs font-medium text-muted-foreground sm:block">
        حساب واتساب
      </label>
      <Select
        disabled={failed}
        value={options.has(selectedKey) ? selectedKey : "all:"}
        onValueChange={(value) => {
          const next = options.get(value);
          if (next) setScope(next);
        }}
      >
        <SelectTrigger id="azwa-scope-select" aria-label="تبديل حساب واتساب" className="h-10 w-full min-w-0 max-w-[380px] text-sm">
          <Icon className="size-4 shrink-0 text-primary" />
          <SelectValue placeholder="اختر حساب واتساب" />
        </SelectTrigger>
        <SelectContent className="max-h-[440px]">
          <SelectItem value="all:">كل حسابات واتساب</SelectItem>
          {portfolios.length > 0 && (
            <SelectGroup>
              <SelectLabel>المحافظ التجارية</SelectLabel>
              {portfolios.map((p) => (
                <SelectItem key={p.id} value={`business:${p.id}`}>{p.name || "محفظة تجارية"}</SelectItem>
              ))}
            </SelectGroup>
          )}
          {wabas.length > 0 && (
            <SelectGroup>
              <SelectLabel>حسابات واتساب للأعمال</SelectLabel>
              {wabas.map((w) => (
                <SelectItem key={w.id} value={`waba:${w.id}`}>{w.name?.trim() || "حساب واتساب للأعمال"}</SelectItem>
              ))}
            </SelectGroup>
          )}
          {numbers.length > 0 && (
            <SelectGroup>
              <SelectLabel>أرقام حسابات واتساب</SelectLabel>
              {numbers.map((n) => (
                <SelectItem key={n.id} value={`number:${n.id}`}>
                  <div className="flex min-w-0 flex-col gap-0.5 py-0.5 text-right">
                    <span className="font-medium">{whatsappAccountName(n.display_phone_number, n.internal_name || n.verified_name)}</span>
                    <span className="text-xs text-muted-foreground" dir="ltr">{normalizeWhatsappPhone(n.display_phone_number)}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          {loaded && numbers.length === 0 && (
            <SelectGroup><SelectLabel>لا توجد أرقام متاحة لحسابك</SelectLabel></SelectGroup>
          )}
        </SelectContent>
      </Select>
      {failed && (
        <button
          type="button"
          onClick={() => void numberQuery.refetch()}
          aria-label="إعادة تحميل حسابات واتساب"
          title="تعذر تحميل الحسابات — إعادة المحاولة"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-destructive/40 text-destructive"
        >
          <RefreshCw className="size-4" />
        </button>
      )}
      {failed && <span role="alert" className="sr-only">تعذر تحميل حسابات واتساب</span>}
    </div>
  );
}
