import { describe, expect, it } from 'vite-plus/test';
import { mapApiWebhookToWebhook, normalizeWebhookTimestamp } from '../mappers';

describe('normalizeWebhookTimestamp', () => {
  it('keeps the RFC 3339 saas-api sends', () => {
    expect(normalizeWebhookTimestamp('2026-02-25T10:11:12.123456Z')).toBe(
      '2026-02-25T10:11:12.123456Z',
    );
  });

  it("restates the Go time.String() text an older saas-api sent", () => {
    const restated = normalizeWebhookTimestamp(
      '2026-02-25 10:11:12.123456789 +0000 UTC',
    );

    expect(restated).toBe('2026-02-25T10:11:12.123456789+00:00');
    expect(new Date(restated).toISOString()).toBe('2026-02-25T10:11:12.123Z');
    expect(
      new Date(normalizeWebhookTimestamp('2026-02-25 12:11:12 +0200 CEST')).toISOString(),
    ).toBe('2026-02-25T10:11:12.000Z');
  });

  it('keeps anything else as is', () => {
    expect(normalizeWebhookTimestamp('yesterday')).toBe('yesterday');
  });
});

describe('mapApiWebhookToWebhook', () => {
  it('reads the created date in either format, and none as empty', () => {
    const base = { id: 'ep_a', url: 'https://a.example.com', eventTypes: [] };

    expect(
      mapApiWebhookToWebhook({ ...base, createdAt: '2026-02-25 10:11:12 +0000 UTC' })
        .createdAt,
    ).toBe('2026-02-25T10:11:12+00:00');
    expect(
      mapApiWebhookToWebhook({ ...base, createdAt: '2026-02-25T10:11:12Z' }).createdAt,
    ).toBe('2026-02-25T10:11:12Z');
    expect(mapApiWebhookToWebhook(base).createdAt).toBe('');
  });
});
