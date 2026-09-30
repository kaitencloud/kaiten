import { getFeatureFlagOptions } from '@/api-client/@tanstack/react-query.gen';
import { allFeatureFlagsOptions } from '@/lib/api/all-pages-query-options';

export const featureFlagsQueryOptions = allFeatureFlagsOptions();

export const featureFlagQueryOptions = (featureFlagSlug: string) =>
  getFeatureFlagOptions({ path: { featureFlagSlug } });
