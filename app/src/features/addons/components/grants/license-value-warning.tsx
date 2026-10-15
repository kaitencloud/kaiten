import { useTranslation } from 'react-i18next';
import {
  getOverrideReplacement,
  LicenseGrantWarning,
  type LicenseGrantReading,
  lowersLicenseValue,
} from '@/domains/billing';

type LicenseValueWarningProps = {
  /** How the grant combines with the license's: only an OVERRIDE replaces it. */
  behavior: string;
  /** What each compatible license grants of the entitlement. */
  licenses: readonly LicenseGrantReading[];
  /** The value per unit the grant sets; `NaN` while it is empty, `-1` unlimited. */
  value: number;
};

/**
 * Says what a value lower than a license's does. An OVERRIDE grant replaces the
 * license's value on every instance that attaches the add-on, whatever it is, so one
 * below it lowers the limit of every instance on that license. The API accepts it -- it
 * is the vendor's intent -- and the console says so before it is sent. A MAX or an ADD
 * grant never lowers a value, a value of 0 is ignored, and an unlimited one is not lower.
 * The warning counts one unit: the quantity is the instance's to choose, and a unit is
 * the least an attachment grants.
 */
export function LicenseValueWarning({
  behavior,
  licenses,
  value,
}: LicenseValueWarningProps) {
  const { i18n, t } = useTranslation();
  const replacement = getOverrideReplacement({
    overrideBehavior: behavior,
    value: { type: 'number', value },
  });
  const lowered = licenses.flatMap((license) =>
    license.value !== null && lowersLicenseValue(replacement, license.value)
      ? [{ name: license.licenseName, value: license.value }]
      : [],
  );

  if (replacement === null || lowered.length === 0) {
    return null;
  }

  return (
    <LicenseGrantWarning testId="license-value-warning">
      {lowered.map((license) => (
        <p key={license.name}>
          {t('Pages.Addons.Grants.ValueWarning.message', {
            license: license.value.toLocaleString(i18n.language),
            name: license.name,
            value: replacement.toLocaleString(i18n.language),
          })}
        </p>
      ))}
      <p>{t('Pages.Addons.Grants.ValueWarning.consequence')}</p>
    </LicenseGrantWarning>
  );
}
