import { queryOptions } from '@tanstack/react-query';
import { getInstances, listInstanceAddons } from '@/api-client';
import { getProblemCode } from '@/domains/billing';
import { fetchAllPages, MAX_PAGE_SIZE } from '@/lib/api/pagination';
import type { AddonHolder } from '../types';

export const addonHoldersBaseQueryKey = ['addons', 'holders'] as const;

// How many instances are read at once: enough to be quick, few enough not to flood
// the API with one request per instance of the organization.
const CONCURRENCY = 6;

/**
 * Which instances hold a version, and how many units each. The API takes any
 * `maxQuantity` and checks it against nothing, so lowering it under what an
 * instance holds would leave a quantity the version no longer allows. It has no
 * list of who holds a version either, so they are found where they are, in the add-ons
 * of the instances, one read each. It is a search made only when a person asks to
 * lower the maximum, to answer the question the console has to ask first, and an
 * instance that went in the meantime (404) is no match and no error.
 */
export const addonHoldersQueryOptions = (addonSlug: string) =>
  queryOptions({
    queryKey: [...addonHoldersBaseQueryKey, addonSlug] as const,
    queryFn: async ({ signal }): Promise<AddonHolder[]> => {
      const instances = await fetchAllPages(
        async (cursor) =>
          (
            await getInstances({
              query: { cursor, limit: MAX_PAGE_SIZE },
              signal,
              throwOnError: true,
            })
          ).data,
        signal,
      );
      const holders: AddonHolder[] = [];
      let next = 0;

      const worker = async () => {
        while (next < instances.length) {
          const instance = instances[next++];
          const instanceSlug = instance.slug ?? instance.id;
          try {
            const { data } = await listInstanceAddons({
              path: { instanceSlug },
              signal,
              throwOnError: true,
            });
            const held = data.find(
              (attached) =>
                attached.addonSlug === addonSlug &&
                attached.removedAt === undefined,
            );
            if (held) {
              holders.push({
                instanceName: instance.name,
                instanceSlug,
                quantity: held.quantity,
              });
            }
          } catch (error) {
            if (
              getProblemCode(error) !== 'ListInstanceAddons.InstanceNotFound'
            ) {
              throw error;
            }
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, instances.length) }, worker),
      );

      return holders.sort(
        (left, right) =>
          right.quantity - left.quantity ||
          left.instanceName.localeCompare(right.instanceName),
      );
    },
    retry: false,
    staleTime: 0,
  });
