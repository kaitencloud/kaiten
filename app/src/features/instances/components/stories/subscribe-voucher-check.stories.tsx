import type { Meta, StoryObj } from '@storybook/react-vite';
import { HttpResponse, type RequestHandler } from 'msw';
import type { ReactNode } from 'react';
import { expect, screen, userEvent, within } from 'storybook/test';
import type { Validity } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleGetBillingSettings,
  handleGetInstanceBilling,
  handleListAddonCompatibility,
  handleListAddons,
  handleListInstanceAddons,
  handleListLicenseFamilies,
  handleListLicensePrices,
  handleValidateVoucher,
} from '@/api-client/msw.gen';
import {
  billingCapabilitiesProfiles,
  buildPrice,
  buildVoucher,
} from '@/test-fixtures/storybook-billing-fixtures';
import { storyInstances } from '@/test-fixtures/storybook-fixtures';
import {
  instanceDetailHandlers,
  onePage,
} from '@/test-fixtures/storybook-handlers';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { InstanceDetailProvider } from '../instance-detail/instance-detail-context';
import { SubscribeInstanceDialog } from '../instance-detail/tabs/billing/subscribe/subscribe-instance-dialog';

const meta = {
  title: 'Features/Instances/SubscribeVoucherCheck',
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
const ANNUAL = buildPrice({
  billingPeriod: 'ANNUAL',
  displayLabel: 'Enterprise, annual',
  displayOrder: 1,
  id: 'price-enterprise-annual',
  unitAmountDecimal: '499000',
});
const LAUNCH = buildVoucher({
  code: 'LAUNCH-20-OFF',
  duration: 'REPEATING',
  durationInPeriods: 3,
  id: 'voucher-launch',
  name: 'Launch discount',
  priceDiscountValue: '20',
});

/**
 * An instance nobody bills yet, in a release that ships vouchers, and what the code is
 * checked against: the verdict the story gives. The first handler that matches answers.
 */
const handlersFor = (check: RequestHandler): RequestHandler[] => [
  check,
  handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stackWithVouchers() }),
  handleGetInstanceBilling(() =>
    HttpResponse.json(
      { code: 'GetInstanceBilling.NotFound', detail: 'No subscription', status: 404 },
      { status: 404 },
    ),
  ),
  handleListInstanceAddons({ body: [] }),
  handleListAddons(onePage([])),
  handleListLicenseFamilies(onePage([])),
  handleListAddonCompatibility({ body: { familySlugs: [] } }),
  handleListLicensePrices({ body: [MONTHLY, ANNUAL] }),
  handleGetBillingSettings({
    body: {
      defaultCollectionMethod: 'SEND_INVOICE',
      defaultDaysUntilDue: 30,
      handoffStripeInvoices: false,
    },
  }),
  ...instanceDetailHandlers,
];

function Frame({ children }: { children: ReactNode }) {
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

const render = () => (
  <Frame>
    <SubscribeInstanceDialog onClose={() => {}} />
  </Frame>
);

async function typeAndCheck() {
  const dialog = await screen.findByRole('dialog', { name: 'Subscribe Acme Production' });

  await userEvent.type(await within(dialog).findByLabelText(/^Voucher code/), 'launch-20-off');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Check the code' }));

  return dialog;
}

// The code is checked against the price chosen before the subscription is sent: the verdict is
// the offer it makes, as the dialog that applies a code shows it, and nothing is redeemed.
export const CodeThatCanBeRedeemed: Story = {
  parameters: {
    msw: {
      handlers: handlersFor(
        handleValidateVoucher({ body: { valid: true, voucher: LAUNCH } as Validity }),
      ),
    },
  },
  render,
  play: async () => {
    const dialog = await typeAndCheck();
    const verdict = await within(dialog).findByTestId('redeem-verdict-valid');

    await expect(verdict).toHaveTextContent('Launch discount can be redeemed');
    await expect(verdict).toHaveTextContent('The subscription checks it again when it starts.');
  },
};

// A code the price does not suit says which condition it breaks.
export const CodeThatDoesNotSuitThePrice: Story = {
  parameters: {
    msw: {
      handlers: handlersFor(
        handleValidateVoucher({
          body: {
            reason: 'NOT_ELIGIBLE',
            rule: 'ANNUAL_ONLY',
            valid: false,
            voucher: LAUNCH,
          } as Validity,
        }),
      ),
    },
  },
  render,
  play: async () => {
    const dialog = await typeAndCheck();
    const verdict = await within(dialog).findByTestId('redeem-verdict-invalid');

    await expect(verdict).toHaveTextContent('This code cannot be redeemed');
  },
};

// The API limits the codes checked to sixty a minute: a refusal that is temporary, said so,
// with a way to ask again. The subscription is not kept from being sent.
export const CheckLimited: Story = {
  parameters: {
    msw: {
      handlers: handlersFor(
        handleValidateVoucher(() =>
          HttpResponse.json(
            {
              code: 'ValidateVoucher.RateLimited',
              detail: 'too many voucher codes checked: try again later',
              status: 429,
            },
            { status: 429 },
          ),
        ),
      ),
    },
  },
  render,
  play: async () => {
    const dialog = await typeAndCheck();
    const alert = await within(dialog).findByRole('alert');

    await expect(alert).toHaveTextContent('too many voucher codes checked: try again later');
    await expect(alert).toHaveTextContent('This is temporary: try again in a minute.');
    await expect(within(alert).getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(within(dialog).getByRole('button', { name: 'Subscribe' })).toBeEnabled();
  },
};
