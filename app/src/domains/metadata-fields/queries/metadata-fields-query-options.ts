import { queryOptions } from '@tanstack/react-query';
import type { MetadataFieldsQuery } from '@/api-client/graphql/graphql';
import { graphqlClient } from '@/lib/graphql-client';
import type { MetadataResourceType, MetadataSettingsField } from '../types';
import { GET_METADATA_FIELDS } from './metadata-fields.queries';

// Stable ordering shared by every consumer of the metadata-field list:
// displayOrder first, then label, then key as a deterministic tie-breaker.
export const sortMetadataFields = <T extends MetadataSettingsField>(
  fields: T[],
): T[] =>
  [...fields].sort(
    (a, b) =>
      a.displayOrder - b.displayOrder ||
      a.label.localeCompare(b.label) ||
      a.key.localeCompare(b.key),
  );

// The server's maximum page size. Metadata fields are a small, admin-curated
// set — a handful of rows per resource type — so asking for the ceiling makes
// the walk below a single round trip in practice.
const MAX_PAGE_SIZE = 200;

// Every consumer of this list (the settings grid, the table column builder,
// the form dialogs) needs all of it to render a correct view, so the
// pagination the API enforces is drained here rather than surfaced: callers
// still receive one array. The loop is what keeps an org that outgrows a
// single page correct instead of silently truncated at the page boundary.
export const fetchMetadataFields = async (
  resourceType: MetadataResourceType,
  includeArchived: boolean,
): Promise<MetadataSettingsField[]> => {
  const fields: MetadataSettingsField[] = [];
  let cursor: string | null = null;

  do {
    const data: MetadataFieldsQuery =
      await graphqlClient.request<MetadataFieldsQuery>(
        GET_METADATA_FIELDS.toString(),
        { cursor, includeArchived, limit: MAX_PAGE_SIZE, resourceType },
      );

    const page = data.metadataFields;
    fields.push(...page.items);
    // nextCursor is null exactly when hasMore is false, so this terminates on
    // the last page — and also if the server ever contradicts itself by
    // claiming more without handing over a cursor to reach it.
    cursor = page.hasMore ? (page.nextCursor ?? null) : null;
  } while (cursor);

  return sortMetadataFields(fields);
};

export const metadataFieldsActiveQueryKey = (
  resourceType: MetadataResourceType,
) => ['metadata-fields', resourceType, 'includeArchived:false'] as const;

export const metadataFieldsActiveQueryOptions = (
  resourceType: MetadataResourceType,
) =>
  queryOptions({
    queryFn: () => fetchMetadataFields(resourceType, false),
    queryKey: metadataFieldsActiveQueryKey(resourceType),
    staleTime: 30_000,
  });
