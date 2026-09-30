import { Suspense, type ComponentProps } from 'react';
import {
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import { CreateWebhookDialog } from '../create-webhook-dialog';

vi.mock('react-i18next', () => ({
  initReactI18next: {
    init: () => undefined,
    type: '3rdParty',
  },
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'Common.cancel': 'Cancel',
        'Features.AuditTrail.events.CUSTOMER_CREATED': 'Customer created',
        'Features.AuditTrail.events.LICENSE_FAMILY_CREATED':
          'License family created',
        'Pages.Integrations.Webhooks.Dialog.createButton': 'Create Webhook',
        'Pages.Integrations.Webhooks.Dialog.description':
          'Configure webhook deliveries.',
        'Pages.Integrations.Webhooks.Dialog.eventsLabel': 'Events',
        'Pages.Integrations.Webhooks.Dialog.eventsRequired':
          'Select at least one event.',
        'Pages.Integrations.Webhooks.Dialog.eventsSelected': 'selected',
        'Pages.Integrations.Webhooks.Dialog.selectedEvents': 'Selected events',
        'Pages.Integrations.Webhooks.Dialog.selectedEventsPlaceholder':
          'No events selected yet.',
        'Pages.Integrations.Webhooks.Dialog.title': 'New Webhook',
        'Pages.Integrations.Webhooks.Dialog.urlDescription':
          'The webhook URL receives the payload.',
        'Pages.Integrations.Webhooks.Dialog.urlInvalid': 'Enter a valid URL.',
        'Pages.Integrations.Webhooks.Dialog.urlLabel': 'Webhook URL',
        'Pages.Integrations.Webhooks.Dialog.urlPlaceholder':
          'https://api.example.com/webhooks/kaiten',
        'Pages.Integrations.Webhooks.Dialog.urlRequired':
          'Webhook URL is required.',
        'Pages.Integrations.Webhooks.EventGroups.customer': 'Customers',
        'Pages.Integrations.Webhooks.EventGroups.licenseFamily':
          'License families',
      };

      return translations[key] ?? key;
    },
  }),
}));

describe('CreateWebhookDialog', () => {
  function renderDialog(
    props?: Partial<ComponentProps<typeof CreateWebhookDialog>>,
  ) {
    return render(
      <Suspense fallback={<div>Loading...</div>}>
        <CreateWebhookDialog
          open
          onOpenChange={vi.fn()}
          onSubmit={vi.fn()}
          {...props}
        />
      </Suspense>,
    );
  }

  it('shows the selected events summary placeholder when nothing is selected', async () => {
    renderDialog();

    expect(await screen.findByText('Selected events')).toBeInTheDocument();
    expect(await screen.findByText('No events selected yet.')).toBeInTheDocument();
  });

  it('offers every event by group, but not the high-volume reads', async () => {
    renderDialog();

    expect(await screen.findByText('Customers')).toBeInTheDocument();
    expect(screen.getByText('License families')).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'License family created' }),
    ).toBeInTheDocument();
    expect(screen.getByText('LICENSE_FAMILY_CREATED')).toBeInTheDocument();
    expect(screen.queryByText('FEATURE_FLAG_EVALUATED')).not.toBeInTheDocument();
    expect(screen.queryByText('ENTITLEMENT_VALUE_GET')).not.toBeInTheDocument();
  });

  it('submits selected events and url through the form', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    renderDialog({ onOpenChange, onSubmit });

    await user.click(
      await screen.findByRole('checkbox', { name: 'Customer created' }),
    );
    await user.type(
      await screen.findByLabelText('Webhook URL'),
      'https://example.com/webhooks/customer',
    );

    expect(
      screen.queryByText('No events selected yet.'),
    ).not.toBeInTheDocument();

    const submitButton = await screen.findByRole('button', {
      name: 'Create Webhook',
    });

    await waitFor(() => {
      expect(submitButton).toBeEnabled();
    });

    await user.click(submitButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        eventTypes: ['com.kaiten.customer.v1.created'],
        url: 'https://example.com/webhooks/customer',
      });
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('prevents native form submission from reloading the page', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    renderDialog({ onSubmit });

    await user.click(
      await screen.findByRole('checkbox', { name: 'Customer created' }),
    );
    await user.type(
      await screen.findByLabelText('Webhook URL'),
      'https://example.com/webhooks/customer',
    );

    const form = (await screen.findByLabelText('Webhook URL')).closest('form');

    if (!form) {
      throw new Error('Expected dialog form to be rendered');
    }

    const submitEvent = createEvent.submit(form);

    fireEvent(form, submitEvent);

    expect(submitEvent.defaultPrevented).toBe(true);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
  });
});
