import type { Entitlement, License, Model } from '@/api-client';
import { buildAiAddonGrants } from '../../../../../e2e/app/_support/fixtures/build-ai-addon-grants';
import {
  buildAiGrants,
  buildAiModels,
  buildAiPools,
  buildAiRules,
} from '../../../../../e2e/app/_support/fixtures/build-ai-catalogue';
import type { AddonGrantsState, RateCardLicense } from '@/domains/ai-credits';
import {
  CURRENT_FAMILIES,
  type RateCardVersion,
  vendorGroups,
  versionsInView,
  withAddonGrants,
} from '../rate-card-model';

/**
 * The world of the stories of the rate card: the models, pools, grants and
 * rules the mocks serve (`build-ai-catalogue`), on seven licence versions, read
 * as the graph serves them. All synthetic.
 */

type VersionSpec = [
  slug: string,
  family: string,
  name: string,
  version: number,
  versionName: string,
  lifecycle: RateCardLicense['lifecycleState'],
  isDefault: boolean,
];

const VERSIONS: VersionSpec[] = [
  ['trial', 'trial', 'Trial', 1, '2026', 'PUBLISHED', true],
  ['starter', 'starter', 'Starter', 1, '2025', 'ARCHIVED', false],
  ['starter-v2', 'starter', 'Starter', 2, '2026', 'PUBLISHED', true],
  ['starter-v3', 'starter', 'Starter', 3, '2027', 'DRAFT', false],
  ['business', 'business', 'Business', 1, '2026', 'PUBLISHED', true],
  ['enterprise', 'enterprise', 'Enterprise', 1, '2025', 'PUBLISHED', false],
  ['enterprise-v2', 'enterprise', 'Enterprise', 2, '2026', 'PUBLISHED', true],
];

export const storyModels: Model[] = buildAiModels();
export const storyPools: Entitlement[] = buildAiPools();

const asLicenses = VERSIONS.map(
  ([slug, , name]) =>
    ({
      createdAt: '2026-09-01T09:00:00.000Z',
      id: `license-${slug}`,
      name,
      slug,
    }) as License,
);
const grants = buildAiGrants(asLicenses, storyPools);
const addonSeeds = buildAiAddonGrants();
/** The family of a licence slug, as the versions above name it. */
const familyOf = (slug: string) =>
  VERSIONS.find(([itsSlug]) => itsSlug === slug)?.[1] ?? slug;
// A rule knows that an add-on can grant its pool on its version's family.
const rules = buildAiRules(
  grants,
  VERSIONS.flatMap(([slug, family]) =>
    addonSeeds
      .filter((seed) => familyOf(seed.licenseSlug) === family)
      .map((seed) => [slug, seed.entitlementSlug] as const),
  ),
);

/** What the add-on grants read answers for a pool, by family: the mocks' own. */
export function storyAddonGrants(pool: string): Map<string, AddonGrantsState> {
  return new Map(
    [...new Set(VERSIONS.map(([, family]) => family))].map((family) => [
      family,
      {
        status: 'READY',
        grants: addonSeeds
          .filter(
            (seed) =>
              familyOf(seed.licenseSlug) === family &&
              seed.entitlementSlug === pool,
          )
          .map(({ licenseSlug: _license, ...grant }) => grant),
      },
    ]),
  );
}

/** The version a family serves: its default one, as the API resolves it. */
function currentOf(family: string) {
  const current = VERSIONS.find(
    ([, itsFamily, , , , , isDefault]) => itsFamily === family && isDefault,
  );

  return current
    ? { name: current[2], slug: current[0], versionNumber: current[3] }
    : null;
}

export const storyLicenses: RateCardLicense[] = VERSIONS.map(
  ([slug, family, name, version, versionName, lifecycleState, isDefault]) => ({
    conversionRules: rules
      .filter((rule) => rule.licenseSlug === slug && rule.status === 'ACTIVE')
      .map((rule) => ({
        ...rule,
        createdBy: { id: rule.createdBy.id, name: rule.createdBy.name ?? '' },
        updatedBy: { id: rule.updatedBy.id, name: rule.updatedBy.name ?? '' },
        rates: {
          perCacheWriteToken: rule.rates.perCacheWriteToken ?? null,
          perCachedInputToken: rule.rates.perCachedInputToken ?? null,
          perInputToken: rule.rates.perInputToken ?? null,
          perOutputToken: rule.rates.perOutputToken ?? null,
          perRequest: rule.rates.perRequest ?? null,
          perSecond: rule.rates.perSecond ?? null,
          perUnit: rule.rates.perUnit ?? null,
        },
      })),
    entitlements: grants
      .filter((grant) => grant.licenseSlug === slug)
      .map((grant) => ({
        entitlementSlug: grant.entitlementSlug ?? '',
        entitlementType: grant.entitlementType ?? '',
        limitCapExceededOveragePercent:
          grant.limitCapExceededOveragePercent ?? 0,
        unlimited: false,
        value: grant.value,
      })),
    family: {
      currentVersion: currentOf(family),
      id: `family-${family}`,
      slug: family,
    },
    id: `license-${slug}`,
    isDefault,
    lifecycleState,
    name,
    slug,
    version: String(version),
    versionName,
    versionNumber: version,
  }),
);

/** The columns of a view of the story world. */
export function storyVersions(
  pool = 'ai-credits',
  family: string = CURRENT_FAMILIES,
): RateCardVersion[] {
  return withAddonGrants(
    versionsInView(storyLicenses, pool, family),
    storyAddonGrants(pool),
  );
}

export const storyVersion = (slug: string, pool = 'ai-credits') => {
  const version = storyLicenses
    .map((license) => license.family.slug)
    .flatMap((family) => versionsInView(storyLicenses, pool, family))
    .find((item) => item.slug === slug);
  if (!version) {
    throw new Error(`No version ${slug} in the story world`);
  }

  return version;
};

export const storyModel = (slug: string): Model => {
  const model = storyModels.find((item) => item.slug === slug);
  if (!model) {
    throw new Error(`No model ${slug} in the story world`);
  }

  return model;
};

export const storyPool = (slug = 'ai-credits'): Entitlement => {
  const pool = storyPools.find((item) => item.slug === slug);
  if (!pool) {
    throw new Error(`No pool ${slug} in the story world`);
  }

  return pool;
};

/** Many more models than a screen holds, to see the grid under load. */
export function manyModels(count: number): Model[] {
  const vendors = ['Anthropic', 'Google', 'Mistral', 'OpenAI', 'xAI'];
  const base = storyModel('claude-haiku-4-5');

  return Array.from({ length: count }, (_, index) => ({
    ...base,
    id: `model-bulk-${index}`,
    name: `Model ${String(index + 1).padStart(2, '0')}`,
    slug: `model-${index + 1}`,
    vendor: vendors[index % vendors.length] ?? 'OpenAI',
  }));
}

export const storyGroups = (
  type: Parameters<typeof vendorGroups>[1]['type'] = 'COMPLETION',
  status: 'active' | 'all' = 'active',
  models: Model[] = storyModels,
) => vendorGroups(models, { type, status, q: '' });
