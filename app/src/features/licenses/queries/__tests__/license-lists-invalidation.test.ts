import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vite-plus/test';
import { getLicensesQueryKey } from '@/api-client/@tanstack/react-query.gen';
import { licensesWithPricesBaseQueryKey } from '@/domains/billing';
import {
  invalidateLicenseLists,
  licensesWithInstancesBaseQueryKey,
} from '../license-query-options';

const invalidated = (client: QueryClient, key: readonly unknown[]) =>
  client.getQueryState(key)?.isInvalidated === true;

describe('invalidateLicenseLists', () => {
  it('refreshes the lists of licenses, the families they are shown under and the versions read with their prices', async () => {
    const client = new QueryClient();
    const lists = [
      getLicensesQueryKey(),
      licensesWithInstancesBaseQueryKey,
      // How each family is sold and which versions are on sale: a version that is published,
      // archived or renamed changes them.
      licensesWithPricesBaseQueryKey,
    ];
    for (const key of lists) {
      client.setQueryData(key, { seeded: true });
    }
    client.setQueryData(['somewhere', 'else'], { seeded: true });

    await invalidateLicenseLists(client);

    for (const key of lists) {
      expect(invalidated(client, key), JSON.stringify(key)).toBe(true);
    }
    expect(invalidated(client, ['somewhere', 'else'])).toBe(false);
  });
});
