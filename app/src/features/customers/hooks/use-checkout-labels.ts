import { useQuery } from '@tanstack/react-query';
import { useCanPerform } from '@/domains/billing';
import {
  allCustomersOptions,
  allInstancesOptions,
  allLicensesOptions,
} from '@/lib/api/all-pages-query-options';
import { allPublishableKeysOptions } from '@/lib/api/all-billing-pages-query-options';
import type { CheckoutLabels } from '../utils/checkout-session';

const NONE: Readonly<Record<string, string>> = {};

/** Names by slug, for a list whose rows have both; the first row of a slug names it. */
const namesBySlug = (rows: readonly { name: string; slug?: string }[]) => {
  const names: Record<string, string> = {};
  for (const { name, slug } of rows) {
    if (slug && name && !(slug in names)) {
      names[slug] = name;
    }
  }

  return names;
};

/**
 * What a checkout names by an id or a slug, in the words the rest of the console uses: the
 * label of the key whose page started it (the revoked keys too, a key keeps the checkouts
 * it started), and the name of its license, of the customer and of the instance it
 * created. The contract gives slugs only; each name is read from the list the page of that
 * entity reads (the same entry of the cache, so the tabs next to this one have it already),
 * asked for without waiting and without failing the screen. A session whose scopes do not
 * cover a list is not sent to be refused, and one that is still on its way leaves its
 * names empty: the screen shows the id or the slug until the name arrives.
 */
export function useCheckoutLabels(): CheckoutLabels {
  const mayListKeys = useCanPerform('publishableKeys.list');
  const mayListCustomers = useCanPerform('customers.list');
  const mayListInstances = useCanPerform('instances.list');
  const mayListLicenses = useCanPerform('licenses.list');
  const keys = useQuery({
    ...allPublishableKeysOptions({ includeRevoked: true }),
    enabled: mayListKeys,
    retry: false,
    select: (page) =>
      Object.fromEntries(page.items.map(({ id, label }) => [id, label])),
  });
  const customers = useQuery({
    ...allCustomersOptions(),
    enabled: mayListCustomers,
    retry: false,
    select: (page) => namesBySlug(page.items),
  });
  const instances = useQuery({
    ...allInstancesOptions(),
    enabled: mayListInstances,
    retry: false,
    select: (page) => namesBySlug(page.items),
  });
  const licenses = useQuery({
    ...allLicensesOptions(),
    enabled: mayListLicenses,
    retry: false,
    select: (page) => namesBySlug(page.items),
  });

  return {
    customers: customers.data ?? NONE,
    instances: instances.data ?? NONE,
    keys: keys.data ?? NONE,
    licenses: licenses.data ?? NONE,
  };
}
