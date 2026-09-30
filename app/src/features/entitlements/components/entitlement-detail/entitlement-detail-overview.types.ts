import type { Entitlement } from '@/api-client';
import type { EntitlementDetailContextValue } from './entitlement-detail-context.types';

export type EntitlementAuditFields = Entitlement & {
  createdAt?: string;
  createdBy?: unknown;
  created_at?: string;
  created_by?: unknown;
  updatedAt?: string;
  updatedBy?: unknown;
  updated_at?: string;
  updated_by?: unknown;
};

export type EntitlementDetailMetrics = EntitlementDetailContextValue['metrics'];
