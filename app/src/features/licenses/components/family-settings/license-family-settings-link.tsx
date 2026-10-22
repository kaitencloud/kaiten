import { Link } from '@tanstack/react-router';
import { Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useBillingCapabilities, useCanPerform } from '@/domains/billing';
import type { LicenseGroup } from '../../types';

type LicenseFamilySettingsLinkProps = {
  group: Pick<LicenseGroup, 'familySlug' | 'licenseName'>;
};

/**
 * Opens the settings of the family (`?familySettings=<slug>` on the list): its
 * fallback, what its trials become without a payment method, and the lead of
 * their reminder. They act on subscriptions, so the link is there only where
 * billing is on, and for a session that may write licenses.
 */
export function LicenseFamilySettingsLink({
  group,
}: LicenseFamilySettingsLinkProps) {
  const { t } = useTranslation();
  const { isEnabled } = useBillingCapabilities();
  const maySet = useCanPerform('licenseFamily.updateSettings');

  if (!isEnabled || !maySet || !group.familySlug) {
    return null;
  }
  const familySlug = group.familySlug;

  return (
    <Button
      aria-label={t('Pages.Licenses.FamilySettings.linkLabel', {
        name: group.licenseName,
      })}
      data-family-settings={familySlug}
      nativeButton={false}
      render={
        <Link search={{ familySettings: familySlug }} to="/catalog/licenses">
          <Settings className="size-4" />
          {/* The row is tight on a phone: the icon stands for it, and the link is named
              after its family by its label. */}
          <span className="hidden sm:inline">
            {t('Pages.Licenses.FamilySettings.link')}
          </span>
        </Link>
      }
      role="link"
      size="sm"
      variant="outline"
    />
  );
}
