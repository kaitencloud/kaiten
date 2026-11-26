import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import type { ApiWebhook } from '../../types';
import { WEBHOOK_EVENTS } from '../../utils/webhook-event-catalogue';
import { useWebhookForm } from '../use-webhook-form';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const CUSTOMER_CREATED = WEBHOOK_EVENTS.CUSTOMER_CREATED.type;

const filterless: ApiWebhook = {
  id: 'ep_everything',
  url: 'https://hooks.example.com/everything',
  eventTypes: null,
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

const renderForm = (webhook?: ApiWebhook) =>
  renderHook(() => useWebhookForm({ webhook }), { wrapper });

describe('useWebhookForm', () => {
  it('never offers to keep every event on a create', () => {
    const { result } = renderForm();

    expect(result.current.hasNoEventFilter).toBe(false);
    expect(result.current.form.state.values.keepEveryEvent).toBe(false);
  });

  it('never offers it for a webhook that has a filter', () => {
    const { result } = renderForm({
      ...filterless,
      eventTypes: [CUSTOMER_CREATED],
    });

    expect(result.current.hasNoEventFilter).toBe(false);
    expect(result.current.form.state.values.keepEveryEvent).toBe(false);
  });

  it('opens a webhook without a filter keeping every event, valid with no event', async () => {
    const { result } = renderForm(filterless);
    const { form, hasNoEventFilter, isUnchanged } = result.current;

    expect(hasNoEventFilter).toBe(true);
    expect(form.state.values).toMatchObject({ keepEveryEvent: true, eventTypes: [] });
    expect(isUnchanged(form.state.values)).toBe(true);

    await act(async () => {
      form.setFieldValue('url', `${filterless.url}/v2`);
      await form.validateAllFields('change');
    });
    expect(form.state.isValid).toBe(true);
    expect(isUnchanged(form.state.values)).toBe(false);
  });

  it('needs an event once the box is unticked, and has nothing to save when it is ticked again', async () => {
    const { result } = renderForm(filterless);
    const { form, isUnchanged } = result.current;

    await act(async () => {
      form.setFieldValue('keepEveryEvent', false);
      await form.validate('change');
    });
    expect(form.state.isValid).toBe(false);
    expect(form.getFieldMeta('eventTypes')?.errors).toEqual([
      expect.objectContaining({
        message: 'Pages.Integrations.Webhooks.Form.eventsRequired',
      }),
    ]);

    await act(async () => {
      form.setFieldValue('eventTypes', [CUSTOMER_CREATED]);
      form.setFieldValue('keepEveryEvent', true);
      await form.validate('change');
    });
    expect(form.state.isValid).toBe(true);
    expect(isUnchanged(form.state.values)).toBe(true);
  });
});
