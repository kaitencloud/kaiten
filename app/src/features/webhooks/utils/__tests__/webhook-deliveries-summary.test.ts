import { describe, expect, it } from 'vite-plus/test';
import type { WebhookDelivery } from '../../types';
import {
  countRecentDeliveries,
  getLastDeliveryAt,
  getRecentDeliveriesOutcome,
  sortDeliveriesNewestFirst,
} from '../webhook-deliveries-summary';

function delivery(
  messageId: string,
  overrides: Partial<WebhookDelivery> = {},
): WebhookDelivery {
  return {
    key: `ep_orders:${messageId}`,
    hookId: 'ep_orders',
    messageId,
    eventType: 'com.kaiten.instance.v1.created',
    timestamp: '2026-11-26T08:00:00Z',
    status: 'success',
    statusSource: 'message',
    attempts: [],
    ...overrides,
  };
}

describe('countRecentDeliveries', () => {
  it('tells a message waiting for a retry apart from one in flight', () => {
    const deliveries = [
      delivery('msg_1'),
      delivery('msg_2', {
        status: 'pending',
        nextAttempt: '2026-11-26T09:00:00Z',
      }),
      delivery('msg_3', { status: 'pending' }),
      delivery('msg_4', { status: 'sending' }),
      delivery('msg_5', { status: 'fail' }),
    ];

    expect(
      countRecentDeliveries(deliveries, {
        total: 5,
        delivered: 1,
        failed: 1,
        pending: 3,
      }),
    ).toEqual({ total: 5, delivered: 1, failed: 1, retrying: 1, inFlight: 2 });
  });
});

describe('getRecentDeliveriesOutcome', () => {
  const none = { total: 4, delivered: 4, failed: 0, retrying: 0, inFlight: 0 };

  it('names the worst state: failures, then retries, then in flight', () => {
    expect(
      getRecentDeliveriesOutcome({ ...none, failed: 2, retrying: 1 }),
    ).toEqual({ kind: 'failures', count: 2 });
    expect(
      getRecentDeliveriesOutcome({ ...none, retrying: 1, inFlight: 3 }),
    ).toEqual({ kind: 'retrying', count: 1 });
    expect(getRecentDeliveriesOutcome({ ...none, inFlight: 3 })).toEqual({
      kind: 'inFlight',
      count: 3,
    });
    expect(getRecentDeliveriesOutcome(none)).toEqual({ kind: 'allDelivered' });
  });
});

describe('getLastDeliveryAt', () => {
  it('is the newest time that parses, whatever the order', () => {
    expect(
      getLastDeliveryAt([
        delivery('msg_1', { timestamp: '2026-11-26T08:00:00Z' }),
        delivery('msg_2', { timestamp: 'garbage' }),
        delivery('msg_3', { timestamp: '2026-11-26T09:30:00Z' }),
      ]),
    ).toBe('2026-11-26T09:30:00Z');
    expect(getLastDeliveryAt([delivery('msg_1', { timestamp: '' })])).toBe(
      undefined,
    );
  });
});

describe('sortDeliveriesNewestFirst', () => {
  it('sorts by publication time, keeps ties in order, unreadable times last', () => {
    const sorted = sortDeliveriesNewestFirst([
      delivery('msg_old', { timestamp: '2026-11-25T08:00:00Z' }),
      delivery('msg_bad', { timestamp: 'not a date' }),
      delivery('msg_tie_a', { timestamp: '2026-11-26T08:00:00Z' }),
      delivery('msg_tie_b', { timestamp: '2026-11-26T08:00:00Z' }),
      delivery('msg_new', { timestamp: '2026-11-26T10:00:00Z' }),
    ]);

    expect(sorted.map((item) => item.messageId)).toEqual([
      'msg_new',
      'msg_tie_a',
      'msg_tie_b',
      'msg_old',
      'msg_bad',
    ]);
  });
});
