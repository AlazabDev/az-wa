import { useEffect, useMemo } from "react";
import { Globe, Building2, Network, Phone, RefreshCw } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useScope, type Scope } from "@/lib/scope";
import { usePortfolios, useWabas, useNumbers } from "@/lib/azwa-data";
import { normalizeWhatsappPhone, whatsappAccountName } from "@/lib/azwa-number-labels";

function scopeKey(scope: Pick<Scope, "kind" | "id">): string {
  return `${scope.kind}:${scope.id ?? ""}`;
}

export function ScopeSelector() {
  const { scope, setScope } = useScope();
  const portfolioQuery = usePortfolios();
  const wabaQuery = useWabas();
  const numberQuery = useNumbers();
  const portfolios = useMemo(() => portfolioQuery.data ?? [], [portfolioQuery.data]);
  const wabas = useMemo(() => wabaQuery.data ?? [], [wabaQuery.data]);
  const numbers = useMemo(() => numberQuery.data ?? [], [numberQuery.data]);

  // خرائط مساعدة للربط الديناميكي بين الحسابات وأسمائها
  const wabaMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of wabas) {
      if (w.id && w.name) {
        map.set(w.id, w.name.trim());
      }
    }
    return map;
  }, [wabas]);

  const options = useMemo(() => {
    const list = new Map<string, Scope>();
    list.set("all:", { kind: "all", id: null, label: "كل الحسابات" });

    for (const p of portfolios) {
      list.set(`business:${p.id}`, {
        kind: "business",
        id: p.id,
        label: p.name || "محفظة أعمال",
      });
    }

    for (const w of wabas) {
      list.set(`waba:${w.id}`, {
        kind: "waba",
        id: w.id,
        label: w.name?.trim() || "حساب واتساب",
      });
    }

    for (const n of numbers) {
      const parentWabaName = n.waba_id ? wabaMap.get(n.waba_id) : undefined;
      const accountTitle =
        parentWabaName ||
        whatsappAccountName(n.display_phone_number, n.internal_name || n.verified_name);
      list.set(`number:${n.id}`, {
        kind: "number",
        id: n.id,
        label: accountTitle,
      });
    }
    return list;
  }, [portfolios, wabas, numbers, wabaMap]);

  const loaded = portfolioQuery.isSuccess && wabaQuery.isSuccess && numberQuery.isSuccess;
  const failed = portfolioQuery.isError || wabaQuery.isError || numberQuery.isError;
  const selectedKey = scopeKey(scope);
  const selected = options.get(selectedKey);

  // تحديث النطاق إذا تغيرت القائمة أو تم اختيار خيار غير موجود
  useEffect(() => {
    if (!loaded) return;
    if (!selected) {
      setScope(options.get("all:")!);
    } else if (selected.label !== scope.label) {
      setScope(selected);
    }
  }, [loaded, selected, scope.label, setScope, options]);

  const Icon =
    scope.kind === "all"
      ? Globe
      : scope.kind === "business"
        ? Building2
        : scope.kind === "waba"
          ? Network
          : Phone;

  // جلب الرقم المرتبط بالنطاق المحدد حالياً إن وجد لعرضه مصغراً في التريجر
  const activeNumber = useMemo(() => {
    if (scope.kind !== "number" || !scope.id) return null;
    return numbers.find((n) => n.id === scope.id) ?? null;
  }, [scope, numbers]);

  return (
    <div className="flex min-w-0 items-center gap-2" dir="rtl">
      <Select
        disabled={failed}
        value={options.has(selectedKey) ? selectedKey : "all:"}
        onValueChange={(value) => {
          const next = options.get(value);
          if (next) setScope(next);
        }}
      >
        <SelectTrigger
          id="azwa-scope-select"
          aria-label="تبديل الحساب"
          className="h-11 w-full min-w-0 max-w-[340px] text-sm"
        >
          <div className="flex min-w-0 items-center gap-2.5 text-right">
            <Icon className="size-4 shrink-0 text-primary" />
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-semibold text-xs sm:text-sm">
                {selected?.label || "كل الحسابات"}
              </span>
              {activeNumber ? (
                <span className="truncate text-[11px] text-muted-foreground" dir="ltr">
                  {activeNumber.display_phone_number || normalizeWhatsappPhone(activeNumber.display_phone_number)}
                </span>
              ) : scope.kind === "all" ? (
                <span className="text-[10px] text-muted-foreground">عرض شامل لجميع القنوات</span>
              ) : null}
            </div>
          </div>
        </SelectTrigger>
        <SelectContent className="max-h-[460px] min-w-[280px]">
          <SelectItem value="all:">
            <div className="flex flex-col gap-0.5 py-1 text-right">
              <span className="font-semibold text-sm">كل الحسابات</span>
              <span className="text-[11px] text-muted-foreground">عرض مجمع لكافة أرقام وقنوات واتساب</span>
            </div>
          </SelectItem>

          {numbers.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-xs font-bold text-muted-foreground px-2 py-1.5">
                حسابات وأرقام واتساب
              </SelectLabel>
              {numbers.map((n) => {
                const parentWabaName = n.waba_id ? wabaMap.get(n.waba_id) : undefined;
                const accountTitle =
                  parentWabaName ||
                  whatsappAccountName(n.display_phone_number, n.internal_name || n.verified_name);
                const phoneFormatted =
                  n.display_phone_number || normalizeWhatsappPhone(n.display_phone_number);

                return (
                  <SelectItem key={n.id} value={`number:${n.id}`}>
                    <div className="flex min-w-0 flex-col gap-0.5 py-1 text-right">
                      <span className="font-semibold text-sm text-foreground">{accountTitle}</span>
                      <span className="text-[11px] font-mono text-muted-foreground" dir="ltr">
                        {phoneFormatted}
                      </span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectGroup>
          )}

          {wabas.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-xs font-bold text-muted-foreground px-2 py-1.5 border-t border-border mt-1 pt-2">
                حسابات واتساب للأعمال (WABA)
              </SelectLabel>
              {wabas.map((w) => (
                <SelectItem key={w.id} value={`waba:${w.id}`}>
                  <div className="flex flex-col gap-0.5 py-0.5 text-right">
                    <span className="font-medium text-sm">{w.name?.trim() || "حساب واتساب"}</span>
                    <span className="text-[10px] font-mono text-muted-foreground" dir="ltr">
                      ID: {w.meta_waba_id}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          )}

          {portfolios.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-xs font-bold text-muted-foreground px-2 py-1.5 border-t border-border mt-1 pt-2">
                المحافظ التجارية
              </SelectLabel>
              {portfolios.map((p) => (
                <SelectItem key={p.id} value={`business:${p.id}`}>
                  <div className="flex flex-col gap-0.5 py-0.5 text-right">
                    <span className="font-medium text-sm">{p.name || "محفظة تجارية"}</span>
                    <span className="text-[10px] font-mono text-muted-foreground" dir="ltr">
                      ID: {p.meta_business_id}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          )}

          {loaded && numbers.length === 0 && wabas.length === 0 && (
            <div className="p-3 text-center text-xs text-muted-foreground">لا توجد حسابات متاحة</div>
          )}
        </SelectContent>
      </Select>
      {failed && (
        <button
          type="button"
          onClick={() => void numberQuery.refetch()}
          aria-label="إعادة تحميل الحسابات"
          title="تعذر تحميل الحسابات — إعادة المحاولة"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10"
        >
          <RefreshCw className="size-4" />
        </button>
      )}
      {failed && <span role="alert" className="sr-only">تعذر تحميل الحسابات</span>}
    </div>
  );
}
