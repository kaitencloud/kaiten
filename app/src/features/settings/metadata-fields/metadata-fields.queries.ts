import { queryOptions } from '@tanstack/react-query';
import { fetchMetadataFields } from '@/domains/metadata-fields';
import { type MetadataResourceType } from './types';

// The settings page always fetches with `includeArchived: true` because the
// admin grid surfaces a toggle to reveal them. The flag lives inside the
// cache key so a different consumer that ever queries the same scope with
// `includeArchived: false` doesn't read this page's wider list back as if
// the archived rows were really active.
export const metadataFieldsSettingsQueryKey = (
  resourceType: MetadataResourceType,
) =>
  ['settings', 'metadata-fields', resourceType, 'includeArchived:true'] as const;

export const metadataFieldsSettingsQueryOptions = (
  resourceType: MetadataResourceType,
) =>
  queryOptions({
    // The settings grid is the only consumer that wants archived rows too,
    // so it picks `includeArchived: true` on the shared domain fetcher.
    queryFn: () => fetchMetadataFields(resourceType, true),
    queryKey: metadataFieldsSettingsQueryKey(resourceType),
  });
