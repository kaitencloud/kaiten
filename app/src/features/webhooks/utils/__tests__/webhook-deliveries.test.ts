import i18n from 'i18next';
import { beforeAll, describe, expect, it } from 'vite-plus/test';
import en from '@/lib/i18n/locales/en';
import type {
  WebhookDelivery,
  WebhookHistoryEntry,
  WebhookMessageAttempt,
  WebhookMessageSummary,
} from '../../types';
import {
  deliveryFromHistoryEntry,
  describeDeliveryOutcome,
  formatDeliveryRate,
  getDeliveryTone,
  getHistoryEntryAttemptId,
  hasResponseCode,
  mapMessageSummaryToDelivery,
  normalizeDeliveryStatus,
  OUTCOME_SEPARATOR,
  parseTimestamp,
  resolveAttempts,
  resolveDeliveryState,
} from '../webhook-deliveries';

beforeAll(() => {
  i18n.addResourceBundle('en', 'translation', en, true, true);
});

const t = i18n.t.bind(i18n);

const attempt = (
  id: string,
  timestamp: string,
  overrides: Partial<WebhookMessageAttempt> = {},
): WebhookMessageAttempt => ({
  id,
  timestamp,
  status: 'success',
  triggerType: 'scheduled',
  ...overrides,
});

const summary = (
  overrides: Partial<WebhookMessageSummary> = {},
): WebhookMessageSummary => ({
  messageId: 'msg_1',
  eventType: 'com.kaiten.instance.v1.created',
  timestamp: '2026-11-26T08:59:58Z',
  status: 'success',
  attemptCount: 1,
  lastAttempt: attempt('atmpt_1', '2026-11-26T08:59:59Z', {
    responseStatusCode: 200,
    responseDurationMs: 84,
  }),
  ...overrides,
});

const historyEntry = (
  overrides: Partial<WebhookHistoryEntry> = {},
): WebhookHistoryEntry => ({
  date: '2026-11-26T08:59:59Z',
  hookId: 'ep_orders',
  hookUrl: 'https://api.example.com/hooks',
  eventType: 'com.kaiten.instance.v1.created',
  status: 'fail',
  responseStatusCode: 503,
  responseStatusText: 'Service unavailable',
  messageId: 'msg_1',
  attemptId: 'atmpt_1',
  responseDurationMs: 5002,
  triggerType: 'scheduled',
  ...overrides,
});

const outcome = (delivery: WebhookDelivery) =>
  describeDeliveryOutcome(delivery, t).join(OUTCOME_SEPARATOR);

describe('normalizeDeliveryStatus and getDeliveryTone', () => {
  it('keeps the four known statuses and reads anything else as pending', () => {
    expect(normalizeDeliveryStatus('success')).toBe('success');
    expect(normalizeDeliveryStatus('sending')).toBe('sending');
    expect(normalizeDeliveryStatus('archived')).toBe('pending');
    expect(normalizeDeliveryStatus(undefined)).toBe('pending');
  });

  it('tells a pending message with a next attempt apart as retrying', () => {
    expect(
      getDeliveryTone({ status: 'pending', nextAttempt: '2026-11-26T09:10:03Z' }),
    ).toBe('retrying');
    expect(getDeliveryTone({ status: 'pending' })).toBe('pending');
    expect(
      getDeliveryTone({ status: 'fail', nextAttempt: '2026-11-26T09:10:03Z' }),
    ).toBe('fail');
    expect(getDeliveryTone({ status: 'unknown' })).toBe('pending');
  });
});

describe('hasResponseCode and parseTimestamp', () => {
  it('reads 0 and an absent code as no HTTP answer', () => {
    expect(hasResponseCode(0)).toBe(false);
    expect(hasResponseCode(undefined)).toBe(false);
    expect(hasResponseCode(503)).toBe(true);
  });

  it("parses RFC 3339 and Go's time.String() text, and refuses garbage", () => {
    expect(parseTimestamp('2026-11-26T08:59:58Z')).toBe(
      Date.UTC(2026, 10, 26, 8, 59, 58),
    );
    expect(parseTimestamp('2026-03-01 12:00:00.123456 +0000 UTC')).toBe(
      Date.UTC(2026, 2, 1, 12, 0, 0, 123),
    );
    expect(parseTimestamp('yesterday-ish')).toBeUndefined();
    expect(parseTimestamp('')).toBeUndefined();
    expect(parseTimestamp(undefined)).toBeUndefined();
  });
});

describe('mapMessageSummaryToDelivery', () => {
  it('keeps the message status, its next attempt and its last attempt', () => {
    const delivery = mapMessageSummaryToDelivery(
      summary({
        status: 'pending',
        nextAttempt: '2026-11-26T09:10:03Z',
        attemptCount: 3,
        lastAttempt: attempt('atmpt_3', '2026-11-26T08:40:06Z', {
          status: 'fail',
          responseStatusCode: 503,
        }),
      }),
      'ep_orders',
    );

    expect(delivery).toMatchObject({
      key: 'ep_orders:msg_1',
      hookId: 'ep_orders',
      messageId: 'msg_1',
      status: 'pending',
      statusSource: 'message',
      nextAttempt: '2026-11-26T09:10:03Z',
      attemptCount: 3,
      attempts: [{ id: 'atmpt_3', status: 'fail' }],
    });
  });

  it('has no attempt for a list read without attempts, and survives an unknown status', () => {
    const delivery = mapMessageSummaryToDelivery(
      summary({
        status: 'archived' as never,
        attemptCount: undefined,
        lastAttempt: undefined,
      }),
      'ep_orders',
    );

    expect(delivery.status).toBe('pending');
    expect(delivery.attempts).toEqual([]);
    expect(delivery.attemptCount).toBeUndefined();
  });
});

describe('deliveryFromHistoryEntry', () => {
  it('keys the delivery by its message and carries the clicked attempt', () => {
    const delivery = deliveryFromHistoryEntry(historyEntry());

    expect(delivery).toMatchObject({
      key: 'ep_orders:msg_1',
      messageId: 'msg_1',
      status: 'fail',
      statusSource: 'attempt',
      timestamp: '2026-11-26T08:59:59Z',
      attempts: [
        {
          id: 'atmpt_1',
          status: 'fail',
          responseStatusCode: 503,
          response: 'Service unavailable',
          responseDurationMs: 5002,
        },
      ],
    });
  });

  it('falls back to a key and an attempt id of its own without message ids', () => {
    const entry = historyEntry({ messageId: undefined, attemptId: undefined });
    const delivery = deliveryFromHistoryEntry(entry);

    expect(delivery.key).toBe('ep_orders:no-message:2026-11-26T08:59:59Z:fail');
    expect(delivery.messageId).toBeUndefined();
    expect(delivery.attempts[0].id).toBe(entry.date);
    expect(getHistoryEntryAttemptId(entry)).toBe(entry.date);
  });
});

describe('resolveAttempts', () => {
  const delivery = deliveryFromHistoryEntry(historyEntry());

  it('takes the attempts of the message once read, oldest first whatever the order sent', () => {
    const attempts = resolveAttempts(delivery, {
      attempts: [
        attempt('atmpt_3', '2026-11-26T09:30:00Z', { triggerType: 'manual' }),
        attempt('atmpt_1', '2026-11-26T08:59:59Z', { status: 'fail' }),
        attempt('atmpt_2', '2026-11-26T09:00:59Z', { status: 'fail' }),
      ],
    });

    expect(attempts.map((item) => item.id)).toEqual([
      'atmpt_1',
      'atmpt_2',
      'atmpt_3',
    ]);
  });

  it('falls back to the attempts the delivery came with', () => {
    expect(resolveAttempts(delivery).map((item) => item.id)).toEqual([
      'atmpt_1',
    ]);
  });

  it('sorts an unreadable time last, ties by id, and normalizes statuses', () => {
    const attempts = resolveAttempts(delivery, {
      attempts: [
        attempt('atmpt_x', 'not a date', { status: 'odd' as never }),
        attempt('atmpt_b', '2026-11-26T09:00:00Z'),
        attempt('atmpt_a', '2026-11-26T09:00:00Z'),
      ],
    });

    expect(attempts.map((item) => item.id)).toEqual([
      'atmpt_a',
      'atmpt_b',
      'atmpt_x',
    ]);
    expect(attempts[2].status).toBe('pending');
  });
});

describe('resolveDeliveryState', () => {
  it('follows the newest attempt of a history delivery, not the clicked one', () => {
    const delivery = deliveryFromHistoryEntry(historyEntry());
    const attempts = resolveAttempts(delivery, {
      attempts: [
        attempt('atmpt_1', '2026-11-26T08:59:59Z', { status: 'fail' }),
        attempt('atmpt_2', '2026-11-26T09:30:00Z', { status: 'sending' }),
      ],
    });

    expect(resolveDeliveryState(delivery, attempts)).toEqual({
      status: 'sending',
    });
  });

  it('keeps the message status of a list delivery, retrying included', () => {
    const delivery = mapMessageSummaryToDelivery(
      summary({
        status: 'pending',
        nextAttempt: '2026-11-26T09:10:03Z',
        lastAttempt: attempt('atmpt_1', '2026-11-26T08:40:06Z', {
          status: 'fail',
        }),
      }),
      'ep_orders',
    );

    expect(resolveDeliveryState(delivery, resolveAttempts(delivery))).toEqual({
      status: 'pending',
      nextAttempt: '2026-11-26T09:10:03Z',
    });
  });

  it('follows an attempt newer than the one the list knew', () => {
    const delivery = mapMessageSummaryToDelivery(
      summary({ status: 'fail', lastAttempt: attempt('atmpt_1', '2026-11-26T08:40:06Z', { status: 'fail' }) }),
      'ep_orders',
    );
    const attempts = resolveAttempts(delivery, {
      attempts: [
        attempt('atmpt_2', '2026-11-26T09:30:00Z', {
          status: 'sending',
          triggerType: 'manual',
        }),
        attempt('atmpt_1', '2026-11-26T08:40:06Z', { status: 'fail' }),
      ],
    });

    expect(resolveDeliveryState(delivery, attempts).status).toBe('sending');
  });
});

describe('describeDeliveryOutcome', () => {
  const fromList = (overrides: Partial<WebhookMessageSummary>) =>
    mapMessageSummaryToDelivery(summary(overrides), 'ep_orders');

  it('reads a success by its code and duration, with the count after retries', () => {
    expect(outcome(fromList({}))).toBe('200 · 84 ms');
    expect(outcome(fromList({ attemptCount: 2 }))).toBe(
      '200 · 84 ms · 2 attempts',
    );
  });

  it('reads a failure by its code, its count, or the lack of an answer', () => {
    const failed = (count: number, code?: number) =>
      fromList({
        status: 'fail',
        attemptCount: count,
        lastAttempt: attempt('atmpt_1', '2026-11-26T08:59:59Z', {
          status: 'fail',
          responseStatusCode: code,
          responseDurationMs: code ? 120 : undefined,
        }),
      });

    expect(outcome(failed(1, 503))).toBe('503 · 120 ms');
    expect(outcome(failed(3, 503))).toBe('503 · 3 attempts');
    expect(outcome(failed(3))).toBe('No response · 3 attempts');
    expect(outcome(failed(1, 0))).toBe('No response');
  });

  it('reads pending and sending by the attempt reached', () => {
    expect(
      outcome(fromList({ status: 'pending', attemptCount: 1, lastAttempt: undefined })),
    ).toBe('Pending · attempt 1');
    expect(
      outcome(fromList({ status: 'sending', attemptCount: 2, lastAttempt: undefined })),
    ).toBe('Sending · attempt 2');
    expect(
      outcome(fromList({ status: 'pending', attemptCount: 0, lastAttempt: undefined })),
    ).toBe('Pending');
  });

  it('reads a failed message awaiting a retry as retrying, with the next attempt', () => {
    const parts = describeDeliveryOutcome(
      fromList({
        status: 'pending',
        nextAttempt: '2026-11-26T09:10:03Z',
        attemptCount: 3,
      }),
      t,
    );

    expect(parts[0]).toBe('Retrying after 3 attempts');
    expect(parts[1]).toMatch(/^next attempt /);
    expect(
      outcome(
        fromList({
          status: 'pending',
          nextAttempt: 'soon',
          attemptCount: undefined,
        }),
      ),
    ).toBe('Retrying');
  });

  it('falls back to the status word without a known attempt', () => {
    const delivery = fromList({
      attemptCount: undefined,
      lastAttempt: undefined,
    });

    expect(outcome(delivery)).toBe('OK');
    expect(outcome({ ...delivery, status: 'fail' })).toBe('Fail');
  });
});

describe('formatDeliveryRate', () => {
  it('rounds down and never reads 100% while a delivery is missing', () => {
    expect(formatDeliveryRate({ delivered: 48, total: 50 })).toEqual({
      percent: 96,
    });
    expect(formatDeliveryRate({ delivered: 199, total: 200 })).toEqual({
      percent: 99,
    });
    expect(formatDeliveryRate({ delivered: 2, total: 3 })).toEqual({
      percent: 66,
    });
    expect(formatDeliveryRate({ delivered: 50, total: 50 })).toEqual({
      percent: 100,
    });
  });

  it('has no rate without deliveries', () => {
    expect(formatDeliveryRate({ delivered: 0, total: 0 })).toBeNull();
  });
});
