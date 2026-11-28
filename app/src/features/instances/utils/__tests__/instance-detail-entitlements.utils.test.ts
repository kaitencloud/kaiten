import { describe, expect, it } from 'vite-plus/test';
import type { Entitlement } from '@/api-client';
import { getUsageStatus } from '@/domains/entitlement-usage';
import { findHistoryRow } from '../usage-history.utils';
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
  it('keeps AI definition identity from the grant when catalogue data is unavailable', () => {
    const [row] = buildEntitlementsRows(
      [{ entitlementName: 'AI Credits', entitlementSlug: 'ai-credits', entitlementType: 'NUMBER_AI_CREDIT', value: { type: 'number', value: 1000 } }] as never,
      [{ entitlementSlug: 'ai-credits', value: { type: 'number', value: 0.99 }, limit: { type: 'number', value: 1000 } }] as never,
      'Unknown',
    );
    expect(row).toMatchObject({ entitlementType: 'NUMBER', catalogueEntitlementType: 'NUMBER_AI_CREDIT', value: 0.99, threshold: 1000 });
    expect(findHistoryRow([row], 'ai-credits')).toBe(row);
  });
  // Cover both legacy normalized grants and the actual AI-credit wire type.
  it.each(['NUMBER', 'NUMBER_AI_CREDIT'] as const)(
    'normalizes the %s wire grant while keeping its AI-credit catalogue label',
    (entitlementType) => {
      const rows = buildEntitlementsRows(
        [
          {
            entitlementName: 'AI Credits',
            entitlementSlug: 'ai-credits',
            entitlementType,
            value: { type: 'number', value: 1000 },
          },
        ] as never,
        [
          {
            entitlementId: 'ent-ai',
            entitlementSlug: 'ai-credits',
            value: { type: 'number', value: 0.99 },
            limit: { type: 'number', value: 1000 },
            limitCapExceededOveragePercent: 0,
            currentPeriodStart: '2026-10-01T00:00:00Z',
            currentPeriodEnd: '2026-11-01T00:00:00Z',
          },
        ] as never,
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
        value: 0.99,
        threshold: 1000,
        limitCapExceededOveragePercent: 0,
        currentPeriodStart: '2026-10-01T00:00:00Z',
        currentPeriodEnd: '2026-11-01T00:00:00Z',
      });
      expect(
        getUsageStatus(
          rows[0].value,
          rows[0].threshold,
          rows[0].limitCapExceededOveragePercent,
        ),
      ).toBe('HEALTHY');
      expect(findHistoryRow(rows, 'ai-credits')).toBe(rows[0]);
      expect(isEntitlementExhausted(rows[0])).toBe(false);
    },
  );

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

    describe('where the usage says why the limit is what it is', () => {
      const provenance = {
        addons: [],
        boosts: [],
        license: {
          licenseEntitlementId: 'license-entitlement-traces',
          limitCapExceededOveragePercent: null,
          value: { type: 'number', value: 10000 },
        },
        number: {
          afterAddons: 13000,
          boostAdd: null,
          boostMultiply: 2,
          boostSet: null,
          effective: 26000,
          license: 10000,
          unlimited: false,
        },
      };
      const grant = {
        entitlementName: 'Traces',
        entitlementSlug: 'traces',
        entitlementType: 'NUMBER',
        value: { type: 'number', value: 10000 },
      };

      it('carries the source and the provenance onto the row of a license grant', () => {
        const [row] = buildEntitlementsRows(
          [grant] as any,
          [
            {
              entitlementId: 'ent-traces',
              entitlementSlug: 'traces',
              limit: { type: 'number', value: 26000 },
              provenance,
              source: 'license',
              value: { type: 'number', value: 4200 },
            },
          ] as any,
          'Unknown',
        );

        expect(row).toMatchObject({
          provenance,
          source: 'license',
          threshold: 26000,
        });
      });

      it('has the license as its source and no provenance when the usage sends none', () => {
        const [row] = buildEntitlementsRows([grant] as any, [], 'Unknown');

        expect(row.source).toBe('license');
        expect(row.provenance).toBeNull();
      });

      // An add-on may lower the percent down to a hard limit: the license's own is
      // what the grant said before it.
      it('takes the overage percent the API composes over the one of the license grant', () => {
        const [row] = buildEntitlementsRows(
          [{ ...grant, limitCapExceededOveragePercent: 50 }] as any,
          [
            {
              entitlementId: 'ent-traces',
              entitlementSlug: 'traces',
              limit: { type: 'number', value: 26000 },
              limitCapExceededOveragePercent: 0,
              source: 'license',
              value: { type: 'number', value: 4200 },
            },
          ] as any,
          'Unknown',
        );

        expect(row.limitCapExceededOveragePercent).toBe(0);
      });

      it('keeps the percent of the license grant when the usage carries none', () => {
        const [row] = buildEntitlementsRows(
          [{ ...grant, limitCapExceededOveragePercent: 50 }] as any,
          [
            {
              entitlementId: 'ent-traces',
              entitlementSlug: 'traces',
              limit: { type: 'number', value: 10000 },
              source: 'license',
              value: { type: 'number', value: 4200 },
            },
          ] as any,
          'Unknown',
        );

        expect(row.limitCapExceededOveragePercent).toBe(50);
      });
    });

    // The license grants nothing of it: the add-ons the instance holds do.
    describe('where only add-ons grant an entitlement', () => {
      const catalogue = [
        { icon: 'users', name: 'Seats', slug: 'seats', type: 'NUMBER' },
        { name: 'Analytics', slug: 'advanced-analytics', type: 'BOOLEAN' },
      ] as any;

      it('names a number by the catalogue, with the cap and the percent the usage says', () => {
        const rows = buildEntitlementsRows(
          [],
          [
            {
              entitlementId: 'ent-seats',
              entitlementSlug: 'seats',
              limit: { type: 'number', value: 15 },
              limitCapExceededOveragePercent: 0,
              source: 'addon',
              value: { type: 'number', value: 4 },
            },
          ] as any,
          'Unknown',
          catalogue,
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          catalogueEntitlementType: 'NUMBER',
          entitlementIcon: 'users',
          entitlementId: 'ent-seats',
          entitlementName: 'Seats',
          entitlementSlug: 'seats',
          entitlementType: 'NUMBER',
          limitCapExceededOveragePercent: 0,
          source: 'addon',
          threshold: 15,
          value: 4,
        });
      });

      it('reads a flag as a flag, with its value', () => {
        const [row] = buildEntitlementsRows(
          [],
          [
            {
              entitlementId: 'ent-analytics',
              entitlementSlug: 'advanced-analytics',
              limit: { type: 'boolean', value: true },
              source: 'addon',
              value: { type: 'boolean', value: true },
            },
          ] as any,
          'Unknown',
          catalogue,
        );

        expect(row).toMatchObject({
          enabled: true,
          entitlementName: 'Analytics',
          entitlementType: 'BOOLEAN',
          threshold: null,
        });
      });

      it('names it by its slug when the catalogue does not know it', () => {
        const [row] = buildEntitlementsRows(
          [],
          [
            {
              entitlementId: 'ent-unknown',
              entitlementSlug: 'unknown-thing',
              limit: { type: 'number', value: 1 },
              source: 'addon',
              value: { type: 'number', value: 0 },
            },
          ] as any,
          'Unknown',
          catalogue,
        );

        expect(row.entitlementName).toBe('unknown-thing');
        expect(row.catalogueEntitlementType).toBeNull();
      });
    });
  });
});

// A combined entitlement is the weighted sum of the usage of its sources, which the API computes
// when it is read and appends to the usage of the instance. No license grants it, so its row is
// read off the usage alone: the sources are what says it is combined, and the catalogue names it.
describe('the row of a combined entitlement', () => {
  const sources = [
    { entitlementSlug: 'firecrawl-credits', limit: 1000, usage: 300, weight: '0.4' },
    { entitlementSlug: 'ai-credits', limit: -1, usage: 100, weight: '0.6' },
  ];
  const combinedUsage = {
    entitlementId: 'entitlement-credits',
    entitlementSlug: 'credits',
    licenseId: 'license-pro',
    licenseSlug: 'pro',
    limit: { type: 'number', value: 1000 },
    limitCapExceededOveragePercent: 0,
    source: 'license',
    sources,
    value: { type: 'number', value: 1180 },
  };
  const catalogue = [
    { id: 'entitlement-credits', name: 'Credits', slug: 'credits', type: 'NUMBER', usageSource: 'COMBINED_USAGE' },
    { id: 'entitlement-firecrawl-credits', name: 'Firecrawl Credits', slug: 'firecrawl-credits', type: 'NUMBER', usageSource: 'CALCULATED_USAGE' },
    { id: 'entitlement-ai-credits', name: 'AI Credits', slug: 'ai-credits', type: 'NUMBER', usageSource: 'CALCULATED_USAGE' },
  ] as unknown as Entitlement[];
  const build = (entitlements = catalogue) =>
    buildEntitlementsRows([], [combinedUsage] as never, 'Unknown', entitlements);

  it('is told from the others, with its name and the sources the API gave it, named by the catalogue', () => {
    const [row] = build();

    expect(row).toMatchObject({
      entitlementName: 'Credits',
      entitlementSlug: 'credits',
      entitlementType: 'NUMBER',
      threshold: 1000,
      usageSource: 'COMBINED_USAGE',
      value: 1180,
    });
    expect(row.sources).toEqual([
      { ...sources[0], entitlementName: 'Firecrawl Credits' },
      { ...sources[1], entitlementName: 'AI Credits' },
    ]);
  });

  it('is told from the sources it carries when the session cannot read the catalogue', () => {
    const [row] = build([]);

    expect(row).toMatchObject({ entitlementName: 'credits', usageSource: 'COMBINED_USAGE' });
    expect(row.sources?.map(({ entitlementName }) => entitlementName)).toEqual([
      'firecrawl-credits',
      'ai-credits',
    ]);
  });

  it('says that the entitlements it sums are calculated', () => {
    const rows = buildEntitlementsRows(
      [{ entitlementName: 'Firecrawl Credits', entitlementSlug: 'firecrawl-credits', entitlementType: 'NUMBER', value: { type: 'number', value: 1000 } }] as never,
      [{ entitlementSlug: 'firecrawl-credits', value: { type: 'number', value: 300 }, limit: { type: 'number', value: 1000 } }] as never,
      'Unknown',
      catalogue,
    );

    expect(rows[0]).toMatchObject({ usageSource: 'CALCULATED_USAGE', sources: null });
  });

  it('is never on a wall: nothing is enforced on a sum, which reads above its limit when its sources are soft', () => {
    const [row] = build();

    // 1,180 of 1,000: past the limit, and no counter that is refused.
    expect(isEntitlementExhausted(row)).toBe(false);
    expect(isEntitlementEnabled(row)).toBe(true);
    expect(getEntitlementsMetrics([row]).limitReached).toBe(0);
    // The status stays, as information: the customer reads more than the sum of what was granted.
    expect(getUsageStatus(row.value, row.threshold, row.limitCapExceededOveragePercent)).toBe('OVER_LIMIT');
  });

  it('is not a counter whose history can be opened', () => {
    const [row] = build();

    expect(findHistoryRow([row], 'credits')).toBeUndefined();
  });
});
