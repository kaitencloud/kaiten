import type {
  DashboardDayReports,
  DashboardInstanceReports,
  DashboardMeter,
  DashboardSummary,
} from '@/api-client';

const DAY = 86_400_000;

const iso = (now: Date, daysAgo: number, hour = 9): string => {
  const date = new Date(now.getTime() - daysAgo * DAY);
  date.setUTCHours(hour, 12, 0, 0);
  return date.toISOString();
};

const inDays = (now: Date, days: number): string =>
  new Date(now.getTime() + days * DAY).toISOString();

type MeterSeed = Pick<
  DashboardMeter,
  | 'instanceSlug'
  | 'instanceName'
  | 'customerSlug'
  | 'customerName'
  | 'entitlementSlug'
  | 'entitlementName'
  | 'licenseName'
> & {
  used: number;
  granted: number;
  allowancePercent: number;
  licenseState?: DashboardMeter['licenseState'];
  unit?: string;
};

/** A meter the way the API computes one: the grant plus its allowance is the most a report is accepted up to. */
export const meter = (seed: MeterSeed): DashboardMeter => {
  const max =
    seed.allowancePercent < 0
      ? null
      : seed.allowancePercent === 0
        ? seed.granted
        : seed.granted * (1 + seed.allowancePercent / 100);
  const reference = max ?? seed.granted;
  const ratio = reference > 0 ? seed.used / reference : null;
  const limitReached = max !== null && seed.used >= max;
  return {
    instanceSlug: seed.instanceSlug,
    instanceName: seed.instanceName,
    customerSlug: seed.customerSlug,
    customerName: seed.customerName,
    entitlementSlug: seed.entitlementSlug,
    entitlementName: seed.entitlementName,
    unit: seed.unit ?? null,
    licenseName: seed.licenseName,
    licenseState: seed.licenseState ?? 'PUBLISHED',
    used: seed.used,
    granted: seed.granted,
    maxAllowed: max,
    allowancePercent: seed.allowancePercent,
    ratio,
    warningThresholdPercent: 80,
    limitReached,
    hardLimit: seed.allowancePercent === 0,
    aboveWarning: !limitReached && ratio !== null && ratio * 100 >= 80,
    windowStart: null,
  };
};

/** The start of the first of the last `days` calendar days, today last. */
export const firstDay = (now: Date, days: number): string => {
  const day = new Date(now.getTime() - (days - 1) * DAY);
  day.setUTCHours(0, 0, 0, 0);
  return day.toISOString();
};

const perDay = (
  now: Date,
  days: number,
  accepted: number[],
  rejected: number[],
): DashboardDayReports[] =>
  Array.from({ length: days }, (_, index) => {
    const day = new Date(now.getTime() - (days - 1 - index) * DAY);
    day.setUTCHours(0, 0, 0, 0);
    return {
      day: day.toISOString(),
      accepted: accepted[index % accepted.length] ?? 0,
      rejected: rejected[index] ?? 0,
    };
  });

const instanceReports = (
  now: Date,
  seed: Pick<
    DashboardInstanceReports,
    | 'instanceSlug'
    | 'instanceName'
    | 'customerSlug'
    | 'customerName'
    | 'licenseName'
  > & {
    licenseState?: DashboardInstanceReports['licenseState'];
    accepted: number;
    rejected?: number;
    rejected24h?: number;
    lastReportDaysAgo?: number | null;
    lastReadDaysAgo?: number | null;
  },
): DashboardInstanceReports => ({
  instanceSlug: seed.instanceSlug,
  instanceName: seed.instanceName,
  customerSlug: seed.customerSlug,
  customerName: seed.customerName,
  licenseName: seed.licenseName,
  licenseState: seed.licenseState ?? 'PUBLISHED',
  accepted: seed.accepted,
  rejected: seed.rejected ?? 0,
  rejected24h: seed.rejected24h ?? 0,
  lastReportAt:
    seed.lastReportDaysAgo === null || seed.lastReportDaysAgo === undefined
      ? null
      : iso(now, seed.lastReportDaysAgo),
  lastReadAt:
    seed.lastReadDaysAgo === null || seed.lastReadDaysAgo === undefined
      ? null
      : iso(now, seed.lastReadDaysAgo),
  silent:
    (seed.lastReportDaysAgo ?? null) === null &&
    (seed.lastReadDaysAgo ?? null) === null,
  standing: 'healthy',
});

// The standing of an instance, the way the API decides it over every meter of
// the instance: a meter at its limit before one above its threshold, the higher
// ratio first; silent when nothing reported or read; healthy otherwise.
const meterState = (m: DashboardMeter) =>
  m.limitReached ? 2 : m.aboveWarning ? 1 : 0;
const worse = (a: DashboardMeter, b: DashboardMeter) =>
  meterState(a) - meterState(b) || (a.ratio ?? -1) - (b.ratio ?? -1);

export function withStandings(
  rows: DashboardInstanceReports[],
  meters: DashboardMeter[],
): DashboardInstanceReports[] {
  return rows.map((row) => {
    const headline = meters
      .filter((m) => m.instanceSlug === row.instanceSlug)
      .sort((a, b) => worse(b, a))[0];
    const standing = headline?.limitReached
      ? 'atLimit'
      : headline?.aboveWarning
        ? 'watch'
        : row.silent
          ? 'silent'
          : 'healthy';
    return { ...row, standing, headline };
  });
}

export function countStandings(rows: DashboardInstanceReports[]) {
  const counts = { atLimit: 0, watch: 0, silent: 0, healthy: 0 };
  for (const row of rows) {
    counts[row.standing] += 1;
  }
  return counts;
}

export type DashboardSummaryOptions = {
  now?: Date;
  range?: DashboardSummary['range']['range'];
};

/**
 * The summary of the Kaiten Sushi Shop dataset the docs tour: four customers,
 * six instances, two at a hard limit, seven refused reports, one archived
 * version, one silent demo. Every check of the attention card has something to
 * say, which is what the specs and the stories look for.
 */
export function buildDashboardSummary(
  options: DashboardSummaryOptions = {},
): DashboardSummary {
  const now = options.now ?? new Date();
  const range = options.range ?? '30d';
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;

  const ninjaMenu = meter({
    instanceSlug: 'ninja-osaka-prod',
    instanceName: 'Ninja Osaka Production',
    customerSlug: 'ninja-osaka',
    customerName: 'Ninja Osaka',
    entitlementSlug: 'menu-items',
    entitlementName: 'Menu Items',
    unit: 'items',
    licenseName: 'Starter',
    used: 5,
    granted: 5,
    allowancePercent: 0,
  });
  const ninjaLocations = meter({
    instanceSlug: 'ninja-osaka-prod',
    instanceName: 'Ninja Osaka Production',
    customerSlug: 'ninja-osaka',
    customerName: 'Ninja Osaka',
    entitlementSlug: 'locations',
    entitlementName: 'Locations',
    unit: 'locations',
    licenseName: 'Starter',
    used: 1,
    granted: 1,
    allowancePercent: 0,
  });
  const kappaDrivers = meter({
    instanceSlug: 'kappa-kyoto-prod',
    instanceName: 'Kappa Kyoto Production',
    customerSlug: 'kappa-kyoto',
    customerName: 'Kappa Kyoto',
    entitlementSlug: 'delivery-drivers',
    entitlementName: 'Delivery Drivers',
    unit: 'drivers',
    licenseName: 'Premium v1',
    licenseState: 'ARCHIVED',
    used: 6,
    granted: 5,
    allowancePercent: 20,
  });
  const ninjaOrders = meter({
    instanceSlug: 'ninja-osaka-prod',
    instanceName: 'Ninja Osaka Production',
    customerSlug: 'ninja-osaka',
    customerName: 'Ninja Osaka',
    entitlementSlug: 'monthly-orders',
    entitlementName: 'Monthly Orders',
    unit: 'orders',
    licenseName: 'Starter',
    used: 18,
    granted: 20,
    allowancePercent: 0,
  });
  const sakuraMenu = meter({
    instanceSlug: 'sakura-tokyo-prod',
    instanceName: 'Sakura Tokyo Production',
    customerSlug: 'sakura-tokyo',
    customerName: 'Sakura Tokyo',
    entitlementSlug: 'menu-items',
    entitlementName: 'Menu Items',
    unit: 'items',
    licenseName: 'Premium v2',
    used: 50,
    granted: 50,
    allowancePercent: 20,
  });
  const demoOrders = meter({
    instanceSlug: 'demo-restaurant-prod',
    instanceName: 'Demo Restaurant Production',
    customerSlug: 'demo-restaurant',
    customerName: 'Demo Restaurant',
    entitlementSlug: 'monthly-orders',
    entitlementName: 'Monthly Orders',
    unit: 'orders',
    licenseName: 'Standard v1',
    used: 90,
    granted: 100,
    allowancePercent: 10,
  });
  const sakuraDrivers = meter({
    instanceSlug: 'sakura-tokyo-prod',
    instanceName: 'Sakura Tokyo Production',
    customerSlug: 'sakura-tokyo',
    customerName: 'Sakura Tokyo',
    entitlementSlug: 'delivery-drivers',
    entitlementName: 'Delivery Drivers',
    unit: 'drivers',
    licenseName: 'Premium v2',
    used: 7,
    granted: 10,
    allowancePercent: 20,
  });
  const saturation = [
    ninjaMenu,
    kappaDrivers,
    ninjaLocations,
    ninjaOrders,
    sakuraMenu,
    demoOrders,
    sakuraDrivers,
  ];

  const byInstance = withStandings(
    [
      instanceReports(now, {
        instanceSlug: 'ninja-osaka-prod',
        instanceName: 'Ninja Osaka Production',
        customerSlug: 'ninja-osaka',
        customerName: 'Ninja Osaka',
        licenseName: 'Starter',
        accepted: 474,
        rejected: 7,
        rejected24h: 7,
        lastReportDaysAgo: 0,
        lastReadDaysAgo: 0,
      }),
      instanceReports(now, {
        instanceSlug: 'sakura-tokyo-prod',
        instanceName: 'Sakura Tokyo Production',
        customerSlug: 'sakura-tokyo',
        customerName: 'Sakura Tokyo',
        licenseName: 'Premium v2',
        accepted: 381,
        lastReportDaysAgo: 0,
        lastReadDaysAgo: 0,
      }),
      instanceReports(now, {
        instanceSlug: 'demo-restaurant-prod',
        instanceName: 'Demo Restaurant Production',
        customerSlug: 'demo-restaurant',
        customerName: 'Demo Restaurant',
        licenseName: 'Standard v1',
        accepted: 203,
        lastReportDaysAgo: 0,
        lastReadDaysAgo: 1,
      }),
      instanceReports(now, {
        instanceSlug: 'kappa-kyoto-prod',
        instanceName: 'Kappa Kyoto Production',
        customerSlug: 'kappa-kyoto',
        customerName: 'Kappa Kyoto',
        licenseName: 'Premium v1',
        licenseState: 'ARCHIVED',
        accepted: 92,
        lastReportDaysAgo: 1,
        lastReadDaysAgo: 1,
      }),
      instanceReports(now, {
        instanceSlug: 'ninja-osaka-pilot',
        instanceName: 'Ninja Osaka Delivery Pilot',
        customerSlug: 'ninja-osaka',
        customerName: 'Ninja Osaka',
        licenseName: 'Standard v2',
        accepted: 7,
        lastReportDaysAgo: 1,
        lastReadDaysAgo: 2,
      }),
      instanceReports(now, {
        instanceSlug: 'sakura-tokyo-demo',
        instanceName: 'Sakura Tokyo Sales Demo',
        customerSlug: 'sakura-tokyo',
        customerName: 'Sakura Tokyo',
        licenseName: 'Starter',
        accepted: 0,
        lastReportDaysAgo: null,
        lastReadDaysAgo: null,
      }),
    ],
    saturation,
  );
  const accepted = [
    38, 41, 35, 44, 52, 19, 12, 40, 43, 39, 47, 55, 21, 14, 42, 45, 40, 49, 58,
    22, 15, 44, 47, 43, 51, 60, 24, 16, 46, 48,
  ];
  const rejected = Array.from({ length: days }, (_, index) =>
    index === days - 1 ? 5 : index === days - 2 ? 2 : 0,
  );
  const silent = byInstance.filter((row) => row.silent);

  return {
    asOf: now.toISOString(),
    range: {
      range,
      from: new Date(now.getTime() - days * DAY).toISOString(),
      to: now.toISOString(),
      days,
      usageHistoryFrom: firstDay(now, days),
      usageHistoryDays: days,
      auditTrailFrom: firstDay(now, days),
      auditTrailDays: days,
    },
    attention: {
      limitsReached: { count: 2, items: [ninjaMenu, ninjaLocations] },
      nearThreshold: { count: 3, items: [ninjaOrders, sakuraMenu, demoOrders] },
      rejectedReports24h: { count: 7, items: [byInstance[0]] },
      silentInstances: {
        count: silent.length,
        items: silent.map((row) => ({
          instanceSlug: row.instanceSlug,
          instanceName: row.instanceName,
          customerSlug: row.customerSlug,
          customerName: row.customerName,
          lastActivityAt: null,
        })),
      },
      instancesNotHealthy: { count: 0, items: [] },
      licensesEnding30d: {
        count: 1,
        items: [
          {
            instanceSlug: 'sakura-tokyo-demo',
            instanceName: 'Sakura Tokyo Sales Demo',
            customerSlug: 'sakura-tokyo',
            customerName: 'Sakura Tokyo',
            licenseName: 'Starter',
            endsAt: inDays(now, 21),
            billingStatus: null,
            cancelAtPeriodEnd: false,
          },
        ],
      },
      archivedVersions: {
        count: 1,
        items: [
          {
            instanceSlug: 'kappa-kyoto-prod',
            instanceName: 'Kappa Kyoto Production',
            customerSlug: 'kappa-kyoto',
            customerName: 'Kappa Kyoto',
            licenseName: 'Premium v1',
            version: 1,
            familySlug: 'premium',
            defaultLicenseName: 'Premium v2',
          },
        ],
      },
      tokensExpiring30d: {
        count: 1,
        items: [
          {
            name: 'storefront',
            slug: 'sdk-storefront',
            serviceAccountSlug: 'sdk',
            serviceAccountName: 'SDK',
            expiresAt: inDays(now, 12),
          },
        ],
      },
      zonesBehind: {
        count: 1,
        items: [
          {
            slug: 'us-east-1',
            name: 'us-east-1',
            type: 'production',
            releaseVersion: '2026.7.0',
            deployedAt: iso(now, 41),
            deployedBy: 'Ops Team',
            instances: 2,
            releasesBehind: 1,
          },
        ],
      },
      checked: [
        'instancesNotHealthy',
        'limitsReached',
        'nearThreshold',
        'rejectedReports24h',
        'silentInstances',
        'licensesEnding30d',
        'archivedVersions',
        'zonesBehind',
        'tokensExpiring30d',
      ],
    },
    figures: {
      customers: { total: 4, createdInRange: 1 },
      instances: {
        total: 6,
        createdInRange: 1,
        activeInRange: 5,
        silentInRange: 1,
        byStatus: { HEALTHY: 6, DEGRADED: 0, INCIDENT: 0, MAINTENANCE: 0 },
        byStanding: countStandings(byInstance),
      },
      usageReports: { accepted: 1157, rejected: 7, rejected24h: 7 },
    },
    saturation,
    usageReports: { perDay: perDay(now, days, accepted, rejected), byInstance },
    featureFlags: {
      total: 7,
      enabled: 6,
      evaluations: 42_913,
      notEvaluated: 2,
      perFlag: [
        {
          slug: 'delivery-tracking-enabled',
          name: 'Delivery Tracking Enabled',
          enabled: true,
          evaluations: 18_204,
        },
        {
          slug: 'analytics-dashboard-enabled',
          name: 'Analytics Dashboard Enabled',
          enabled: true,
          evaluations: 12_010,
        },
        {
          slug: 'new-ordering-flow',
          name: 'New Ordering Flow',
          enabled: true,
          evaluations: 8_132,
        },
        {
          slug: 'promo-banner',
          name: 'Promo Banner',
          enabled: true,
          evaluations: 3_877,
        },
        {
          slug: 'discount-campaign',
          name: 'Discount Campaign',
          enabled: true,
          evaluations: 690,
        },
        {
          slug: 'random-discount',
          name: 'Random Discount',
          enabled: true,
          evaluations: 0,
        },
        {
          slug: 'loyalty-offer',
          name: 'Loyalty Offer',
          enabled: false,
          evaluations: 0,
        },
      ],
    },
    licenses: {
      mix: [
        {
          familySlug: 'starter',
          instances: 2,
          versions: [
            {
              slug: 'starter',
              name: 'Starter',
              version: 1,
              lifecycleState: 'PUBLISHED',
              isDefault: true,
              instances: 2,
            },
          ],
        },
        {
          familySlug: 'standard',
          instances: 2,
          versions: [
            {
              slug: 'standard',
              name: 'Standard v1',
              version: 1,
              lifecycleState: 'PUBLISHED',
              isDefault: true,
              instances: 1,
            },
            {
              slug: 'standard-v2',
              name: 'Standard v2',
              version: 2,
              lifecycleState: 'PUBLISHED',
              isDefault: false,
              instances: 1,
            },
          ],
        },
        {
          familySlug: 'premium',
          instances: 2,
          versions: [
            {
              slug: 'premium',
              name: 'Premium v1',
              version: 1,
              lifecycleState: 'ARCHIVED',
              isDefault: false,
              instances: 1,
            },
            {
              slug: 'premium-v2',
              name: 'Premium v2',
              version: 2,
              lifecycleState: 'PUBLISHED',
              isDefault: true,
              instances: 1,
            },
            {
              slug: 'premium-v3',
              name: 'Premium v3',
              version: 3,
              lifecycleState: 'DRAFT',
              isDefault: false,
              instances: 0,
            },
          ],
        },
      ],
      ending: {
        within30Days: 1,
        within180Days: 4,
        items: [
          {
            instanceSlug: 'sakura-tokyo-demo',
            instanceName: 'Sakura Tokyo Sales Demo',
            customerSlug: 'sakura-tokyo',
            customerName: 'Sakura Tokyo',
            licenseName: 'Starter',
            endsAt: inDays(now, 21),
            billingStatus: null,
            cancelAtPeriodEnd: false,
          },
          {
            instanceSlug: 'demo-restaurant-prod',
            instanceName: 'Demo Restaurant Production',
            customerSlug: 'demo-restaurant',
            customerName: 'Demo Restaurant',
            licenseName: 'Standard v1',
            endsAt: inDays(now, 74),
            billingStatus: 'ACTIVE',
            cancelAtPeriodEnd: false,
          },
          {
            instanceSlug: 'ninja-osaka-pilot',
            instanceName: 'Ninja Osaka Delivery Pilot',
            customerSlug: 'ninja-osaka',
            customerName: 'Ninja Osaka',
            licenseName: 'Standard v2',
            endsAt: inDays(now, 92),
            billingStatus: 'TRIAL',
            cancelAtPeriodEnd: false,
          },
          {
            instanceSlug: 'kappa-kyoto-prod',
            instanceName: 'Kappa Kyoto Production',
            customerSlug: 'kappa-kyoto',
            customerName: 'Kappa Kyoto',
            licenseName: 'Premium v1',
            endsAt: inDays(now, 118),
            billingStatus: 'ACTIVE',
            cancelAtPeriodEnd: false,
          },
        ],
      },
      archived: [
        {
          instanceSlug: 'kappa-kyoto-prod',
          instanceName: 'Kappa Kyoto Production',
          customerSlug: 'kappa-kyoto',
          customerName: 'Kappa Kyoto',
          licenseName: 'Premium v1',
          version: 1,
          familySlug: 'premium',
          defaultLicenseName: 'Premium v2',
        },
      ],
    },
    zones: [
      {
        slug: 'eu-west-1',
        name: 'eu-west-1',
        type: 'production',
        releaseVersion: '2026.8.0',
        deployedAt: iso(now, 3),
        deployedBy: 'Ops Team',
        instances: 3,
        releasesBehind: 0,
      },
      {
        slug: 'us-east-1',
        name: 'us-east-1',
        type: 'production',
        releaseVersion: '2026.7.0',
        deployedAt: iso(now, 41),
        deployedBy: 'Ops Team',
        instances: 2,
        releasesBehind: 1,
      },
      {
        slug: 'sandbox',
        name: 'sandbox',
        type: 'staging',
        releaseVersion: '2026.8.0',
        deployedAt: iso(now, 3),
        deployedBy: 'release workflow',
        instances: 1,
        releasesBehind: 0,
      },
    ],
    integrations: {
      tokens: {
        serviceAccounts: 2,
        activeTokens: 2,
        tokensExpiring30Days: 1,
        tokensWithoutExpiry: 1,
        tokensExpiring: [
          {
            name: 'storefront',
            slug: 'sdk-storefront',
            serviceAccountSlug: 'sdk',
            serviceAccountName: 'SDK',
            expiresAt: inDays(now, 12),
          },
        ],
      },
      publishableKeys: { count: 1, lastUsedAt: iso(now, 0, 7) },
      connectors: {
        items: [
          { name: 'stripe', activated: true, activatedAt: iso(now, 20) },
          { name: 'attio', activated: false, activatedAt: null },
        ],
      },
    },
    billing: {
      subscriptions: { active: 3, trial: 1, pastDue: 1, canceled: 0 },
      invoicedThisMonth: [
        {
          currency: 'EUR',
          invoices: 4,
          totalMinor: 107_800,
          paid: 3,
          overdue: 1,
        },
      ],
    },
  };
}

/** The same organization on a quiet day: every check ran and found nothing. */
export function buildCalmDashboardSummary(
  options: DashboardSummaryOptions = {},
): DashboardSummary {
  const busy = buildDashboardSummary(options);
  const none = { count: 0, items: [] };
  const calmMeters = busy.saturation.filter(
    (row) => !row.limitReached && !row.aboveWarning,
  );
  return {
    ...busy,
    attention: {
      limitsReached: none,
      nearThreshold: none,
      rejectedReports24h: none,
      silentInstances: none,
      instancesNotHealthy: none,
      licensesEnding30d: none,
      archivedVersions: none,
      tokensExpiring30d: none,
      zonesBehind: none,
      checked: busy.attention.checked,
    },
    figures: {
      ...busy.figures,
      instances: {
        ...busy.figures.instances,
        activeInRange: 6,
        silentInRange: 0,
        byStanding: { atLimit: 0, watch: 0, silent: 0, healthy: 6 },
      },
      usageReports: { accepted: 1157, rejected: 0, rejected24h: 0 },
    },
    saturation: calmMeters,
    usageReports: {
      perDay: busy.usageReports.perDay.map((day) => ({ ...day, rejected: 0 })),
      byInstance: withStandings(
        busy.usageReports.byInstance.map((row) => ({
          ...row,
          rejected: 0,
          rejected24h: 0,
          silent: false,
          lastReportAt: row.lastReportAt ?? busy.asOf,
          lastReadAt: row.lastReadAt ?? busy.asOf,
        })),
        calmMeters,
      ),
    },
    licenses: {
      ...busy.licenses,
      archived: [],
      ending: {
        within30Days: 0,
        within180Days: 3,
        items: busy.licenses.ending.items.slice(1),
      },
    },
    zones: busy.zones.map((zone) => ({ ...zone, releasesBehind: 0 })),
    integrations: {
      ...busy.integrations,
      tokens: busy.integrations?.tokens
        ? {
            ...busy.integrations.tokens,
            tokensExpiring30Days: 0,
            tokensExpiring: [],
          }
        : undefined,
    },
    billing: busy.billing
      ? {
          ...busy.billing,
          subscriptions: { ...busy.billing.subscriptions, pastDue: 0 },
          invoicedThisMonth: [
            {
              currency: 'EUR',
              invoices: 4,
              totalMinor: 107_800,
              paid: 4,
              overdue: 0,
            },
          ],
        }
      : undefined,
  };
}

/** A brand-new organization: nothing recorded yet, every block empty. */
export function buildEmptyDashboardSummary(
  options: DashboardSummaryOptions = {},
): DashboardSummary {
  const calm = buildCalmDashboardSummary(options);
  return {
    ...calm,
    figures: {
      customers: { total: 0, createdInRange: 0 },
      instances: {
        total: 0,
        createdInRange: 0,
        activeInRange: 0,
        silentInRange: 0,
        byStatus: { HEALTHY: 0, DEGRADED: 0, INCIDENT: 0, MAINTENANCE: 0 },
        byStanding: { atLimit: 0, watch: 0, silent: 0, healthy: 0 },
      },
      usageReports: { accepted: 0, rejected: 0, rejected24h: 0 },
    },
    saturation: [],
    usageReports: {
      perDay: calm.usageReports.perDay.map((day) => ({ ...day, accepted: 0 })),
      byInstance: [],
    },
    featureFlags: {
      total: 0,
      enabled: 0,
      evaluations: 0,
      notEvaluated: 0,
      perFlag: [],
    },
    licenses: {
      mix: [],
      ending: { within30Days: 0, within180Days: 0, items: [] },
      archived: [],
    },
    zones: [],
    integrations: {
      tokens: {
        serviceAccounts: 0,
        activeTokens: 0,
        tokensExpiring30Days: 0,
        tokensWithoutExpiry: 0,
        tokensExpiring: [],
      },
      publishableKeys: { count: 0, lastUsedAt: null },
      connectors: { items: [] },
    },
    billing: undefined,
  };
}
