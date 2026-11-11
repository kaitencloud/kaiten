import type {
  Entitlement,
  EntitlementUsage,
  Instance,
  License,
  LicenseEntitlement,
} from '@/api-client';
import {
  buildAiAddonGrants,
  buildAiEntitlementUsages,
  buildAiGrants,
  buildAiInferences,
  buildAiModels,
  buildAiPools,
  buildAiRules,
  buildLargeAiGrants,
  buildLargeAiModels,
  buildLargeAiRules,
  buildLargeAiVersions,
} from '../../../../e2e/app/_support/fixtures';
import { AiAppModel } from '../../../../e2e/app/_support/model/ai-app-model';
import { currentMonth } from './dates';

/** Whether AI credits are on in the console (`?ai=off` in the address turns them off). */
export type AiStanding = 'on' | 'off';

/**
 * The size of the AI catalogue: `large` (`?catalogue=large`) has fifty-five
 * models over ten vendors and four Enterprise versions, to look at the rate
 * card at the size of a real catalogue. Its two added versions exist in the AI
 * area only.
 */
export type AiCatalogue = 'default' | 'large';

/** `off` (`?addonGrants=billing-off`): `License.addonGrants` answers `Billing.Disabled`. */
export type AiBilling = 'on' | 'off';

/** The AI credit pools, entitlements of the catalogue like any other. */
export const createAiPools = (): Entitlement[] => buildAiPools();

/** What the versions of the world grant of the pools. */
export const createAiGrants = (
  licenses: License[],
  pools: Entitlement[],
): LicenseEntitlement[] => buildAiGrants(licenses, pools);

/** What the instances have used of the pools: one near its limit, one overdrawn. */
export const createAiUsages = (
  instances: Instance[],
  grants: LicenseEntitlement[],
): Record<string, EntitlementUsage[]> =>
  buildAiEntitlementUsages(instances, grants, currentMonth());

/** Each instance's usage rows, with the AI pools' rows after the others. */
export const withAiUsages = (
  usages: Record<string, EntitlementUsage[]>,
  aiUsages: Record<string, EntitlementUsage[]>,
): Record<string, EntitlementUsage[]> =>
  Object.fromEntries(
    Object.entries(usages).map(([slug, rows]) => [
      slug,
      [...rows, ...(aiUsages[slug] ?? [])],
    ]),
  );

/**
 * The AI area of the world: the models, the rules that price them on the
 * versions of the world, and the feed of Acme Production and Globex Production,
 * priced by the console's own engine and dated from now.
 */
export const createAiModel = ({
  billing = 'on',
  catalogue = 'default',
  grants,
  licenses,
  pools,
}: {
  billing?: AiBilling;
  catalogue?: AiCatalogue;
  grants: LicenseEntitlement[];
  licenses: License[];
  pools: Entitlement[];
}) => {
  const large = catalogue === 'large';
  const models = large ? buildLargeAiModels() : buildAiModels();
  const rules = buildAiRules(grants);
  const largeVersions = large ? buildLargeAiVersions() : [];
  return new AiAppModel({
    addonGrants: buildAiAddonGrants(),
    billingDisabled: billing === 'off',
    grants: [...grants, ...buildLargeAiGrants(largeVersions)],
    inferences: buildAiInferences({
      models,
      now: Date.now(),
      rules,
      windowStart: currentMonth().currentPeriodStart,
    }),
    licenses: [...licenses, ...largeVersions],
    models,
    pools,
    rules: large ? [...rules, ...buildLargeAiRules()] : rules,
  });
};

/** The platform's answers for AI: the capability and the `ai-credits` flag. */
export const aiPlatform = (standing: AiStanding) => ({
  aiCapability: { enabled: standing === 'on' },
  flagEvaluations: { 'ai-credits': standing === 'on' },
});
