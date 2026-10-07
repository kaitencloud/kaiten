import { useSuspenseQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { licenseQueryOptions } from '../../queries';
import { LicenseEntitlementsCard } from '../entitlements/license-entitlements-card';
import { LicenseCommercialCard } from '../commercial';
import { NewVersionDialog } from '../new-version-dialog';
import { LicenseDetailsCard } from './license-details-card';
import { useLicenseGrants } from './use-license-detail-page';

type LicenseOverviewTabProps = {
  licenseSlug: string;
};

/**
 * The Overview tab of a license version: its details, how it is sold where
 * billing is on, and the entitlements it grants, which are edited in place.
 */
export function LicenseOverviewTab({ licenseSlug }: LicenseOverviewTabProps) {
  const { t } = useTranslation();
  const router = useRouter();
  // What the API refused with when the grants could not change any more.
  const [frozen, setFrozen] = useState<unknown>(null);
  const { data: license } = useSuspenseQuery(licenseQueryOptions(licenseSlug));
  const grants = useLicenseGrants({ licenseSlug, onFrozen: setFrozen });

  return (
    <div className="space-y-6">
      <LicenseDetailsCard
        license={license}
        onDraftDeleted={() => router.navigate({ to: '/licenses' })}
        t={t}
      />

      <LicenseCommercialCard license={license} />

      <LicenseEntitlementsCard
        entitlements={grants.entitlements}
        rows={grants.rows}
        onAddEntitlement={grants.onAddEntitlement}
        onClickEntitlement={grants.onClickEntitlement}
        onUpdateEntitlementGrant={grants.onUpdateEntitlementGrant}
        onDeleteEntitlement={grants.onDeleteEntitlement}
      />

      {frozen ? (
        <NewVersionDialog
          error={frozen}
          licenseSlug={licenseSlug}
          onClose={() => setFrozen(null)}
        />
      ) : null}
    </div>
  );
}
