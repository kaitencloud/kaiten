import type { MetadataField } from '@/api-client/types.gen';
import { zMetadataField } from '@/api-client/zod.gen';

// Single source of truth: the resource types are derived from the generated
// schema (api-client/zod.gen) so they can't drift the day the API adds one.
export const metadataResourceTypes = zMetadataField.shape.resourceType.options;

export type MetadataResourceType = (typeof metadataResourceTypes)[number];

export type MetadataSettingsField = Omit<
  Pick<MetadataField, 'id' | 'jsonSchema' | 'key' | 'label' | 'resourceType'>,
  'resourceType'
> & {
  archivedAt?: string | null;
  resourceType: MetadataResourceType;
  // Narrowed from the API's `number | undefined`: displayOrder is optional
  // on the shared write schema only because it must never be echoed back on
  // update (see MetadataField's doc comment) -- on every read it's always
  // populated.
  displayOrder: number;
};
