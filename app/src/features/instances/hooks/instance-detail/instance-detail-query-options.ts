import {
  getCustomerOptions,
  getEntitlementsUsageMetricsOptions,
  getInstanceOptions,
  getLicenseOptions,
} from '@/api-client/@tanstack/react-query.gen';
import {
  allEntitlementsOptions,
  allLicenseEntitlementsOptions,
} from '@/lib/api/all-pages-query-options';

export const instanceQueryOptions = (instanceSlug: string) =>
  getInstanceOptions({ path: { instanceSlug } });

export const customerQueryOptions = (customerSlug: string) =>
  getCustomerOptions({ path: { customerSlug } });

export const licenseQueryOptions = (licenseSlug: string) =>
  getLicenseOptions({ path: { licenseSlug } });

export const instanceUsageQueryOptions = (instanceSlug: string) =>
  getEntitlementsUsageMetricsOptions({ path: { instanceSlug } });

export const instanceLicenseEntitlementsQueryOptions = (licenseSlug: string) =>
  allLicenseEntitlementsOptions(licenseSlug);

export const entitlementsCatalogQueryOptions = allEntitlementsOptions();
