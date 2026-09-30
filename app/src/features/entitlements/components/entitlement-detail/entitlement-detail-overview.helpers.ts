import { getAuditDisplayName } from '@/lib/detail';
import type { EntitlementAuditFields } from './entitlement-detail-overview.types';

export const formatMetricCount = (
  value: number,
  loading: boolean,
  locale: string,
) => {
  return loading ? '—' : value.toLocaleString(locale);
};

// The share of linked licenses near or over their limit, coloured once it is
// worth a look; below that it reads like the rest of the helper text.
export const getRiskRatioClassName = (riskRatioPercent: number) => {
  if (riskRatioPercent > 80) {
    return 'text-destructive-subtle-foreground';
  }

  if (riskRatioPercent > 50) {
    return 'text-warning-subtle-foreground';
  }

  return undefined;
};

export const getEntitlementAuditMetadata = (
  entitlementAudit: EntitlementAuditFields,
) => {
  return {
    createdAt: entitlementAudit.createdAt ?? entitlementAudit.created_at,
    createdByName: getAuditDisplayName({
      actor: entitlementAudit.createdBy ?? entitlementAudit.created_by,
    }),
    updatedAt: entitlementAudit.updatedAt ?? entitlementAudit.updated_at,
    updatedByName: getAuditDisplayName({
      actor: entitlementAudit.updatedBy ?? entitlementAudit.updated_by,
    }),
  };
};
