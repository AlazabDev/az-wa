export type ReadinessCheck = {
  key: string;
  label: string;
  ok: boolean;
  severity: "critical" | "warning" | "info";
  detail: string;
};

export type MetaProductionReadiness = {
  ready: boolean;
  score: number;
  auditedAt: string;
  checks: ReadinessCheck[];
  drift: {
    staleWabas: string[];
    staleNumbers: string[];
    missingBaselinePhones: string[];
    extraPhones: string[];
  };
  totals: {
    wabas: number;
    numbers: number;
    templates: number;
    flows: number;
    subscribedApps: number;
  };
  criticalFailures: number;
  warnings: number;
};
