import { useSuspenseQuery } from '@tanstack/react-query';
import {
  addonCompatibilityQueryOptions,
  addonLicenseFamiliesQueryOptions,
  useCanPerform,
} from '@/domains/billing';
import { useAddonCompatibility } from '../../hooks';
import { AddonCompatibilityCard } from './addon-compatibility-card';

type AddonCompatibilityTabProps = {
  addonSlug: string;
};

/**
 * The license families an add-on version fits. An instance can attach the version only
 * when its license is of one of them, and every version of a family counts. The
 * session that may write add-ons ticks and unticks them; the others read them.
 */
export function AddonCompatibilityTab({
  addonSlug,
}: AddonCompatibilityTabProps) {
  const { data: compatibility } = useSuspenseQuery(
    addonCompatibilityQueryOptions(addonSlug),
  );
  const { data: families } = useSuspenseQuery(
    addonLicenseFamiliesQueryOptions(),
  );
  const maySet = useCanPerform('addonCompatibility.set');
  const mayRemove = useCanPerform('addonCompatibility.remove');
  const { declare, isBusy } = useAddonCompatibility(addonSlug);

  return (
    <AddonCompatibilityCard
      compatible={compatibility.familySlugs}
      families={families.items}
      isBusy={isBusy}
      onChange={(familySlug, compatible) =>
        void declare(familySlug, compatible)
      }
      readOnly={!(maySet && mayRemove)}
    />
  );
}
