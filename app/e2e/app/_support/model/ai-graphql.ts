import type {
  ConversionRule,
  Entitlement,
  License,
  LicenseEntitlement,
} from '@/api-client';
import type { GraphQLVariables } from '../contracts/mock-http';
import type { AiAddonGrant } from '../fixtures/build-ai-addon-grants';
import { graphqlPage } from './graphql-operations';

/** What the AI GraphQL documents read of the model. */
export type AiGraphWorld = {
  grants: readonly LicenseEntitlement[];
  licenses: readonly License[];
  pools: readonly Entitlement[];
  rulesOf: (
    licenseSlug: string,
    status?: ConversionRule['status'],
  ) => ConversionRule[];
};

const versionOrder = (a: License, b: License) =>
  Number(a.version) - Number(b.version) ||
  (a.slug ?? '').localeCompare(b.slug ?? '');

const published = (license: License) =>
  (license.lifecycleState ?? 'PUBLISHED') === 'PUBLISHED';

/**
 * A family as `License.family` serves it: its identity and the version it
 * serves (its default, else its highest-numbered published one; none when
 * nothing is published). Its slug is the slug of the version that opened it,
 * as the API keeps it; a family has no name of its own.
 */
function familyOf(world: AiGraphWorld, license: License) {
  const versions = world.licenses
    .filter((item) => item.familyId === license.familyId)
    .sort(versionOrder);
  const current =
    versions.find((item) => item.isDefault && published(item)) ??
    versions.filter(published).at(-1) ??
    null;
  return {
    currentVersion: current && {
      name: current.name,
      slug: current.slug,
      versionNumber: Number(current.version ?? '1'),
    },
    fallbackLicenseFamilySlug: null,
    id: license.familyId,
    isPublic: false,
    slug: versions[0]?.slug ?? license.slug,
    trialEndWithoutPaymentMethod: 'CANCEL',
    trialReminderDays: 3,
  };
}

/**
 * A licence version as the GraphQL `License` serves it, with the fields the AI
 * documents select: its family, what it grants (`entitlements`) and its rules
 * (`conversionRules`, ACTIVE as both documents ask, unless `ruleStatus` says).
 */
function graphLicense(
  world: AiGraphWorld,
  license: License,
  ruleStatus: ConversionRule['status'] | undefined,
) {
  const entitlements = world.grants
    .filter((grant) => grant.licenseSlug === license.slug)
    .map((grant) => {
      const value =
        grant.value.type === 'number' ? Number(grant.value.value) : null;
      return {
        entitlement: world.pools.find(
          (pool) => pool.slug === grant.entitlementSlug,
        ),
        entitlementName: grant.entitlementName,
        entitlementSlug: grant.entitlementSlug,
        entitlementType: grant.entitlementType,
        licenseId: grant.licenseId,
        licenseSlug: grant.licenseSlug,
        limitCapExceededOveragePercent:
          value === null ? null : (grant.limitCapExceededOveragePercent ?? 0),
        unlimited: value === -1,
        value: grant.value,
      };
    });
  return {
    conversionRules: world.rulesOf(license.slug ?? '', ruleStatus),
    description: license.description,
    entitlements,
    family: familyOf(world, license),
    id: license.id,
    isDefault: license.isDefault ?? false,
    lifecycleState: license.lifecycleState ?? 'PUBLISHED',
    name: license.name,
    slug: license.slug,
    type: license.type,
    version: license.version ?? '1',
    versionName: license.versionName ?? null,
    versionNumber: Number(license.version ?? '1'),
  };
}

const ruleStatusOf = (variables: GraphQLVariables) =>
  variables?.ruleStatus === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE';

/**
 * `AiRateCard`: every licence version, a page at a time (`limit`, `cursor`),
 * with what it grants and its rules. The models are not in the document: the
 * console reads them, with their vendor costs, from REST.
 */
export function aiRateCardAnswer(
  world: AiGraphWorld,
  variables: GraphQLVariables,
) {
  const status = ruleStatusOf(variables);
  const rows = [...world.licenses]
    .sort(
      (a, b) =>
        (a.familyId ?? '').localeCompare(b.familyId ?? '') ||
        versionOrder(a, b),
    )
    .map((license) => graphLicense(world, license, status));
  return { licenses: graphqlPage(rows, variables) };
}

/** `AiAddonGrants`: what add-on versions can grant on one licence's family. */
export function aiAddonGrantsAnswer(
  world: {
    addonGrantsOf: (
      licenseSlug: string,
      entitlementSlug?: string | null,
    ) => AiAddonGrant[];
    licenses: readonly License[];
  },
  variables: GraphQLVariables,
) {
  const slug = String(variables?.licenseSlug ?? '');
  const license = world.licenses.find((item) => item.slug === slug);
  const pool = variables?.entitlementSlug;

  return {
    license: license
      ? {
          addonGrants: world.addonGrantsOf(
            slug,
            typeof pool === 'string' ? pool : null,
          ),
          slug,
        }
      : null,
  };
}
