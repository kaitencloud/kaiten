import type { Meta, StoryObj } from '@storybook/react-vite';
import { HttpResponse, type RequestHandler } from 'msw';
import type { ReactNode } from 'react';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';
import type { InstanceAddon, InstanceBilling } from '@/api-client';
import {
  handleCancelSubscription,
  handleDetachInstanceAddon,
  handleGetBillingCapabilities,
  handleGetBillingSettings,
  handleGetInstanceBilling,
  handleGetUpcomingInvoice,
  handleListInstanceAddons,
  handleUpdateInstance,
} from '@/api-client/msw.gen';
import {
  billingCapabilitiesProfiles,
  buildLicense,
  buildPrice,
  buildSubscription,
  storyInvoicePreview,
  storyLicensePricesHandler,
} from '@/test-fixtures/storybook-billing-fixtures';
import { storyInstances } from '@/test-fixtures/storybook-fixtures';
import { instanceDetailHandlers } from '@/test-fixtures/storybook-handlers';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { InstanceDetailProvider } from '../instance-detail/instance-detail-context';
import { CancelSubscriptionDialog } from '../instance-detail/tabs/billing/cancel/cancel-subscription-dialog';
import { SchedulePlanChangeDialog } from '../instance-detail/tabs/billing/plan-change/schedule-plan-change-dialog';
import { PaymentTermsDialog } from '../instance-detail/tabs/billing/terms/payment-terms-dialog';

// The day the stories are read, so that the dates they show are the same on every run.
const NOW = Date.parse('2027-03-10T12:00:00.000Z');

// A dialog fades in: what it holds is checked to be there, and not to be visible at the
// first frame, when its opacity is still 0.
const meta = {
  title: 'Features/Instances/BillingDialogs',
  // Not a spy: the instrumentation of the stories reads the clock itself, and a spy
  // on it would observe its own reads for ever.
  beforeEach: () => {
    const now = Date.now;
    Date.now = () => NOW;

    return () => {
      Date.now = now;
    };
  },
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const instance = storyInstances[0];

const MONTHLY = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Enterprise, monthly',
  id: 'price-enterprise-monthly',
  isDefault: true,
  unitAmountDecimal: '49900',
});

const subscription = (
  overrides: Partial<Parameters<typeof buildSubscription>[0]> = {},
): InstanceBilling =>
  buildSubscription({
    anchorAt: '2027-02-15T00:00:00.000Z',
    basePrice: MONTHLY,
    currentPeriodEnd: '2027-03-15T00:00:00.000Z',
    currentPeriodStart: '2027-02-15T00:00:00.000Z',
    customerName: 'Acme Corp',
    customerSlug: 'acme-corp',
    instanceName: instance.name,
    instanceSlug: instance.slug,
    ...overrides,
  });

/**
 * Everything a dialog of the Billing tab reads: the instance page, billing, and the
 * subscription. What a story adds comes first, since the first handler that matches
 * answers: it replaces the page's own answer to the same request.
 */
const handlersFor = (
  value: InstanceBilling,
  ...more: RequestHandler[]
): RequestHandler[] => [
  ...more,
  handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }),
  handleGetInstanceBilling({ body: value }),
  handleGetUpcomingInvoice({ body: storyInvoicePreview }),
  handleListInstanceAddons({ body: [] }),
  handleGetBillingSettings({
    body: {
      defaultCollectionMethod: 'SEND_INVOICE',
      defaultDaysUntilDue: 30,
      handoffStripeInvoices: false,
    },
  }),
  ...instanceDetailHandlers,
];

function DialogFrame({ children }: { children: ReactNode }) {
  return (
    <StorybookRouter
      initialEntries={[`/customers/instances/${instance.slug}`]}
      routePath="/customers/instances/$instanceSlug"
    >
      <InstanceDetailProvider instanceId={instance.slug}>
        {children}
      </InstanceDetailProvider>
    </StorybookRouter>
  );
}

const cancelDialog = () => (
  <DialogFrame>
    <CancelSubscriptionDialog onClose={fn()} />
  </DialogFrame>
);

const findDialog = (name: string) => screen.findByRole('dialog', { name });

const addon = (addonSlug: string, quantity: number): InstanceAddon => ({
  addonId: `id-${addonSlug}`,
  addonSlug,
  attachedAt: '2027-02-20T00:00:00.000Z',
  familySlug: 'extras',
  id: `attachment-${addonSlug}`,
  name: addonSlug,
  prices: [],
  quantity,
});

// By default a cancellation waits for the end of the period: the dialog says when
// the subscription ends, that the period is paid for, and what the last invoice bills.
export const CancelAtTheEndOfThePeriod: Story = {
  parameters: { msw: { handlers: handlersFor(subscription()) } },
  render: cancelDialog,
  play: async () => {
    const dialog = await findDialog('Cancel the subscription of Acme Production');
    const explanation = await within(dialog).findByTestId('cancel-explanation');

    await expect(explanation).toHaveTextContent('The subscription ends on Mar 15, 2027');
    await expect(explanation).toHaveTextContent('You can reactivate the subscription');
    await expect(
      within(dialog).getByRole('button', { name: 'Cancel subscription' }),
    ).toBeEnabled();
  },
};

// Ending it now cannot be undone: the explanation is a warning, the final invoice is
// said to be issued at once with nothing prorated or refunded, and the button is red.
export const CancelImmediately: Story = {
  parameters: { msw: { handlers: handlersFor(subscription()) } },
  render: cancelDialog,
  play: async () => {
    const dialog = await findDialog('Cancel the subscription of Acme Production');

    await userEvent.click(await within(dialog).findByRole('combobox', { name: /When/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Immediately' }));
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());

    await expect(within(dialog).getByTestId('cancel-explanation')).toHaveTextContent(
      'This cannot be undone',
    );
  },
};

// A trial has no choice of when: it ends at once, and nothing is billed.
export const CancelATrial: Story = {
  parameters: {
    msw: {
      handlers: handlersFor(
        subscription({
          currentPeriodEnd: '2027-03-20T00:00:00.000Z',
          status: 'TRIAL',
          trialEndsAt: '2027-03-20T00:00:00.000Z',
        }),
      ),
    },
  },
  render: cancelDialog,
  play: async () => {
    const dialog = await findDialog('Cancel the subscription of Acme Production');

    await expect(await within(dialog).findByRole('button', { name: 'End the trial' })).toBeInTheDocument();
    await expect(within(dialog).queryByRole('combobox', { name: /When/ })).toBeNull();
    await expect(within(dialog).getByTestId('cancel-explanation')).toHaveTextContent(
      'Nothing is billed',
    );
  },
};

// The two things a cancellation does not do by itself, offered beside it and unchecked.
export const CancelBesideTheCancellation: Story = {
  parameters: {
    msw: {
      handlers: handlersFor(
        subscription(),
        handleListInstanceAddons({ body: [addon('extra-seats-v1', 5), addon('connector-v2', 1)] }),
      ),
    },
  },
  render: cancelDialog,
  play: async () => {
    const dialog = await findDialog('Cancel the subscription of Acme Production');
    const removeAddons = await within(dialog).findByRole('checkbox', {
      name: 'Also remove the add-ons',
    });

    await waitFor(() => expect(removeAddons).toBeEnabled());
    await expect(removeAddons).not.toBeChecked();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Also set the license end date' }));
    await expect(await within(dialog).findByLabelText('License ends (UTC)')).toBeInTheDocument();
  },
};

// A period that is being closed is not an error: the dialog says so, and sends the
// request again by itself.
export const CancelWhileThePeriodIsClosing: Story = {
  parameters: {
    msw: {
      handlers: handlersFor(
        subscription(),
        handleCancelSubscription(() =>
          HttpResponse.json(
            {
              code: 'CancelSubscription.BoundaryPending',
              detail: 'the period has ended and is being closed; retry in a minute',
              status: 409,
            },
            { status: 409 },
          ),
        ),
      ),
    },
  },
  render: cancelDialog,
  play: async () => {
    const dialog = await findDialog('Cancel the subscription of Acme Production');

    await userEvent.click(await within(dialog).findByRole('button', { name: 'Cancel subscription' }));

    await expect(await within(dialog).findByTestId('boundary-closing')).toHaveTextContent(
      'Closing the period',
    );
  },
};

// Once accepted, the dialog says what it did, and what became of each thing asked
// beside it: the add-ons that went, the one that stayed, the end of the license.
export const CancelWithAFollowUpThatFailed: Story = {
  parameters: {
    msw: {
      handlers: handlersFor(
        subscription(),
        handleListInstanceAddons({ body: [addon('extra-seats-v1', 5), addon('connector-v2', 1)] }),
        handleCancelSubscription({ body: { ...subscription(), cancelAtPeriodEnd: true } as never }),
        handleDetachInstanceAddon(({ params }) =>
          params.addonSlug === 'connector-v2'
            ? HttpResponse.json(
                {
                  code: 'DetachInstanceAddon.Locked',
                  detail: 'the subscription is being closed',
                  status: 409,
                },
                { status: 409 },
              )
            : new HttpResponse(null, { status: 204 }),
        ),
        handleUpdateInstance({ body: instance as never }),
      ),
    },
  },
  render: cancelDialog,
  play: async () => {
    const dialog = await findDialog('Cancel the subscription of Acme Production');
    const removeAddons = await within(dialog).findByRole('checkbox', {
      name: 'Also remove the add-ons',
    });
    await waitFor(() => expect(removeAddons).toBeEnabled());

    await userEvent.click(removeAddons);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel subscription' }));

    const report = await within(dialog).findByTestId('cancel-follow-ups');
    await expect(report).toHaveTextContent('Add-ons removed: extra-seats-v1.');
    await expect(report).toHaveTextContent('connector-v2 could not be removed.');
    await expect(within(report).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  },
};

const BUSINESS_V4 = buildLicense({
  description: 'Enterprise',
  familyId: 'family-enterprise',
  id: 'license-enterprise-4',
  lifecycleState: 'PUBLISHED',
  name: 'Enterprise',
  slug: 'enterprise-v4',
  type: 'PAID',
  version: '4',
});
const STARTER = buildLicense({
  description: 'Starter',
  familyId: 'family-starter',
  id: 'license-starter-1',
  lifecycleState: 'PUBLISHED',
  name: 'Starter',
  slug: 'starter-v1',
  type: 'PAID',
  version: '1',
});

const ENTERPRISE_V4_MONTHLY = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Enterprise, monthly',
  id: 'price-enterprise-4-monthly',
  unitAmountDecimal: '59900',
});
const STARTER_EUR = buildPrice({
  billingPeriod: 'MONTHLY',
  currency: 'EUR',
  displayLabel: 'Starter, monthly',
  id: 'price-starter-eur',
  unitAmountDecimal: '9900',
});

const planHandlers = [
  storyLicensePricesHandler([BUSINESS_V4, STARTER], {
    'enterprise-v4': [ENTERPRISE_V4_MONTHLY],
    'starter-v1': [STARTER_EUR],
  }),
];

const planChangeDialog = () => (
  <DialogFrame>
    <SchedulePlanChangeDialog onClose={fn()} />
  </DialogFrame>
);

// The plans a subscription can move to are the active flat fees of the versions on
// sale; one in another currency is listed and cannot be chosen, and says why.
export const ChangePlan: Story = {
  parameters: { msw: { handlers: handlersFor(subscription(), ...planHandlers) } },
  render: planChangeDialog,
  play: async () => {
    const dialog = await findDialog('Change the plan of Acme Production');

    await expect(await within(dialog).findByTestId('plan-change-timeline')).toHaveTextContent(
      'The change takes effect on Mar 15, 2027 (UTC)',
    );
    await userEvent.click(await within(dialog).findByRole('combobox', { name: /New plan/ }));

    const other = await screen.findByRole('option', { name: /Starter, monthly/ });
    await expect(other).toHaveAttribute('aria-disabled', 'true');
    await expect(other).toHaveTextContent('Different currency (EUR)');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  },
};

// A change that is already scheduled is said first, and can be dropped: choosing
// another plan replaces it.
export const ChangePlanAlreadyScheduled: Story = {
  parameters: {
    msw: {
      handlers: handlersFor(
        subscription({
          scheduledChange: {
            effectiveAt: '2027-03-15T00:00:00.000Z',
            price: ENTERPRISE_V4_MONTHLY,
            scheduledAt: '2027-03-01T00:00:00.000Z',
          },
        }),
        ...planHandlers,
      ),
    },
  },
  render: planChangeDialog,
  play: async () => {
    const dialog = await findDialog('Change the plan of Acme Production');
    const summary = await within(dialog).findByTestId('plan-change-scheduled');

    await waitFor(() =>
      expect(summary).toHaveTextContent('A change to Enterprise v4 ($599.00/month) is already scheduled'),
    );
    await expect(within(summary).getByRole('button', { name: 'Cancel the change' })).toBeInTheDocument();
  },
};

// A plan cannot change during a trial: the dialog says what to do instead.
export const ChangePlanDuringATrial: Story = {
  parameters: {
    msw: {
      handlers: handlersFor(
        subscription({
          currentPeriodEnd: '2027-03-20T00:00:00.000Z',
          status: 'TRIAL',
          trialEndsAt: '2027-03-20T00:00:00.000Z',
        }),
        ...planHandlers,
      ),
    },
  },
  render: planChangeDialog,
  play: async () => {
    await expect(await screen.findByTestId('plan-change-unavailable')).toHaveTextContent(
      'A plan cannot change during a trial.',
    );
  },
};

const termsDialog = () => (
  <DialogFrame>
    <PaymentTermsDialog onClose={fn()} />
  </DialogFrame>
);

// The terms of the organization apply: the field is empty, and its placeholder says
// what that comes to. The change takes effect on the next invoice.
export const PaymentTermsOfTheOrganization: Story = {
  parameters: { msw: { handlers: handlersFor(subscription()) } },
  render: termsDialog,
  play: async () => {
    const dialog = await findDialog('Payment terms of Acme Production');

    await expect(await within(dialog).findByTestId('payment-terms-current')).toHaveTextContent(
      'the default of your organization',
    );
    await expect(await within(dialog).findByPlaceholderText('Organization default: 30')).toBeInTheDocument();
  },
};

// A contract with terms of its own: they are shown, and the way back to the
// organization's is offered.
export const PaymentTermsOfTheContract: Story = {
  parameters: { msw: { handlers: handlersFor(subscription({ daysUntilDueOverride: 45 })) } },
  render: termsDialog,
  play: async () => {
    const dialog = await findDialog('Payment terms of Acme Production');

    await expect(await within(dialog).findByTestId('payment-terms-current')).toHaveTextContent(
      'the terms of this contract',
    );
    await expect(
      within(dialog).getByRole('button', { name: 'Use organization default' }),
    ).toBeInTheDocument();
  },
};
