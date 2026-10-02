import type {
  MetadataResourceType,
  MetadataSettingsField,
} from '@/domains/metadata-fields';
import { graphqlOperationHandler } from '@/e2e/msw/handler-factory';

/**
 * Handlers the stories share, for `parameters.msw.handlers` (see
 * `.storybook/msw.ts`). A REST endpoint takes its generated handler from
 * `@/api-client/msw.gen` directly, with `onePage` for a list.
 */

/** The body of a list endpoint that holds every item on its first page. */
export const onePage = <T>(items: T[]) => ({
  body: { hasMore: false, items },
});

/**
 * The active metadata fields of each resource type, as the GraphQL
 * `MetadataFields` query serves them. A type left out declares no field: the
 * forms and tables then fall back to raw-JSON metadata.
 */
export const metadataFieldsHandler = (
  fields: Partial<Record<MetadataResourceType, MetadataSettingsField[]>> = {},
) =>
  graphqlOperationHandler({
    MetadataFields: (variables) => ({
      metadataFields: {
        hasMore: false,
        nextCursor: null,
        items: fields[variables?.resourceType as MetadataResourceType] ?? [],
      },
    }),
  });
