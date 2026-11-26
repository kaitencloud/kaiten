import { describe, expect, it } from 'vite-plus/test';
import type { WebhookDelivery } from '../../types';
import {
  buildChronologyItems,
  type ChronologyItem,
  getWebhookMilestones,
} from '../webhook-delivery-timeline';

const delivery = (key: string, timestamp: string): WebhookDelivery => ({
  key,
  hookId: 'ep_orders',
  messageId: key,
  eventType: 'com.kaiten.instance.v1.created',
  timestamp,
  status: 'success',
  statusSource: 'message',
  attempts: [],
});

/** Each item by its key, its milestone kind, or `older`. */
function describeItems(items: ChronologyItem[]) {
  return items.map((item) =>
    item.kind === 'delivery'
      ? item.delivery.key
      : item.kind === 'milestone'
        ? item.milestone.kind
        : 'older',
  );
}

describe('getWebhookMilestones', () => {
  it('leaves out an update within a minute of the creation', () => {
    expect(
      getWebhookMilestones('2026-11-01T09:00:00Z', '2026-11-01T09:00:59Z'),
    ).toEqual([{ kind: 'created', at: '2026-11-01T09:00:00Z' }]);
    expect(
      getWebhookMilestones('2026-11-01T09:00:00Z', '2026-11-01T09:00:00Z'),
    ).toHaveLength(1);
  });

  it('closes with the creation, after a later update', () => {
    expect(
      getWebhookMilestones('2026-11-01T09:00:00Z', '2026-11-02T09:00:00Z'),
    ).toEqual([
      { kind: 'updated', at: '2026-11-02T09:00:00Z' },
      { kind: 'created', at: '2026-11-01T09:00:00Z' },
    ]);
  });

  it("leaves out a creation that does not parse, and reads Go's older format", () => {
    expect(getWebhookMilestones('not a date', '2026-11-02T09:00:00Z')).toEqual(
      [],
    );
    expect(
      getWebhookMilestones('2026-03-01 12:00:00.123456 +0000 UTC', undefined),
    ).toHaveLength(1);
  });
});

describe('buildChronologyItems', () => {
  const deliveries = [
    delivery('newest', '2026-11-26T11:00:00Z'),
    delivery('older', '2026-11-26T10:00:00Z'),
  ];

  it('closes with the milestones older than every delivery', () => {
    const milestones = getWebhookMilestones(
      '2026-11-01T09:00:00Z',
      '2026-11-20T16:00:00Z',
    );

    expect(
      describeItems(buildChronologyItems(deliveries, milestones, false)),
    ).toEqual(['newest', 'older', 'updated', 'created']);
  });

  it('sets each milestone before the first delivery older than it', () => {
    const milestones = getWebhookMilestones(
      '2026-11-26T09:00:00Z',
      '2026-11-26T12:00:00Z',
    );

    expect(
      describeItems(buildChronologyItems(deliveries, milestones, false)),
    ).toEqual(['updated', 'newest', 'older', 'created']);
  });

  it('with more deliveries than listed, leaves out the older milestones', () => {
    const milestones = getWebhookMilestones(
      '2026-11-01T09:00:00Z',
      '2026-11-26T10:30:00Z',
    );

    expect(
      describeItems(buildChronologyItems(deliveries, milestones, true)),
    ).toEqual(['newest', 'updated', 'older', 'older']);
  });

  it('shows only the milestones when there is no delivery', () => {
    expect(
      describeItems(
        buildChronologyItems(
          [],
          getWebhookMilestones('2026-11-01T09:00:00Z'),
          false,
        ),
      ),
    ).toEqual(['created']);
  });
});
