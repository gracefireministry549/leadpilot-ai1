export type LeadStatus =
  | 'NEW'
  | 'VERIFIED'
  | 'CONTACTED'
  | 'REPLIED'
  | 'INTERESTED'
  | 'MEETING'
  | 'CUSTOMER'
  | 'NOT_INTERESTED';

export interface BusinessRecord {
  id: string;
  name: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  country?: string;
  industry?: string;
  source: string;
}

export interface LeadRecord {
  id: string;
  accountId: string;
  businessId: string;
  status: LeadStatus;
  score: number;
  scoreLabel: 'HOT' | 'HIGH' | 'POTENTIAL' | 'LOW';
  /** Reliability intelligence produced by the finder pipeline. Persisted so
   * workspace dashboards can show verified-lead KPIs and recommendations. */
  reliabilityConfidence?: number;
  reliabilityLevel?: string;
  websiteStatus?: string;
  recommendation?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportedLeadRow {
  name: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  country?: string;
  industry?: string;
}

export interface ImportResult {
  imported: number;
  valid: number;
  duplicates: number;
  rejected: number;
  errors: Array<{ row: number; reason: string }>;
}
