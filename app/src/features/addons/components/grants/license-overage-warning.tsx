import { useTranslation } from 'react-i18next';
import {
  LicenseGrantWarning,
  type LicenseGrantReading,
  lowersLicenseOverage,
} from '@/domains/billing';

type LicenseOverageWarningProps = {
  /** The percentage the grant sets; `NaN` when it inherits the license's. */
  addonPercent: number;
  /** What each compatible license grants of the entitlement. */
  licenses: readonly LicenseGrantReading[];
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
  const lowered = licenses.flatMap((license) =>
    license.percent !== null &&
    lowersLicenseOverage(addonPercent, license.percent)
      ? [{ name: license.licenseName, percent: license.percent }]
      : [],
  );

  if (lowered.length === 0) {
    return null;
  }

  return (
    <LicenseGrantWarning testId="license-overage-warning">
      {lowered.map((license) => (
        <p key={license.name}>
          {t('Pages.Addons.Grants.OverageWarning.message', {
            addon: addonPercent,
            license: license.percent,
            name: license.name,
          })}
        </p>
      ))}
      <p>{t('Pages.Addons.Grants.OverageWarning.consequence')}</p>
    </LicenseGrantWarning>
  );
}
