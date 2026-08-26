import { Globe, Building2, Network, Phone } from "lucide-react";

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

function encode(scope: Scope) {
  return `${scope.kind}:${scope.id ?? ""}`;
}

export function ScopeSelector() {
  const { scope, setScope } = useScope();
  const { data: portfolios = [] } = usePortfolios();
  const { data: wabas = [] } = useWabas();
  const { data: numbers = [] } = useNumbers();

  const options = new Map<string, Scope>();
  options.set("all:", { kind: "all", id: null, label: "All Numbers" });
  for (const p of portfolios)
    options.set(`business:${p.id}`, {
      kind: "business",
      id: p.id,
      label: `${p.name} (${p.meta_business_id})`,
    });
  for (const w of wabas)
    options.set(`waba:${w.id}`, {
      kind: "waba",
      id: w.id,
      label: w.name ?? `WABA ${w.meta_waba_id}`,
    });
  for (const n of numbers)
    options.set(`number:${n.id}`, {
      kind: "number",
      id: n.id,
      label: `${n.display_phone_number}${n.internal_name ? ` — ${n.internal_name}` : ""}`,
    });

  const Icon =
    scope.kind === "all"
      ? Globe
      : scope.kind === "business"
        ? Building2
        : scope.kind === "waba"
          ? Network
          : Phone;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Scope
      </span>
      <Select
        value={encode(scope)}
        onValueChange={(v) => {
          const next = options.get(v);
          if (next) setScope(next);
        }}
      >
        <SelectTrigger className="h-9 w-[340px] text-sm">
          <Icon className="size-4 shrink-0 text-primary" />
          <SelectValue placeholder="All Numbers" />
        </SelectTrigger>
        <SelectContent className="max-h-[420px]">
          <SelectItem value="all:">All Numbers</SelectItem>
          {portfolios.length > 0 && (
            <SelectGroup>
              <SelectLabel>Business Portfolios</SelectLabel>
              {portfolios.map((p) => (
                <SelectItem key={p.id} value={`business:${p.id}`}>
                  {p.name} · {p.meta_business_id}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          {wabas.length > 0 && (
            <SelectGroup>
              <SelectLabel>WABAs</SelectLabel>
              {wabas.map((w) => (
                <SelectItem key={w.id} value={`waba:${w.id}`}>
                  {w.meta_waba_id}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          {numbers.length > 0 && (
            <SelectGroup>
              <SelectLabel>WhatsApp Numbers</SelectLabel>
              {numbers.map((n) => (
                <SelectItem key={n.id} value={`number:${n.id}`}>
                  {n.display_phone_number} · {n.meta_phone_number_id}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
