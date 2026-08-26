export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface JobRow {
  id: string;
  organization_id: string;
  queue_name: string;
  job_type: string;
  payload: Record<string, unknown>;
  attempt: number;
  max_attempts: number;
  status: string;
}

export interface MetaScope {
  organizationId: string;
  metaAppId?: string | null;
  businessPortfolioId?: string | null;
  wabaId?: string | null;
  whatsappNumberId?: string | null;
}

export interface MetaCredential {
  credential_id: string;
  token: string;
  credential_type: string;
}
