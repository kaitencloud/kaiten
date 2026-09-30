import { graphql } from '@/api-client/graphql';

// Shared selection set for the metadata-field list. Both the admin settings
// page (includeArchived: true) and the read-only table/form consumers
// (includeArchived: false) run this same query — only the flag differs.
//
// The server paginates this field, so the response is a page envelope rather
// than a bare list; fetchMetadataFields walks it to completion before handing
// callers the array they expect.
export const GET_METADATA_FIELDS = graphql(`
  query MetadataFields(
    $resourceType: MetadataFieldResourceType!
    $includeArchived: Boolean!
    $limit: Int
    $cursor: String
  ) {
    metadataFields(
      resourceType: $resourceType
      includeArchived: $includeArchived
      limit: $limit
      cursor: $cursor
    ) {
      items {
        archivedAt
        displayOrder
        id
        jsonSchema
        key
        label
        resourceType
      }
      nextCursor
      hasMore
    }
  }
`);
