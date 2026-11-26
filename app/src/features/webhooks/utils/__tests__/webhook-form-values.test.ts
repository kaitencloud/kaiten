import { describe, expect, it } from 'vite-plus/test';
import type { ApiWebhook } from '../../types';
import { WEBHOOK_EVENTS } from '../webhook-event-catalogue';
import {
  formValuesToBody,
  webhookDisplayName,
  webhookToBody,
  webhookToFormValues,
} from '../webhook-form-values';

const MODEL_CREATED = WEBHOOK_EVENTS.MODEL_CREATED.type;
const CUSTOMER_CREATED = WEBHOOK_EVENTS.CUSTOMER_CREATED.type;

const webhook = (overrides: Partial<ApiWebhook> = {}): ApiWebhook => ({
  id: 'ep_1',
  url: 'https://api.example.com/hooks/kaiten?token=secret',
  eventTypes: [CUSTOMER_CREATED, MODEL_CREATED],
  ...overrides,
});

describe('webhook form values', () => {
  it('opens a webhook with its events in catalogue order', () => {
    expect(webhookToFormValues(webhook())).toEqual({
      eventTypes: [MODEL_CREATED, CUSTOMER_CREATED],
      url: 'https://api.example.com/hooks/kaiten?token=secret',
    });
  });

  it('opens a webhook without a filter with no events', () => {
    const unfiltered = webhook({ eventTypes: null as unknown as string[] });

    expect(webhookToFormValues(unfiltered).eventTypes).toEqual([]);
    expect(webhookToBody(unfiltered).eventTypes).toEqual([]);
  });

  it('sends the URL trimmed and the events normalised', () => {
    expect(
      formValuesToBody({
        eventTypes: [CUSTOMER_CREATED, MODEL_CREATED, CUSTOMER_CREATED],
        url: '  https://a.example.com  ',
      }),
    ).toEqual({
      eventTypes: [MODEL_CREATED, CUSTOMER_CREATED],
      url: 'https://a.example.com',
    });
  });

  it('restates a webhook as the body the form opened with', () => {
    const opened = webhook();

    expect(webhookToBody(opened)).toEqual(
      formValuesToBody(webhookToFormValues(opened)),
    );
    expect(webhookToBody(webhook({ eventTypes: [MODEL_CREATED, CUSTOMER_CREATED] }))).toEqual(
      webhookToBody(opened),
    );
  });

  it('names a webhook by its host, never its path or query', () => {
    expect(webhookDisplayName(webhook())).toBe('api.example.com');
    expect(
      webhookDisplayName(webhook({ url: 'https://hooks.slack.com/services/T0/B0/XXXX' })),
    ).toBe('hooks.slack.com');
  });

  it('names a webhook by its id when the URL cannot be read', () => {
    expect(webhookDisplayName(webhook({ url: 'not a url' }))).toBe('ep_1');
  });
});
