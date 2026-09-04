import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  getAzwaInventory,
  getAzwaOpsCounters,
  type ServerHealth,
  type ServerNumber,
  type ServerPortfolio,
  type ServerWaba,
} from "./azwa-data.functions";

export type Health = ServerHealth;
export type Portfolio = ServerPortfolio;
export type Waba = ServerWaba;
export type WhatsappNumber = ServerNumber;

export function usePortfolios() {
  const load = useServerFn(getAzwaInventory);
  return useQuery({
    queryKey: ["azwa-inventory"],
    queryFn: () => load({ data: {} }),
    select: (inventory) => inventory.portfolios,
    refetchInterval: 30_000,
  });
}

export function useWabas() {
  const load = useServerFn(getAzwaInventory);
  return useQuery({
    queryKey: ["azwa-inventory"],
    queryFn: () => load({ data: {} }),
    select: (inventory) => inventory.wabas,
    refetchInterval: 30_000,
  });
}

export function useNumbers() {
  const load = useServerFn(getAzwaInventory);
  return useQuery({
    queryKey: ["azwa-inventory"],
    queryFn: () => load({ data: {} }),
    select: (inventory) => inventory.numbers,
    refetchInterval: 30_000,
  });
}

export function useOpsCounters(numberIds: string[]) {
  const load = useServerFn(getAzwaOpsCounters);
  const normalized = [...new Set(numberIds)].sort();

  return useQuery({
    queryKey: ["ops-counters", normalized.join(",")],
    queryFn: () => load({ data: { numberIds: normalized } }),
    refetchInterval: 30_000,
  });
}
