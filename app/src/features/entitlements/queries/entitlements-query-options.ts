import { getEntitlementOptions } from '@/api-client/@tanstack/react-query.gen';
import { allEntitlementsOptions } from '@/lib/api/all-pages-query-options';

export const entitlementsQueryOptions = allEntitlementsOptions();

export const entitlementQueryOptions = (entitlementSlug: string) =>
  getEntitlementOptions({ path: { entitlementSlug } });
