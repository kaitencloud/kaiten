import { describe, expect, it } from 'vite-plus/test';
import { WEBHOOK_EVENTS } from '../../utils/webhook-event-catalogue';
import { initialWebhookFormValues, webhookFormSchema } from '../webhook-form.schema';

const CUSTOMER_CREATED = WEBHOOK_EVENTS.CUSTOMER_CREATED.type;
const URL = 'https://hooks.example.com/kaiten';

const issuesOf = (values: unknown) =>
  webhookFormSchema
    .safeParse(values)
    .error?.issues.map((issue) => [issue.path.join('.'), issue.message]) ?? [];

describe('webhookFormSchema', () => {
  it('starts a create without keeping every event', () => {
    expect(initialWebhookFormValues.keepEveryEvent).toBe(false);
  });

  it('needs at least one event unless the webhook keeps every event', () => {
    expect(issuesOf({ keepEveryEvent: false, eventTypes: [], url: URL })).toEqual([
      ['eventTypes', 'Pages.Integrations.Webhooks.Form.eventsRequired'],
    ]);
    expect(issuesOf({ keepEveryEvent: true, eventTypes: [], url: URL })).toEqual([]);
    expect(
      issuesOf({ keepEveryEvent: false, eventTypes: [CUSTOMER_CREATED], url: URL }),
    ).toEqual([]);
  });

  it('says both what is missing when the URL is wrong too', () => {
    expect(issuesOf({ keepEveryEvent: false, eventTypes: [], url: 'ftp://x' })).toEqual([
      ['url', 'Pages.Integrations.Webhooks.Form.urlInvalid'],
      ['eventTypes', 'Pages.Integrations.Webhooks.Form.eventsRequired'],
    ]);
  });

  it('still needs an http or https URL while keeping every event', () => {
    expect(issuesOf({ keepEveryEvent: true, eventTypes: [], url: '  ' })).toEqual(
      expect.arrayContaining([['url', 'Pages.Integrations.Webhooks.Form.urlRequired']]),
    );
  });

  it('trims the URL', () => {
    expect(
      webhookFormSchema.parse({ keepEveryEvent: true, eventTypes: [], url: ` ${URL} ` }).url,
    ).toBe(URL);
  });
});
