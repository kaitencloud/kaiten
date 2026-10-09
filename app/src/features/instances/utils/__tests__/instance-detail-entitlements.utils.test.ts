import { describe, expect, it } from 'vite-plus/test';
import {
  buildEntitlementsRows,
  getEntitlementsMetrics,
  isEntitlementEnabled,
  isEntitlementExhausted,
  isEntitlementNearThreshold,
  isSoftLimitEntitlement,
  type InstanceEntitlementRow,
} from '../instance-detail-entitlements.utils';

const createEntitlement = (
  partial: Partial<InstanceEntitlementRow>,
): InstanceEntitlementRow => ({
  entitlementId: 'ent-1',
  entitlementGroups: [],
  entitlementName: 'API Calls',
  entitlementSlug: 'api-calls',
  entitlementType: 'NUMBER',
  catalogueEntitlementType: 'NUMBER',
  value: 0,
  threshold: 100,
  limitCapExceededOveragePercent: 0,
  enabled: true,
  ...partial,
});

// 100 granted with 20% overage: the API keeps accepting usage up to 120.
const createSoftLimitEntitlement = (partial: Partial<InstanceEntitlementRow>) =>
  createEntitlement({ limitCapExceededOveragePercent: 20, ...partial });

describe('instance-detail-entitlements utils', () => {
  // The grant's own type has no AI-credit variant, so the row keeps what the
  // catalogue calls it for the label, while enforcement stays on NUMBER.
  it('keeps what the catalogue calls an AI-credit grant', () => {
    const rows = buildEntitlementsRows(
      [
        {
          entitlementName: 'AI Credits',
          entitlementSlug: 'ai-credits',
          entitlementType: 'NUMBER',
          value: { type: 'number', value: 1000 },
        },
      ] as never,
      [],
      'Unknown',
      [
        {
          id: 'ent-ai',
          name: 'AI Credits',
          slug: 'ai-credits',
          type: 'NUMBER_AI_CREDIT',
        },
      ] as never,
    );

    expect(rows[0]).toMatchObject({
      catalogueEntitlementType: 'NUMBER_AI_CREDIT',
      entitlementType: 'NUMBER',
    });
  });

  // An add-on adds to what the license grants, and the API composes the cap the
  // usage is measured against: it is the one the row shows.
  describe('threshold', () => {
    const grant = [
      {
        entitlementName: 'Seats',
        entitlementSlug: 'seats',
        entitlementType: 'NUMBER',
        value: { type: 'number', value: 10 },
      },
    ] as never;
    const usage = (limit?: unknown) =>
      [
        {
          entitlementId: 'ent-seats',
          entitlementSlug: 'seats',
          limit,
          value: { type: 'number', value: 4 },
        },
      ] as never;

    it('is the limit the usage is measured against, with the add-ons the instance holds', () => {
      const [row] = buildEntitlementsRows(
        grant,
        usage({ type: 'number', value: 20 }),
        'Unknown',
      );

      expect(row?.threshold).toBe(20);
      expect(row?.value).toBe(4);
    });

    it('is the grant of the license when the usage carries no limit', () => {
      const [row] = buildEntitlementsRows(grant, usage(), 'Unknown');

      expect(row?.threshold).toBe(10);
    });

    it('is unlimited when the limit is', () => {
      const [row] = buildEntitlementsRows(
        grant,
        usage({ type: 'number', value: -1 }),
        'Unknown',
      );

      expect(row?.threshold).toBe(-1);
    });

    it('stays unset for a grant that is not a number, whatever the limit says', () => {
      const [row] = buildEntitlementsRows(
        [
          {
            entitlementName: 'Analytics',
            entitlementSlug: 'analytics',
            entitlementType: 'BOOLEAN',
            value: { type: 'boolean', value: true },
          },
        ] as never,
        [
          {
            entitlementId: 'ent-analytics',
            entitlementSlug: 'analytics',
            limit: { type: 'boolean', value: true },
            value: { type: 'boolean', value: true },
          },
        ] as never,
        'Unknown',
      );

      expect(row?.threshold).toBeNull();
      expect(row?.enabled).toBe(true);
    });
  });

  it('leaves the catalogue type unset when the entitlement is unknown', () => {
    const rows = buildEntitlementsRows(
      [
        {
          entitlementName: 'Seats',
          entitlementSlug: 'seats',
          entitlementType: 'NUMBER',
          value: { type: 'number', value: 10 },
        },
      ] as never,
      [],
      'Unknown',
    );

    expect(rows[0].catalogueEntitlementType).toBeNull();
  });

  it('returns enabled count as total when quota is not reached', () => {
    const rows: InstanceEntitlementRow[] = [
      createEntitlement({ entitlementId: 'ent-1', value: 40, threshold: 100 }),
      createEntitlement({ entitlementId: 'ent-2', value: 0, threshold: 100 }),
      createEntitlement({
        entitlementId: 'ent-3',
        entitlementType: 'BOOLEAN',
        threshold: null,
      }),
    ];

    expect(getEntitlementsMetrics(rows).enabled).toBe(3);
  });

  it('marks only exhausted number entitlements as disabled', () => {
    expect(
      isEntitlementEnabled(createEntitlement({ value: 100, threshold: 100 })),
    ).toBe(false);
    expect(
      isEntitlementEnabled(createEntitlement({ value: 99, threshold: 100 })),
    ).toBe(true);
  });

  // The cards used to count anything past 25%, so a row badged Healthy or
  // Watch still raised a usage alert. They now count what the badge flags.
  it('counts as near threshold what the status badges near the limit', () => {
    expect(isEntitlementNearThreshold(createEntitlement({ value: 30 }))).toBe(
      false,
    );
    expect(isEntitlementNearThreshold(createEntitlement({ value: 79 }))).toBe(
      false,
    );
    expect(isEntitlementNearThreshold(createEntitlement({ value: 80 }))).toBe(
      true,
    );
    expect(isEntitlementNearThreshold(createEntitlement({ value: 99 }))).toBe(
      true,
    );
    // On the wall the grant is spent, badged as reached rather than near.
    expect(isEntitlementNearThreshold(createEntitlement({ value: 100 }))).toBe(
      false,
    );
    expect(isEntitlementNearThreshold(createEntitlement({ value: 101 }))).toBe(
      false,
    );
  });

  it('counts the counters on their wall or past it as limit reached', () => {
    const metrics = getEntitlementsMetrics([
      createEntitlement({ entitlementId: 'near', value: 90 }),
      createEntitlement({ entitlementId: 'on-wall', value: 100 }),
      createEntitlement({ entitlementId: 'past-wall', value: 101 }),
      createSoftLimitEntitlement({ entitlementId: 'allowance', value: 110 }),
      createSoftLimitEntitlement({ entitlementId: 'soft-wall', value: 120 }),
      createEntitlement({
        entitlementId: 'flag',
        entitlementType: 'BOOLEAN',
        threshold: null,
        value: 1,
      }),
    ]);

    expect(metrics.nearThreshold).toBe(2);
    expect(metrics.limitReached).toBe(3);
  });

  describe('near-threshold scope split', () => {
    it('splits the near-threshold count by counter scope', () => {
      const rows: InstanceEntitlementRow[] = [
        createEntitlement({ entitlementId: 'lifetime-near', value: 90 }),
        createEntitlement({
          entitlementId: 'periodic-near',
          value: 90,
          currentPeriodStart: '2026-03-01T00:00:00.000Z',
          currentPeriodEnd: '2026-04-01T00:00:00.000Z',
        }),
        createEntitlement({ entitlementId: 'lifetime-idle', value: 1 }),
      ];
      const metrics = getEntitlementsMetrics(rows);

      expect(metrics.nearThreshold).toBe(2);
      expect(metrics.nearThresholdCurrentPeriod).toBe(1);
      expect(metrics.nearThresholdLifetime).toBe(1);
    });

    it('counts a counter with no window bounds as lifetime', () => {
      const metrics = getEntitlementsMetrics([
        createEntitlement({ value: 90 }),
      ]);

      expect(metrics.nearThresholdCurrentPeriod).toBe(0);
      expect(metrics.nearThresholdLifetime).toBe(1);
    });
  });

  describe('CONFIG type', () => {
    it('is never near threshold', () => {
      expect(
        isEntitlementNearThreshold(
          createEntitlement({ entitlementType: 'CONFIG', threshold: null }),
        ),
      ).toBe(false);
    });

    it('is always considered enabled', () => {
      expect(
        isEntitlementEnabled(
          createEntitlement({ entitlementType: 'CONFIG', threshold: null }),
        ),
      ).toBe(true);
    });

    it('is excluded from numberEntitlements metrics', () => {
      const rows: InstanceEntitlementRow[] = [
        createEntitlement({ entitlementId: 'ent-1' }),
        createEntitlement({ entitlementId: 'ent-2', entitlementType: 'CONFIG', threshold: null }),
        createEntitlement({ entitlementId: 'ent-3', entitlementType: 'BOOLEAN', threshold: null }),
      ];
      const metrics = getEntitlementsMetrics(rows);
      expect(metrics.numberEntitlements).toHaveLength(1);
      expect(metrics.numberEntitlements[0].entitlementId).toBe('ent-1');
    });
  });

  // The ceiling arithmetic itself is covered by the domain that owns it
  // (src/domains/entitlement-usage); these cases pin what a row adds on top.
  describe('soft limits', () => {
    // The regression this whole change exists for: at exactly the granted
    // value a soft limit still has room, so the tab must not call it spent.
    it('is not exhausted at the granted value', () => {
      expect(
        isEntitlementExhausted(createSoftLimitEntitlement({ value: 100 })),
      ).toBe(false);
      expect(
        isEntitlementEnabled(createSoftLimitEntitlement({ value: 100 })),
      ).toBe(true);
    });

    it('is exhausted once usage reaches the stretched ceiling', () => {
      expect(
        isEntitlementExhausted(createSoftLimitEntitlement({ value: 120 })),
      ).toBe(true);
    });

    it('flags the grant and its overage as near, not the wall', () => {
      expect(
        isEntitlementNearThreshold(createSoftLimitEntitlement({ value: 100 })),
      ).toBe(true);
      expect(
        isEntitlementNearThreshold(createSoftLimitEntitlement({ value: 110 })),
      ).toBe(true);
      expect(
        isEntitlementNearThreshold(createSoftLimitEntitlement({ value: 120 })),
      ).toBe(false);
    });

    it('counts a soft-limited row as enabled in the metrics', () => {
      const metrics = getEntitlementsMetrics([
        createSoftLimitEntitlement({ entitlementId: 'soft', value: 100 }),
        createEntitlement({ entitlementId: 'hard', value: 100 }),
      ]);

      expect(metrics.enabled).toBe(1);
      expect(metrics.nearThreshold).toBe(1);
    });

    it('recognises only a positive percent on a capped number row', () => {
      expect(
        isSoftLimitEntitlement(createSoftLimitEntitlement({ value: 10 })),
      ).toBe(true);
      expect(isSoftLimitEntitlement(createEntitlement({ value: 10 }))).toBe(
        false,
      );
      expect(
        isSoftLimitEntitlement(
          createEntitlement({
            threshold: -1,
            limitCapExceededOveragePercent: -1,
          }),
        ),
      ).toBe(false);
      expect(
        isSoftLimitEntitlement(
          createEntitlement({
            entitlementType: 'BOOLEAN',
            threshold: null,
            limitCapExceededOveragePercent: null,
          }),
        ),
      ).toBe(false);
    });
  });

  describe('buildEntitlementsRows', () => {
    it('maps CONFIG entitlement type correctly', () => {
      const licenseEntitlements = [
        {
          entitlementName: 'Feature Config',
          entitlementSlug: 'feature-config',
          entitlementType: 'CONFIG',
          threshold: null,
          enabled: null,
        },
      ] as any;

      const rows = buildEntitlementsRows(licenseEntitlements, [], 'Unknown');
      expect(rows[0].entitlementType).toBe('CONFIG');
      expect(rows[0].entitlementSlug).toBe('feature-config');
      expect(rows[0].threshold).toBeNull();
    });

    it('falls back to BOOLEAN when entitlement type is unknown', () => {
      const licenseEntitlements = [
        {
          entitlementName: 'Unknown Feature',
          entitlementSlug: 'unknown-feature',
          entitlementType: undefined,
          threshold: null,
          enabled: true,
        },
      ] as any;

      const rows = buildEntitlementsRows(licenseEntitlements, [], 'Unknown');
      expect(rows[0].entitlementType).toBe('BOOLEAN');
      expect(rows[0].entitlementSlug).toBe('unknown-feature');
    });

    // A periodic entitlement's value only means something next to the window
    // it was counted in, so the bounds have to survive the join.
    it('carries the usage window bounds onto the matched row', () => {
      const rows = buildEntitlementsRows(
        [
          {
            entitlementName: 'API Calls',
            entitlementSlug: 'api-calls',
            entitlementType: 'NUMBER',
            value: { type: 'number', value: 100 },
          },
        ] as any,
        [
          {
            entitlementId: 'ent-api-calls',
            entitlementSlug: 'api-calls',
            value: { type: 'number', value: 42 },
            currentPeriodStart: '2026-03-01T00:00:00.000Z',
            currentPeriodEnd: '2026-04-01T00:00:00.000Z',
          },
        ] as any,
        'Unknown',
      );

      expect(rows[0].currentPeriodStart).toBe('2026-03-01T00:00:00.000Z');
      expect(rows[0].currentPeriodEnd).toBe('2026-04-01T00:00:00.000Z');
    });

    it('leaves the window bounds null for a lifetime counter', () => {
      const rows = buildEntitlementsRows(
        [
          {
            entitlementName: 'Seats',
            entitlementSlug: 'seats',
            entitlementType: 'NUMBER',
            value: { type: 'number', value: 10 },
          },
        ] as any,
        [
          {
            entitlementId: 'ent-seats',
            entitlementSlug: 'seats',
            value: { type: 'number', value: 4 },
          },
        ] as any,
        'Unknown',
      );

      expect(rows[0].currentPeriodStart).toBeNull();
      expect(rows[0].currentPeriodEnd).toBeNull();
    });

    // The usage-only branch synthesizes its own rows and is easy to forget.
    it('carries the window bounds onto usage-only rows too', () => {
      const rows = buildEntitlementsRows(
        [],
        [
          {
            entitlementId: 'usage-only-entitlement',
            value: { type: 'number', value: 3 },
            currentPeriodStart: '2026-03-01T00:00:00.000Z',
            currentPeriodEnd: '2026-03-02T00:00:00.000Z',
          },
        ] as any,
        'Unknown',
      );

      expect(rows[0].currentPeriodStart).toBe('2026-03-01T00:00:00.000Z');
      expect(rows[0].currentPeriodEnd).toBe('2026-03-02T00:00:00.000Z');
    });

    it('carries the overage percent onto the row', () => {
      const rows = buildEntitlementsRows(
        [
          {
            entitlementName: 'Storage GB',
            entitlementSlug: 'storage-gb',
            entitlementType: 'NUMBER',
            limitCapExceededOveragePercent: 20,
            value: { type: 'number', value: 1000 },
          },
        ] as any,
        [],
        'Unknown',
      );

      expect(rows[0].limitCapExceededOveragePercent).toBe(20);
    });

    // A grant written before the field existed reports no percent, and the
    // API derives it from the value rather than treating it as a soft limit.
    it('defaults an absent percent to a hard limit for a capped grant', () => {
      const rows = buildEntitlementsRows(
        [
          {
            entitlementName: 'Seats',
            entitlementSlug: 'seats',
            entitlementType: 'NUMBER',
            value: { type: 'number', value: 10 },
          },
        ] as any,
        [],
        'Unknown',
      );

      expect(rows[0].limitCapExceededOveragePercent).toBe(0);
    });

    it('defaults an absent percent to the unlimited sentinel', () => {
      const rows = buildEntitlementsRows(
        [
          {
            entitlementName: 'Seats',
            entitlementSlug: 'seats',
            entitlementType: 'NUMBER',
            value: { type: 'number', value: -1 },
          },
        ] as any,
        [],
        'Unknown',
      );

      expect(rows[0].limitCapExceededOveragePercent).toBe(-1);
    });

    it('leaves the percent null for a non-numeric grant', () => {
      const rows = buildEntitlementsRows(
        [
          {
            entitlementName: 'SSO',
            entitlementSlug: 'sso',
            entitlementType: 'BOOLEAN',
            value: { type: 'boolean', value: true },
          },
        ] as any,
        [],
        'Unknown',
      );

      expect(rows[0].limitCapExceededOveragePercent).toBeNull();
    });

    it('leaves the percent null on usage-only rows', () => {
      const rows = buildEntitlementsRows(
        [],
        [
          {
            entitlementId: 'usage-only-entitlement',
            value: { type: 'number', value: 3 },
          },
        ] as any,
        'Unknown',
      );

      expect(rows[0].limitCapExceededOveragePercent).toBeNull();
    });

    it('keeps usage-only entitlements without a resolved slug', () => {
      const rows = buildEntitlementsRows(
        [],
        [
          {
            entitlementId: 'usage-only-entitlement',
            value: {
              type: 'number',
              value: 3,
            },
          },
        ] as any,
        'Unknown',
      );

      expect(rows[0].entitlementId).toBe('usage-only-entitlement');
      expect(rows[0].entitlementSlug).toBeNull();
    });

    it('matches usage by slug when license entitlements do not expose entitlementId', () => {
      const licenseEntitlements = [
        {
          entitlementName: 'Entitlement Values Reported',
          entitlementSlug: 'entitlement-values-reported',
          entitlementType: 'NUMBER',
          value: {
            type: 'number',
            value: -1,
          },
        },
        {
          entitlementName: 'Entitlements Created',
          entitlementSlug: 'entitlements-created',
          entitlementType: 'NUMBER',
          value: {
            type: 'number',
            value: 3,
          },
        },
      ] as any;

      const rows = buildEntitlementsRows(
        licenseEntitlements,
        [
          {
            entitlementId: 'ent-created',
            entitlementSlug: 'entitlements-created',
            value: {
              type: 'number',
              value: 3,
            },
          },
          {
            entitlementId: 'ent-reported',
            entitlementSlug: 'entitlement-values-reported',
            value: {
              type: 'number',
              value: 0,
            },
          },
        ] as any,
        'Unknown',
      );

      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        entitlementId: 'ent-reported',
        entitlementName: 'Entitlement Values Reported',
        value: 0,
      });
      expect(rows[1]).toMatchObject({
        entitlementId: 'ent-created',
        entitlementName: 'Entitlements Created',
        value: 3,
      });
    });
  });
});
