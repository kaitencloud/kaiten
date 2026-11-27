import { describe, expect, it } from 'vite-plus/test';
import type { ApiWebhook } from '../../types';
import { WEBHOOK_EVENTS } from '../webhook-event-catalogue';
import {
  formValuesToBody,
  isUnchangedWebhook,
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
      keepEveryEvent: false,
      eventTypes: [MODEL_CREATED, CUSTOMER_CREATED],
      url: 'https://api.example.com/hooks/kaiten?token=secret',
    });
  });

  it('opens a webhook without a filter with no events, keeping every event', () => {
    const unfiltered = webhook({ eventTypes: null });

    expect(webhookToFormValues(unfiltered)).toMatchObject({
      keepEveryEvent: true,
      eventTypes: [],
    });
    expect(webhookToFormValues(webhook({ eventTypes: [] })).keepEveryEvent).toBe(true);
    expect(webhookToBody(unfiltered).eventTypes).toEqual([]);
  });

  it('sends no event while the webhook keeps every event, whatever was ticked', () => {
    expect(
      formValuesToBody({
        keepEveryEvent: true,
        eventTypes: [CUSTOMER_CREATED],
        url: ' https://a.example.com/v2 ',
      }),
    ).toEqual({ eventTypes: [], url: 'https://a.example.com/v2' });
  });

  it('compares what the values would send, not the values', () => {
    const opened = webhookToFormValues(webhook({ eventTypes: null }));

    expect(isUnchangedWebhook(opened, opened)).toBe(true);
    // Unticked, events ticked, then ticked again: the same body.
    expect(
      isUnchangedWebhook({ ...opened, eventTypes: [MODEL_CREATED] }, opened),
    ).toBe(true);
    expect(isUnchangedWebhook({ ...opened, keepEveryEvent: false }, opened)).toBe(
      true,
    );
    expect(
      isUnchangedWebhook(
        { ...opened, keepEveryEvent: false, eventTypes: [MODEL_CREATED] },
        opened,
      ),
    ).toBe(false);
    expect(isUnchangedWebhook({ ...opened, url: `${opened.url}/v2` }, opened)).toBe(
      false,
    );
  });

  it('sends the URL trimmed and the events normalised', () => {
    expect(
      formValuesToBody({
        keepEveryEvent: false,
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
