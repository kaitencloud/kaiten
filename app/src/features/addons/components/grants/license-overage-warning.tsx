import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { LicenseOverage } from '../../hooks';
import { lowersLicenseOverage } from '../../utils/addon-grant.utils';

type LicenseOverageWarningProps = {
  /** The percentage the grant sets; `NaN` when it inherits the license's. */
  addonPercent: number;
  /** What each compatible license allows of the entitlement. */
  licenses: readonly LicenseOverage[];
};

/**
 * Says what an overage allowance lower than a license's does. A grant that sets one
 * replaces the license's on every instance that attaches the add-on, so a lower one
 * hardens the quota of every instance that attaches it: usage is refused sooner than
 * the license says. A grant that inherits, or allows as much, changes nothing, and
 * says nothing.
 */
export function LicenseOverageWarning({
  addonPercent,
  licenses,
}: LicenseOverageWarningProps) {
  const { t } = useTranslation();
  const lowered = licenses.filter((license) =>
    lowersLicenseOverage(addonPercent, license.percent),
  );

  if (lowered.length === 0) {
    return null;
  }

  return (
    <Alert data-testid="license-overage-warning" role="status">
      <TriangleAlert className="text-warning-subtle-foreground" />
      <AlertDescription>
        {lowered.map((license) => (
          <p key={license.licenseName}>
            {t('Pages.Addons.Grants.OverageWarning.message', {
              addon: addonPercent,
              license: license.percent,
              name: license.licenseName,
            })}
          </p>
        ))}
        <p>{t('Pages.Addons.Grants.OverageWarning.consequence')}</p>
      </AlertDescription>
    </Alert>
  );
}
