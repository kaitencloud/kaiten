import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { useCanPerform } from '@/domains/billing';
import { useAddonFamilyVisibility } from '../../hooks';
import type { AddonGroup } from '../../types';

type AddonFamilyPublicToggleProps = {
  group: Pick<AddonGroup, 'family' | 'name'>;
};

/**
 * Lists the family in the public catalogue, or takes it out: the switch of the row of
 * a family. Families are private until listed, and the catalogue serves the default
 * published version of a listed one, with its active prices. The switch is there for a
 * session that may write add-ons. The page it is on exists only where billing does
 * (its route is guarded), so the listing is a billing matter the console already
 * gates. It shows what the API answered and is off while a change is on its way.
 */
export function AddonFamilyPublicToggle({
  group,
}: AddonFamilyPublicToggleProps) {
  const { t } = useTranslation();
  const mayList = useCanPerform('addonFamily.setPublic');
  const visibility = useAddonFamilyVisibility();

  if (!mayList) {
    return null;
  }
  const familySlug = group.family.slug;

  return (
    <div className="flex items-center gap-2">
      <Switch
        aria-label={t('Pages.Addons.Public.switchLabel', { name: group.name })}
        checked={group.family.isPublic}
        disabled={visibility.isPending}
        onCheckedChange={(isPublic) =>
          visibility.mutate({ body: { isPublic }, path: { familySlug } })
        }
        size="sm"
      />
      {/* Not a label of the switch: it would name it, and name every switch of the
          list the same. The switch is named after its family, which this repeats. */}
      <span aria-hidden className="text-xs text-muted-foreground">
        {t('Pages.Addons.Public.label')}
      </span>
    </div>
  );
}
