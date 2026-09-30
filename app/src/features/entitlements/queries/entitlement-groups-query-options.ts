import { getEntitlementGroupOptions } from '@/api-client/@tanstack/react-query.gen';
import { allEntitlementGroupsOptions } from '@/lib/api/all-pages-query-options';

export const entitlementGroupsQueryOptions = allEntitlementGroupsOptions();

export const entitlementGroupQueryOptions = (entitlementGroupSlug: string) =>
  getEntitlementGroupOptions({
    path: { entitlementGroupSlug },
  });
