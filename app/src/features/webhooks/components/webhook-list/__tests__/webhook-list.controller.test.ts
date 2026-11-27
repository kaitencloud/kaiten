import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vite-plus/test';
import type { Webhook } from '../../../types';
import { getWebhookSearchTokens } from '../webhook-list.controller';

const t = ((key: string) =>
  key === 'Pages.Integrations.Webhooks.Table.everyEvent'
    ? 'Every event'
    : key) as unknown as TFunction;

const webhook: Webhook = {
  id: 'ep_orders',
  url: 'https://api.example.com/hooks/orders',
  eventTypes: [],
  createdAt: '2026-11-01T09:00:00Z',
};

describe('getWebhookSearchTokens', () => {
  it('finds a webhook without a filter by the "Every event" its row shows', () => {
    expect(getWebhookSearchTokens(webhook, t)).toEqual([
      webhook.url,
      'Every event',
    ]);
  });

  it('finds a filtered webhook by its events, not by "Every event"', () => {
    const tokens = getWebhookSearchTokens(
      { ...webhook, eventTypes: ['com.kaiten.customer.v1.created'] },
      t,
    );

    expect(tokens).toContain('com.kaiten.customer.v1.created');
    expect(tokens).not.toContain('Every event');
  });
});
