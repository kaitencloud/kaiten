import {
  API_SCOPE_RESOURCES,
  type ApiScopeResource,
} from '@/lib/api/scopes.gen';

import type {
  AccessLevels,
  AvailableResource,
  ScopeGroupId,
  TokenPresetId,
} from '../types';

export const SCOPES_I18N_PREFIX = 'Pages.Integrations.ServiceAccounts.Scopes';

// The i18n keys are camelCase where the scope is snake_case: deployment_zones
// is Resources.deploymentZones.
const i18nSegment = (resource: ApiScopeResource): string =>
  resource.replace(/_([a-z])/g, (_match, letter: string) =>
    letter.toUpperCase(),
  );

// 'deployment_zones' -> 'Deployment zones', for a build that meets a scope
// before its translation: "Deployment zones" beats a raw i18n key.
const humanize = (resource: ApiScopeResource): string => {
  const spaced = resource.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

// The order the groups appear in, which follows the side nav.
export const SCOPE_GROUP_IDS: ScopeGroupId[] = [
  'customers',
  'licensing',
  'featureFlags',
  'releases',
  'billing',
  'organization',
];

// A Record rather than a list, so a scope added to the backend fails the
// typecheck here until someone decides where it belongs. It still reaches the
// picker on its own (see lib/api/scopes.gen.ts); this is where it is placed, and
// the vocabulary test asks for its label and description in en and fr.
const RESOURCE_GROUPS: Record<ApiScopeResource, ScopeGroupId> = {
  customers: 'customers',
  instances: 'customers',
  licenses: 'licensing',
  entitlements: 'licensing',
  addons: 'licensing',
  feature_flags: 'featureFlags',
  releases: 'releases',
  components: 'releases',
  deployment_zones: 'releases',
  billing: 'billing',
  organizations: 'organization',
  tokens: 'organization',
  metadata_fields: 'organization',
  // A person's feed for a user's JWT; a service account's own, for its token.
  notifications: 'organization',
  webhooks: 'organization',
};

// The scope of a feature not every organization is served (domains/webhooks):
// the picker offers it only where webhooks are, since a token that may call
// webhooks is no use where none are served. The token's scopes are still what
// the API accepts -- this narrows what is offered, not what is valid.
export const WEBHOOKS_SCOPE_RESOURCE: ApiScopeResource = 'webhooks';

// Every scope an organization credential can carry, from the OpenAPI document.
export const AVAILABLE_RESOURCES: AvailableResource[] = API_SCOPE_RESOURCES.map(
  (id) => ({
    id,
    group: RESOURCE_GROUPS[id],
    labelKey: `${SCOPES_I18N_PREFIX}.Resources.${i18nSegment(id)}.label`,
    descriptionKey: `${SCOPES_I18N_PREFIX}.Resources.${i18nSegment(id)}.description`,
    fallbackLabel: humanize(id),
    fallbackDescription: `Access to ${humanize(id).toLowerCase()}`,
  }),
);

export const TOKEN_PRESET_IDS: TokenPresetId[] = ['dataPlane', 'controlPlane'];

// Shortcuts over the scope table, not token types: the API knows scopes only,
// and the page reads a preset as applied whenever the table covers it. What a
// preset grants is shown from this data, never restated in a translation -- a
// hand-written "Instances, …, Users (write)" outlived the users scope.
export const TOKEN_PRESETS: Record<TokenPresetId, AccessLevels> = {
  // What an SDK running inside the product calls: OFREP flag evaluation, the
  // licensing snapshot's REST fallback (customer, licenses, their entitlements)
  // and usage reports, which are written under an instance. It used to grant
  // write:entitlements, which edits the catalog, and not write:instances, so an
  // SDK holding it could not report usage.
  dataPlane: {
    feature_flags: 'read',
    customers: 'read',
    licenses: 'read',
    entitlements: 'read',
    instances: 'write',
  },
  // Automation that runs the fleet and the accounts around it: provisioning,
  // releases and their components, deployment zones, and its own tokens.
  controlPlane: {
    instances: 'write',
    licenses: 'write',
    customers: 'write',
    deployment_zones: 'write',
    releases: 'write',
    // Paired with releases: a release names the components it ships, so a token
    // that can create one but not the other cannot record what shipped.
    components: 'write',
    organizations: 'write',
    tokens: 'write',
  },
};

// Get badge variant based on scope type
export const getScopeBadgeVariant = (
  scope: string,
): 'default' | 'secondary' | 'outline' => {
  if (scope.startsWith('write:')) return 'default';
  if (scope.startsWith('read:')) return 'secondary';
  return 'outline';
};
