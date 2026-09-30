import { describe, expect, it } from 'vite-plus/test';
import type { AuditTrail } from '@/api-client/types.gen';
import type { InstanceEntitlementRow } from '../../../../../utils/instance-detail-entitlements.utils';
import {
  buildActivityTimelineGroupData,
  buildActivityTimelineStatusData,
  buildAuditTrailEntitlementOptions,
  buildValueOverTimeGroupData,
  buildValueOverTimeGroupEntitlementOptions,
  buildValueOverTimeNumericGroupOptions,
  buildValueOverTimeData,
  doesAuditEntryMatchGroup,
  filterAuditTrailEntries,
  getEntitlementLabelForAuditSlug,
} from '../audit-trail.utils';

const entitlementsRows: InstanceEntitlementRow[] = [
  {
    enabled: true,
    entitlementId: 'ent-api',
    entitlementGroups: [
      { id: 'group-usage', name: 'Usage', slug: 'usage' },
      { id: 'group-billing', name: 'Billing', slug: 'billing' },
    ],
    entitlementName: 'API Calls',
    entitlementSlug: 'api-calls',
    entitlementType: 'NUMBER',
    threshold: 100,
    limitCapExceededOveragePercent: 0,
    value: 0,
  },
  {
    enabled: true,
    entitlementId: 'ent-sso',
    entitlementGroups: [
      { id: 'group-security', name: 'Security', slug: 'security' },
    ],
    entitlementName: 'SSO',
    entitlementSlug: 'sso-integration',
    entitlementType: 'BOOLEAN',
    threshold: null,
    limitCapExceededOveragePercent: null,
    value: 0,
  },
  {
    enabled: null,
    entitlementId: 'ent-unknown',
    entitlementGroups: [],
    entitlementName: 'Usage only',
    entitlementSlug: null,
    entitlementType: 'NUMBER',
    threshold: null,
    limitCapExceededOveragePercent: null,
    value: 0,
  },
];

const entries: AuditTrail[] = [
  {
    eventName: 'ENTITLEMENT_VALUE_GET',
    eventType: 'com.kaiten.instance.entitlement.v1.value_get',
    id: '1',
    instanceId: 'instance-1',
    instanceSlug: 'acme-prod',
    payload: {
      entitlement_slug: 'api-calls',
      type: 'NUMBER',
      value: 10,
    },
    timestamp: '2026-03-24T10:00:00.000Z',
  },
  {
    eventName: 'ENTITLEMENT_USAGE_REPORT_ACCEPTED',
    eventType: 'com.kaiten.instance.entitlement.v1.usage_report_accepted',
    id: '2',
    instanceId: 'instance-1',
    instanceSlug: 'acme-prod',
    payload: {
      entitlement_slug: 'api-calls',
      type: 'NUMBER',
      value: 12,
    },
    timestamp: '2026-03-24T11:00:00.000Z',
  },
  {
    eventName: 'ENTITLEMENT_USAGE_REPORT_REJECTED',
    eventType: 'com.kaiten.instance.entitlement.v1.usage_report_rejected',
    id: '3',
    instanceId: 'instance-1',
    instanceSlug: 'acme-prod',
    payload: {
      entitlement_slug: 'sso-integration',
      type: 'BOOLEAN',
      value: true,
    },
    timestamp: '2026-03-25T09:00:00.000Z',
  },
  {
    eventName: 'ENTITLEMENT_VALUE_GET',
    eventType: 'com.kaiten.instance.entitlement.v1.value_get',
    id: '4',
    instanceId: 'instance-1',
    instanceSlug: 'acme-prod',
    payload: {
      entitlement_slug: 'unknown-number-entitlement',
      type: 'NUMBER',
      value: 99,
    },
    timestamp: '2026-03-25T10:00:00.000Z',
  },
  {
    eventName: 'ENTITLEMENT_VALUE_GET',
    eventType: 'com.kaiten.instance.entitlement.v1.value_get',
    id: '5',
    instanceId: 'instance-1',
    instanceSlug: 'acme-prod',
    payload: {
      entitlement_slug: 'api-calls',
      type: 'NUMBER',
      value: true,
    },
    timestamp: '2026-03-25T11:00:00.000Z',
  },
];

describe('audit-trail utils', () => {
  it('resolves entitlement display name from slug or falls back to slug', () => {
    expect(getEntitlementLabelForAuditSlug('api-calls', entitlementsRows)).toBe(
      'API Calls',
    );
    expect(
      getEntitlementLabelForAuditSlug('unknown-slug', entitlementsRows),
    ).toBe('unknown-slug');
    expect(getEntitlementLabelForAuditSlug(undefined, entitlementsRows)).toBe(
      undefined,
    );
  });

  it('builds entitlement options from resolved slugs only', () => {
    expect(buildAuditTrailEntitlementOptions(entitlementsRows)).toEqual([
      {
        isPeriodic: false,
        label: 'API Calls',
        slug: 'api-calls',
        type: 'NUMBER',
      },
      {
        isPeriodic: false,
        label: 'SSO',
        slug: 'sso-integration',
        type: 'BOOLEAN',
      },
    ]);
  });

  it('aggregates status mode timeline data for a selected entitlement within a group', () => {
    const timelineData = buildActivityTimelineStatusData({
      entries,
      entitlementsRows,
      groupFilter: 'usage',
      entitlementFilter: 'api-calls',
      locale: 'en-US',
    });

    expect(timelineData).toHaveLength(2);
    expect(timelineData[0]).toMatchObject({
      accepted: 1,
      read: 1,
      rejected: 0,
    });
    expect(timelineData[1]).toMatchObject({
      accepted: 0,
      read: 1,
      rejected: 0,
    });
  });

  it('aggregates group mode timeline data by day and counts multi-group entitlements in each group', () => {
    const timelineData = buildActivityTimelineGroupData({
      entries,
      entitlementsRows,
      includedGroupSlugs: ['billing', 'usage', 'security'],
      includedStatuses: ['read', 'accepted', 'rejected'],
      locale: 'en-US',
    });

    expect(timelineData).toHaveLength(2);
    expect(timelineData[0]).toMatchObject({
      billing: 2,
      usage: 2,
    });
    expect(timelineData[1]).toMatchObject({
      billing: 1,
      security: 1,
      usage: 1,
    });
  });

  it('builds value-over-time with one point per day and day labels like activity timeline', () => {
    const chartData = buildValueOverTimeData({
      entries,
      entitlementSlug: 'api-calls',
      locale: 'en-US',
      numberEntitlementSlugs: new Set(['api-calls']),
    });

    expect(chartData).toHaveLength(1);
    expect(chartData.map((point) => point.value)).toEqual([12]);
    expect(chartData[0].time).toContain('Mar 24');
  });

  it('builds numeric group options only from groups that contain numeric entitlements', () => {
    const groupRows: InstanceEntitlementRow[] = [
      ...entitlementsRows,
      {
        enabled: true,
        entitlementId: 'ent-storage',
        entitlementGroups: [
          { id: 'group-capacity', name: 'Capacity', slug: 'capacity' },
        ],
        entitlementName: 'Storage',
        entitlementSlug: 'storage-gb',
        entitlementType: 'NUMBER',
        threshold: 200,
        limitCapExceededOveragePercent: 0,
        value: 64,
      },
    ];

    expect(buildValueOverTimeNumericGroupOptions(groupRows)).toEqual([
      { label: 'Billing', value: 'billing' },
      { label: 'Capacity', value: 'capacity' },
      { label: 'Usage', value: 'usage' },
    ]);
    expect(
      buildValueOverTimeGroupEntitlementOptions(groupRows, 'usage'),
    ).toHaveLength(1);
  });

  it('builds group value-over-time with carry-forward totals while keeping individual lines optional', () => {
    const groupRows: InstanceEntitlementRow[] = [
      {
        enabled: true,
        entitlementId: 'ent-api',
        entitlementGroups: [
          { id: 'group-billing', name: 'Billing', slug: 'billing' },
        ],
        entitlementName: 'API Calls',
        entitlementSlug: 'api-calls',
        entitlementType: 'NUMBER',
        threshold: 100,
        limitCapExceededOveragePercent: 0,
        value: 0,
      },
      {
        enabled: true,
        entitlementId: 'ent-storage',
        entitlementGroups: [
          { id: 'group-billing', name: 'Billing', slug: 'billing' },
        ],
        entitlementName: 'Storage',
        entitlementSlug: 'storage-gb',
        entitlementType: 'NUMBER',
        threshold: 200,
        limitCapExceededOveragePercent: 0,
        value: 0,
      },
    ];
    const groupEntries: AuditTrail[] = [
      {
        eventName: 'ENTITLEMENT_VALUE_GET',
        eventType: 'com.kaiten.instance.entitlement.v1.value_get',
        id: '11',
        instanceId: 'instance-1',
        instanceSlug: 'acme-prod',
        payload: {
          entitlement_slug: 'api-calls',
          type: 'NUMBER',
          value: 10,
        },
        timestamp: '2026-03-24T10:00:00.000Z',
      },
      {
        eventName: 'ENTITLEMENT_VALUE_GET',
        eventType: 'com.kaiten.instance.entitlement.v1.value_get',
        id: '12',
        instanceId: 'instance-1',
        instanceSlug: 'acme-prod',
        payload: {
          entitlement_slug: 'storage-gb',
          type: 'NUMBER',
          value: 5,
        },
        timestamp: '2026-03-25T10:00:00.000Z',
      },
      {
        eventName: 'ENTITLEMENT_USAGE_REPORT_ACCEPTED',
        eventType: 'com.kaiten.instance.entitlement.v1.usage_report_accepted',
        id: '13',
        instanceId: 'instance-1',
        instanceSlug: 'acme-prod',
        payload: {
          entitlement_slug: 'api-calls',
          type: 'NUMBER',
          value: 12,
        },
        timestamp: '2026-03-26T10:00:00.000Z',
      },
      {
        eventName: 'ENTITLEMENT_VALUE_GET',
        eventType: 'com.kaiten.instance.entitlement.v1.value_get',
        id: '14',
        instanceId: 'instance-1',
        instanceSlug: 'acme-prod',
        payload: {
          entitlement_slug: 'storage-gb',
          type: 'NUMBER',
          value: 7,
        },
        timestamp: '2026-03-27T10:00:00.000Z',
      },
    ];

    const chartData = buildValueOverTimeGroupData({
      entries: groupEntries,
      entitlementsRows: groupRows,
      groupSlug: 'billing',
      locale: 'en-US',
      visibleEntitlementSlugs: ['api-calls'],
    });

    expect(chartData).toHaveLength(4);
    expect(chartData.map((point) => point.groupTotal)).toEqual([
      10, 15, 17, 19,
    ]);
    expect(chartData.map((point) => point['api-calls'])).toEqual([
      10, 10, 12, 12,
    ]);
    expect(chartData[1]).not.toHaveProperty('storage-gb');
  });

  describe('periodic counters in group value-over-time', () => {
    const PERIOD = {
      currentPeriodStart: '2026-03-01T00:00:00.000Z',
      currentPeriodEnd: '2026-04-01T00:00:00.000Z',
    } as const;

    const periodicRow: InstanceEntitlementRow = {
      ...PERIOD,
      enabled: true,
      entitlementId: 'ent-api',
      entitlementGroups: [
        { id: 'group-billing', name: 'Billing', slug: 'billing' },
      ],
      entitlementName: 'API Calls',
      entitlementSlug: 'api-calls',
      entitlementType: 'NUMBER',
      threshold: 100,
      limitCapExceededOveragePercent: 0,
      value: 0,
    };
    const lifetimeRow: InstanceEntitlementRow = {
      enabled: true,
      entitlementId: 'ent-storage',
      entitlementGroups: [
        { id: 'group-billing', name: 'Billing', slug: 'billing' },
      ],
      entitlementName: 'Storage',
      entitlementSlug: 'storage-gb',
      entitlementType: 'NUMBER',
      threshold: 200,
      limitCapExceededOveragePercent: 0,
      value: 0,
    };

    const reportOf = (
      slug: string,
      value: number,
      day: string,
      id: string,
    ): AuditTrail => ({
      eventName: 'ENTITLEMENT_USAGE_REPORT_ACCEPTED',
      eventType: 'com.kaiten.instance.entitlement.v1.usage_report_accepted',
      id,
      instanceId: 'instance-1',
      instanceSlug: 'acme-prod',
      payload: { entitlement_slug: slug, type: 'NUMBER', value },
      timestamp: `${day}T10:00:00.000Z`,
    });

    it('leaves a gap rather than carrying a periodic counter across unreported days', () => {
      const chartData = buildValueOverTimeGroupData({
        entries: [
          reportOf('api-calls', 90, '2026-03-24', '21'),
          reportOf('storage-gb', 5, '2026-03-25', '22'),
          reportOf('storage-gb', 7, '2026-03-26', '23'),
          reportOf('api-calls', 4, '2026-03-27', '24'),
        ],
        entitlementsRows: [periodicRow, lifetimeRow],
        groupSlug: 'billing',
        locale: 'en-US',
        visibleEntitlementSlugs: ['api-calls', 'storage-gb'],
      });

      // Carrying would report 90 on the two middle days, painting the
      // pre-reset peak flat across a boundary the audit trail cannot see.
      expect(chartData.map((point) => point['api-calls'])).toEqual([
        90,
        undefined,
        undefined,
        4,
      ]);
      // The lifetime counter still carries -- it really does hold its value.
      expect(chartData.map((point) => point['storage-gb'])).toEqual([
        0, 5, 7, 7,
      ]);
    });

    it('totals lifetime counters only, never folding in period-scoped ones', () => {
      const chartData = buildValueOverTimeGroupData({
        entries: [
          reportOf('api-calls', 90, '2026-03-24', '25'),
          reportOf('storage-gb', 5, '2026-03-25', '26'),
        ],
        entitlementsRows: [periodicRow, lifetimeRow],
        groupSlug: 'billing',
        locale: 'en-US',
        visibleEntitlementSlugs: [],
      });

      expect(chartData.map((point) => point.groupTotal)).toEqual([0, 5]);
    });

    it('omits the total entirely when the group has no lifetime counter', () => {
      const chartData = buildValueOverTimeGroupData({
        entries: [reportOf('api-calls', 90, '2026-03-24', '27')],
        entitlementsRows: [periodicRow],
        groupSlug: 'billing',
        locale: 'en-US',
        visibleEntitlementSlugs: ['api-calls'],
      });

      expect(chartData).toHaveLength(1);
      expect(chartData[0]).not.toHaveProperty('groupTotal');
    });
  });

  it('filters table entries independently from group-aware chart helpers', () => {
    const filteredEntries = filterAuditTrailEntries(
      entries,
      {
        eventFilter: 'all',
        groupFilter: 'usage',
        searchQuery: 'api calls',
        statusFilter: 'all',
      },
      (eventName) => eventName,
      entitlementsRows,
    );

    expect(filteredEntries.map((entry) => entry.id)).toEqual(['1', '2', '5']);
    expect(
      doesAuditEntryMatchGroup(entries[2], 'usage', entitlementsRows),
    ).toBe(false);
    expect(
      doesAuditEntryMatchGroup(entries[0], 'billing', entitlementsRows),
    ).toBe(true);
  });
});
