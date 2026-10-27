import { useTranslation } from 'react-i18next';
import {
  LicenseGrantWarning,
  type LicenseGrantReading,
  lowersLicenseValue,
} from '@/domains/billing';
import { type GrantFormValues, readModifierValue } from '../../schemas';

type BoostLicenseWarningProps = {
  /** The name of the entitlement the change is about. */
  entitlementName: string;
  grant: GrantFormValues;
  /** What each license the voucher can be redeemed on grants of the entitlement. */
  licenses: readonly LicenseGrantReading[];
};

/**
 * Says what a SET lower than a license's value does. A boost that sets an entitlement
 * replaces the value of the license and of every add-on for as long as it applies, so one
 * below the license's lowers the limit of every instance that redeems it. The API
 * accepts it -- it is the vendor's intent -- and the console says so before the voucher is
 * made. Adding, multiplying and lifting never lower a value, and an empty or unreadable
 * value is the field's to refuse.
 */
export function BoostLicenseWarning({
  entitlementName,
  grant,
  licenses,
}: BoostLicenseWarningProps) {
  const { i18n, t } = useTranslation();
  if (
    grant.entitlementType === 'BOOLEAN' &&
    !grant.booleanValue &&
    licenses.some((license) => license.enabled)
  ) {
    return (
      <LicenseGrantWarning testId="boost-license-warning">
        <p>
          {t('Pages.Vouchers.Extensions.booleanWarning', {
            entitlement: entitlementName,
          })}
        </p>
      </LicenseGrantWarning>
    );
  }
  const value =
    grant.modifierType === 'SET'
      ? readModifierValue(grant.modifierValue)
      : null;
  const lowered = licenses.flatMap((license) =>
    license.value !== null && lowersLicenseValue(value, license.value)
      ? [{ name: license.licenseName, value: license.value }]
      : [],
  );

  if (value === null || lowered.length === 0) {
    return null;
  }

  return (
    <LicenseGrantWarning testId="boost-license-warning">
      {lowered.map((license) => (
        <p key={license.name}>
          {t('Pages.Vouchers.Wizard.BelowLicense.message', {
            entitlement: entitlementName,
            license: license.value.toLocaleString(i18n.language),
            name: license.name,
            value: value.toLocaleString(i18n.language),
          })}
        </p>
      ))}
      <p>{t('Pages.Vouchers.Wizard.BelowLicense.consequence')}</p>
    </LicenseGrantWarning>
  );
}
