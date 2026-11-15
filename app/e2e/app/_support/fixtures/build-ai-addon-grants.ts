import type { AiAddonGrantsQuery } from '@/api-client/graphql/graphql';
import { AI_POOL, PARTNER_POOL } from './build-ai-catalogue';

/**
 * What an add-on version can grant of a credit pool to the instances of a
 * licence family: the mocks' copy of `License.addonGrants`. An add-on attaches
 * to an instance, never to a licence; the link is a compatibility between the
 * add-on version and the family, so `licenseSlug` names any version of it and
 * every version of that family answers the same.
 */
export type AiAddonGrant = NonNullable<
  AiAddonGrantsQuery['license']
>['addonGrants'][number];

export type AiAddonGrantSeed = AiAddonGrant & { licenseSlug: string };

const grant = (
  licenseSlug: string,
  entitlementSlug: string,
  addon: Pick<
    AiAddonGrantSeed,
    'addonFamilySlug' | 'addonName' | 'addonVersion' | 'lifecycleState'
  > &
    Partial<
      Pick<
        AiAddonGrantSeed,
        'isDefault' | 'maxQuantity' | 'overrideBehavior' | 'unlimited'
      >
    >,
  credits: number,
): AiAddonGrantSeed => ({
  addonId: `00000000-0000-4000-9000-${`${addon.addonFamilySlug}${addon.addonVersion}`
    .replace(/[^a-f0-9]/g, '')
    .padStart(12, '0')
    .slice(-12)}`,
  addonSlug:
    addon.addonVersion === 1
      ? addon.addonFamilySlug
      : `${addon.addonFamilySlug}-v${addon.addonVersion}`,
  entitlementSlug,
  isDefault: false,
  licenseSlug,
  maxQuantity: null,
  overrideBehavior: 'ADD',
  unlimited: false,
  value: { type: 'number', value: credits },
  ...addon,
});

/**
 * Business does not grant the partner pool, and two versions of an add-on can
 * (one archived, which instances may still hold): its partner rules read
 * "through an add-on". Starter grants the shared pool itself and has a top-up
 * add-on in draft besides. Enterprise has none, so the partner rule of its
 * first version stays "pool not granted".
 */
export const buildAiAddonGrants = (): AiAddonGrantSeed[] => [
  grant(
    'business',
    PARTNER_POOL,
    {
      addonFamilySlug: 'partner-credit-pack',
      addonName: 'Partner credit pack',
      addonVersion: 1,
      lifecycleState: 'ARCHIVED',
    },
    1_000,
  ),
  grant(
    'business',
    PARTNER_POOL,
    {
      addonFamilySlug: 'partner-credit-pack',
      addonName: 'Partner credit pack',
      addonVersion: 2,
      isDefault: true,
      lifecycleState: 'PUBLISHED',
      maxQuantity: 10,
    },
    2_000,
  ),
  grant(
    'starter-v2',
    AI_POOL,
    {
      addonFamilySlug: 'credit-top-up',
      addonName: 'Credit top-up',
      addonVersion: 1,
      lifecycleState: 'DRAFT',
    },
    500,
  ),
];
