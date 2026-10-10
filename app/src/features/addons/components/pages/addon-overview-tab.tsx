import { useSuspenseQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { addonQueryOptions } from '../../queries';
import { AddonDetailsCard } from './addon-details-card';

type AddonOverviewTabProps = {
  addonSlug: string;
};

/**
 * The Overview tab of an add-on version: what it is and what can be done to it. Its
 * grants, its prices and the licenses it fits are the tabs beside it. Deleting a
 * draft leaves the page, to the list the version was in.
 */
export function AddonOverviewTab({ addonSlug }: AddonOverviewTabProps) {
  const router = useRouter();
  const { data: addon } = useSuspenseQuery(addonQueryOptions(addonSlug));

  return (
    <AddonDetailsCard
      addon={addon}
      onDraftDeleted={() => void router.navigate({ to: '/catalog/addons' })}
    />
  );
}
