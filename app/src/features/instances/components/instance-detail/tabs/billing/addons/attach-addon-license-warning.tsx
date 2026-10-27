import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Addon } from '@/api-client';
import {
  addonVersionGrantsQueryOptions,
  getEntitlementSlug,
  getOverrideReplacement,
  LicenseGrantWarning,
  lowersLicenseValue,
  readLicenseGrant,
} from '@/domains/billing';
import { useInstanceDetail } from '../../../instance-detail-context';

type AttachAddonLicenseWarningProps = {
  addon: Addon;
  /** The units to attach; `NaN` while the field is empty. */
  quantity: number;
};

/**
 * Says what an add-on that replaces a value of the instance's license with a lower one
 * does, before it is attached. An OVERRIDE grant puts its value times the quantity in
 * place of the license's, so one below it lowers the limit of this instance. The API
 * accepts it -- it is the vendor's intent -- and the dialog says so. The grants of the
 * version are read when it is chosen, the grants of the license are the instance's own,
 * and a version whose grants could not be read says nothing: an unread grant is no
 * reason to warn.
 */
export function AttachAddonLicenseWarning({
  addon,
  quantity,
}: AttachAddonLicenseWarningProps) {
  const { i18n, t } = useTranslation();
  const { entitlements, license, licenseEntitlements } = useInstanceDetail();
  const grants = useQuery(addonVersionGrantsQueryOptions(addon.slug));
  const lowered = (grants.data ?? []).flatMap((grant) => {
    const replacement = getOverrideReplacement(grant, quantity);
    const held = licenseEntitlements.find(
      ({ entitlementSlug }) => entitlementSlug === grant.entitlementSlug,
    );
    const reading = held && readLicenseGrant(license?.name ?? '', held);

    return reading &&
      replacement !== null &&
      reading.value !== null &&
      lowersLicenseValue(replacement, reading.value)
      ? [{ reading, replacement, slug: grant.entitlementSlug }]
      : [];
  });

  if (lowered.length === 0) {
    return null;
  }

  return (
    <LicenseGrantWarning testId="attach-addon-license-warning">
      {lowered.map(({ reading, replacement, slug }) => (
        <p key={slug}>
          {t(
            'Pages.Customers.Instances.Detail.Billing.Addons.Attach.BelowLicense.message',
            {
              addon: addon.name,
              entitlement:
                entitlements.find(
                  (entitlement) => getEntitlementSlug(entitlement) === slug,
                )?.name ?? slug,
              license: reading.value?.toLocaleString(i18n.language),
              name: reading.licenseName,
              value: replacement.toLocaleString(i18n.language),
            },
          )}
        </p>
      ))}
      <p>
        {t(
          'Pages.Customers.Instances.Detail.Billing.Addons.Attach.BelowLicense.consequence',
        )}
      </p>
    </LicenseGrantWarning>
  );
}
