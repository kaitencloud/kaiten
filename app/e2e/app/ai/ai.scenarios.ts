import type { Instance, License } from '@/api-client';
import {
  buildAiAddonGrants,
  buildAiEntitlementUsages,
  buildAiGrants,
  buildAiInferences,
  buildAiModels,
  buildAiPools,
  buildAiRules,
  buildCustomer,
  buildLargeAiGrants,
  buildLargeAiModels,
  buildLargeAiRules,
  buildLargeAiVersions,
  buildLicense,
  TEST_USER,
} from '../_support/fixtures';
import { AiAppModel } from '../_support/model/ai-app-model';
import { EntitlementAppModel } from '../_support/model/entitlement-app-model';
import { InstanceAppModel } from '../_support/model/instance-app-model';
import { LicenseAppModel } from '../_support/model/license-app-model';
import type { ScenarioCheck } from '../_support/scenario-registry';

/**
 * The AI credits world of the specs, from the same catalogue as `dev:mock`
 * (`_support/fixtures/build-ai-*.ts`): thirteen models, three pools, seven
 * licence versions over four families, rules on every level of the ladder, and
 * the feeds of Acme Production and Globex Production. Dated from a fixed clock.
 */
export const AI_NOW = Date.parse('2026-11-11T09:40:00.000Z');
const PERIOD = {
  currentPeriodEnd: '2026-12-01T00:00:00.000Z',
  currentPeriodStart: '2026-11-01T00:00:00.000Z',
};

const version = (
  family: string,
  name: string,
  n: number,
  lifecycleState: License['lifecycleState'],
  isDefault = false,
  type: License['type'] = 'PAID',
) =>
  buildLicense({
    description: `${name} plan`,
    familyId: `family-${family}`,
    id: `license-${family}-v${n}`,
    isDefault,
    lifecycleState,
    name,
    slug: n === 1 ? family : `${family}-v${n}`,
    type,
    version: String(n),
    versionName: String(2024 + n),
  });

/** The versions the AI catalogue prices, by the slugs it names. */
const aiLicenseVersions = (): License[] => [
  version('trial', 'Trial', 1, 'PUBLISHED', true, 'TRIAL'),
  version('starter', 'Starter', 1, 'ARCHIVED'),
  version('starter', 'Starter', 2, 'PUBLISHED', true),
  version('starter', 'Starter', 3, 'DRAFT'),
  version('business', 'Business', 1, 'PUBLISHED', true),
  version('enterprise', 'Enterprise', 1, 'PUBLISHED'),
  version('enterprise', 'Enterprise', 2, 'PUBLISHED', true),
];

const INSTANCES: Array<
  [slug: string, name: string, customer: string, license: string]
> = [
  ['acme-production', 'Acme Production', 'acme-corp', 'enterprise-v2'],
  ['acme-us', 'Acme US', 'acme-corp', 'enterprise-v2'],
  ['acme-legacy', 'Acme Legacy', 'acme-corp', 'enterprise'],
  ['beta-staging', 'Beta Staging', 'beta-industries', 'trial'],
  ['globex-production', 'Globex Production', 'globex', 'business'],
  ['globex-staging', 'Globex Staging', 'globex', 'starter-v2'],
];

const customers = () =>
  [
    ['acme-corp', 'Acme Corp'],
    ['beta-industries', 'Beta Industries'],
    ['globex', 'Globex'],
  ].map(([slug, name]) =>
    buildCustomer({
      domain: `${slug}.example`,
      id: `customer-${slug}`,
      name,
      slug,
    }),
  );

const instancesOf = (licenses: License[]): Instance[] =>
  INSTANCES.map(([slug, name, customer, licenseSlug]) => {
    const license = licenses.find((item) => item.slug === licenseSlug);
    if (!license) throw new Error(`No licence ${licenseSlug} in the AI world`);
    return {
      createdAt: '2026-03-02T09:00:00.000Z',
      createdBy: TEST_USER,
      customerId: `customer-${customer}`,
      customerSlug: customer,
      description: `${name} environment`,
      endLicenseDate: '2027-03-01T00:00:00.000Z',
      id: `instance-${slug}`,
      licenseId: license.id,
      licenseSlug,
      metadata: {},
      name,
      slug,
      startLicenseDate: '2026-03-01T00:00:00.000Z',
      status: 'HEALTHY',
      updatedAt: '2026-03-02T09:00:00.000Z',
      updatedBy: TEST_USER,
    };
  });

export type AiPlatform = {
  flag: 'on' | 'off';
  /**
   * `large`: fifty-five models over ten vendors and four Enterprise versions,
   * for the rate card at the size of a real catalogue. The two added versions
   * live in the AI area only: the licence pages do not know them.
   */
  catalogue?: 'default' | 'large';
  /** `off`: `License.addonGrants` answers `Billing.Disabled`. */
  billing?: 'on' | 'off';
  /** `<instanceSlug>/<poolSlug>` pairs whose refund is refused with `PoolNotGranted`. */
  poolsNoLongerGranted?: string[];
};

/**
 * Every slot an AI screen reads: the AI area, the pools among the
 * entitlements, the versions and their grants, the instances and their usage,
 * and the platform's answers (`flag: 'off'` turns the capability and the
 * `ai-credits` flag off together).
 */
export function createAiWorldModels(
  {
    flag,
    catalogue = 'default',
    billing = 'on',
    poolsNoLongerGranted,
  }: AiPlatform = { flag: 'on' },
) {
  const large = catalogue === 'large';
  const licenses = aiLicenseVersions();
  const pools = buildAiPools();
  const grants = buildAiGrants(licenses, pools);
  const models = large ? buildLargeAiModels() : buildAiModels();
  const rules = buildAiRules(grants);
  const instances = instancesOf(licenses);
  const largeVersions = large ? buildLargeAiVersions() : [];

  return {
    ai: new AiAppModel({
      addonGrants: buildAiAddonGrants(),
      billingDisabled: billing === 'off',
      grants: [...grants, ...buildLargeAiGrants(largeVersions)],
      inferences: buildAiInferences({
        models,
        now: AI_NOW,
        rules,
        windowStart: PERIOD.currentPeriodStart,
      }),
      licenses: [...licenses, ...largeVersions],
      models,
      pools,
      poolsNoLongerGranted,
      rules: large ? [...rules, ...buildLargeAiRules()] : rules,
    }),
    entitlements: new EntitlementAppModel({ entitlements: pools }),
    instances: new InstanceAppModel({
      customers: customers(),
      entitlementUsagesByInstance: buildAiEntitlementUsages(
        instances,
        grants,
        PERIOD,
      ),
      instances,
      licenseEntitlements: grants,
      licenses,
    }),
    licenses: new LicenseAppModel({ entitlements: pools, grants, licenses }),
    platform: {
      capability: flag === 'on',
      flags: { 'ai-credits': flag === 'on' },
    },
  };
}

export type AiWorldModels = ReturnType<typeof createAiWorldModels>;

/** The AI scenario factories, registered once in `scenario-registry.ts`. */
export const aiScenarioChecks: readonly ScenarioCheck[] = [
  ['ai/createAiWorldModels', createAiWorldModels],
  [
    "ai/createAiWorldModels({ flag: 'off' })",
    () => createAiWorldModels({ flag: 'off' }),
  ],
  [
    "ai/createAiWorldModels({ flag: 'on', catalogue: 'large' })",
    () => createAiWorldModels({ flag: 'on', catalogue: 'large' }),
  ],
  [
    "ai/createAiWorldModels({ flag: 'on', billing: 'off' })",
    () => createAiWorldModels({ flag: 'on', billing: 'off' }),
  ],
  [
    'ai/createAiWorldModels (a pool no longer granted)',
    () =>
      createAiWorldModels({
        flag: 'on',
        poolsNoLongerGranted: ['acme-production/ai-credits'],
      }),
  ],
];
