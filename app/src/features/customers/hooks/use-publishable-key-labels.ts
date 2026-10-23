import { useQuery } from '@tanstack/react-query';
import { useCanPerform } from '@/domains/billing';
import { allPublishableKeysOptions } from '@/lib/api/all-billing-pages-query-options';

const NO_LABELS: Readonly<Record<string, string>> = {};

/**
 * The label of each publishable key by its id, for a checkout to say which page started
 * it. The revoked keys are read too: a key keeps the checkouts it started. It is the list
 * the page of the keys reads (the same entry of the cache), asked for without waiting and
 * without failing the screen: a session that may read the checkouts and not the keys, or
 * a list still on its way, leaves the labels empty and the screen shows the id.
 */
export function usePublishableKeyLabels(): {
  isPending: boolean;
  labels: Readonly<Record<string, string>>;
} {
  const mayList = useCanPerform('publishableKeys.list');
  const { data, isPending } = useQuery({
    ...allPublishableKeysOptions({ includeRevoked: true }),
    // A session whose scopes do not cover the keys is not sent to be refused.
    enabled: mayList,
    retry: false,
    select: (page) =>
      Object.fromEntries(page.items.map(({ id, label }) => [id, label])),
  });

  return { isPending: mayList && isPending, labels: data ?? NO_LABELS };
}
