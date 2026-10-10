// Types for service accounts feature

import type { PlainTokenWritable } from '@/api-client';
import type {
  ApiScopePermission,
  ApiScopeResource,
} from '@/lib/api/scopes.gen';

// Both come from the Core API's OpenAPI document rather than being spelled out
// here: its bearerAuth scheme lists every scope an organization credential can
// carry (x-kaiten-scopes), and packages/api-codegen turns that into
// lib/api/scopes.gen.ts. A hand-written union drifted in both directions before.
export type ResourceType = ApiScopeResource;

export type PermissionType = ApiScopePermission;

/**
 * What a token can do on each resource. A resource left out has no access; a
 * write level includes read, and the token carries both scopes for it.
 */
export type AccessLevels = Partial<Record<ResourceType, PermissionType>>;

export type AccessLevel = PermissionType | 'none';

export type ScopeGroupId =
  | 'customers'
  | 'licensing'
  | 'featureFlags'
  | 'releases'
  | 'billing'
  | 'organization';

export type TokenPresetId = 'dataPlane' | 'controlPlane';

/** What creating a token sends, once the form has turned levels into scopes. */
export type TokenCreateData = Pick<PlainTokenWritable, 'name' | 'expiresAt'> & {
  scopes: NonNullable<PlainTokenWritable['scopes']>;
};

export interface AvailableResource {
  id: ResourceType;
  group: ScopeGroupId;
  labelKey: string;
  descriptionKey: string;
  // Rendered when labelKey/descriptionKey have no translation, which the
  // vocabulary test forbids but a build can still meet between a regeneration
  // and its translations.
  fallbackLabel: string;
  fallbackDescription: string;
}

// Re-export API types for convenience
export type { PlainToken, ServiceAccount, Token, User } from '@/api-client';
