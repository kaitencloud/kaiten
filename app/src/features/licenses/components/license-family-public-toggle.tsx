import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { useBillingCapabilities, useCanPerform } from '@/domains/billing';
import { useLicenseFamilyVisibility } from '../hooks/use-license-family-visibility';
import type { LicenseGroup } from '../types';

type LicenseFamilyPublicToggleProps = {
  group: Pick<LicenseGroup, 'familySlug' | 'isPublic' | 'licenseName'>;
};

/**
 * Lists the family in the public catalogue, or takes it out: the switch of the row
 * of a family. Families are private until listed, and the catalogue serves the
 * default published version of a listed one. The API does not gate the listing on
 * billing, so the console does: the switch is there only where billing is on, and
 * for a session that may write licenses, and a family the API did not list has none.
 * It shows what the API answered and is off while a change is on its way.
 */
export function LicenseFamilyPublicToggle({
  group,
}: LicenseFamilyPublicToggleProps) {
  const { t } = useTranslation();
  const { isEnabled } = useBillingCapabilities();
  const mayList = useCanPerform('licenseFamily.setPublic');
  const visibility = useLicenseFamilyVisibility();

  if (!isEnabled || !mayList || !group.familySlug) {
    return null;
  }
  const familySlug = group.familySlug;

  return (
    <div className="flex items-center gap-2">
      <Switch
        aria-label={t('Pages.Licenses.Public.switchLabel', {
          name: group.licenseName,
        })}
        checked={group.isPublic}
        disabled={visibility.isPending}
        onCheckedChange={(isPublic) =>
          visibility.mutate({ body: { isPublic }, path: { familySlug } })
        }
        size="sm"
      />
      {/* Not a label of the switch: it would name it, and name every switch of the
          list the same. The switch is named after its family, which this repeats. */}
      <span aria-hidden className="text-xs text-muted-foreground">
        {t('Pages.Licenses.Public.label')}
      </span>
    </div>
  );
}
