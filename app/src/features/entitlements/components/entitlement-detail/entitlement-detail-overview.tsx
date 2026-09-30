import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useEntitlementDetailContext } from './entitlement-detail-context';
import { EntitlementDetailGeneralCard } from './entitlement-detail-general-card';
import { EntitlementDetailLicensesCard } from './entitlement-detail-licenses-card';
import type { EntitlementAuditFields } from './entitlement-detail-overview.types';

export function EntitlementDetailOverviewTab() {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en-US';
  const {
    entitlement,
    isLoading,
    isUsageLoading,
    licenseAggregates,
    linkedLicenseMappings,
  } = useEntitlementDetailContext();
  const entitlementAudit = entitlement as EntitlementAuditFields;

  function handleEdit() {
    if (!entitlement.slug) {
      return;
    }

    navigate({
      to: '/entitlements/$entitlementSlug',
      params: { entitlementSlug: entitlement.slug },
      search: { mode: 'configure' },
    });
  }

  return (
    // The stats strip above already carries every count: the second column
    // lists the licenses behind them rather than repeating the numbers.
    <div className="grid items-start gap-4 xl:grid-cols-3">
      <EntitlementDetailGeneralCard
        entitlement={entitlement}
        entitlementAudit={entitlementAudit}
        locale={locale}
        onEdit={handleEdit}
      />
      <EntitlementDetailLicensesCard
        isLoading={isLoading}
        isUsageLoading={isUsageLoading}
        licenseAggregates={licenseAggregates}
        linkedLicenseMappings={linkedLicenseMappings}
        locale={locale}
      />
    </div>
  );
}

export const EntitlementDetailOverview = EntitlementDetailOverviewTab;
