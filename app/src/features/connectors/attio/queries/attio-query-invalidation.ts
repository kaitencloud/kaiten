import type { QueryClient } from '@tanstack/react-query';
import { getInstancesQueryKey } from '@/api-client/@tanstack/react-query.gen';
import {
  instancesWithRelationsBaseQueryKey,
  invalidateCustomerQueries,
} from '@/domains/customer-management';
import { attioSettingsBaseQueryKey } from './attio-settings-query-options';
import { attioSyncedRecordsBaseQueryKey } from './synced-records-query-options';

/**
 * Centralizes invalidation of connector-related queries after a mutation:
 * the settings themselves, the synced-records table, and the customers /
 * instances list projections that render the per-entity CRM sync state.
 * Per-entity detail queries are left out: the worker syncs asynchronously,
 * so their `integrations` payload does not change with the mutation itself.
 */
export async function invalidateAttioQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: attioSettingsBaseQueryKey }),
    queryClient.invalidateQueries({
      queryKey: attioSyncedRecordsBaseQueryKey,
    }),
    queryClient.invalidateQueries({ queryKey: getInstancesQueryKey() }),
    queryClient.invalidateQueries({
      queryKey: instancesWithRelationsBaseQueryKey,
    }),
    invalidateCustomerQueries(queryClient),
  ]);
}
