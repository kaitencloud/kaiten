import type { Meta, StoryObj } from '@storybook/react-vite';
import { HttpResponse, type RequestHandler } from 'msw';
import type { ReactNode } from 'react';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';
import type { InstanceAddon, InstanceBilling, LicenseFamilyView } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleGetBillingSettings,
  handleGetInstanceBilling,
  handleListAddonCompatibility,
  handleListAddonPrices,
  handleListAddons,
  handleListInstanceAddons,
  handleListLicenseFamilies,
  handleListLicensePrices,
  handleSetInstanceAddonQuantity,
} from '@/api-client/msw.gen';
import {
  billingCapabilitiesProfiles,
  buildAddon,
  buildInstanceAddon,
  buildPrice,
  buildSubscription,
} from '@/test-fixtures/storybook-billing-fixtures';
import { storyInstances } from '@/test-fixtures/storybook-fixtures';
import {
  instanceDetailHandlers,
  onePage,
} from '@/test-fixtures/storybook-handlers';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { InstanceDetailProvider } from '../instance-detail/instance-detail-context';
import { InstanceAddonsCard } from '../instance-detail/tabs/billing/addons/instance-addons-card';
import { AttachAddonDialog } from '../instance-detail/tabs/billing/addons/attach-addon-dialog';
import { SubscribeInstanceDialog } from '../instance-detail/tabs/billing/subscribe/subscribe-instance-dialog';

// The day the stories are read, so that the dates they show are the same on every run.
const NOW = Date.parse('2027-03-10T12:00:00.000Z');

const meta = {
  title: 'Features/Instances/BillingAddonsScreens',
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

const SEATS = buildAddon({
  description: 'Five more named users a unit',
  familySlug: 'extra-seats',
  maxQuantity: 3,
  name: 'Extra seats',
  slug: 'extra-seats-v1',
  versionName: '2026',
});
const STORAGE = buildAddon({
  description: 'More disk space for the files of an instance',
  familySlug: 'extra-storage',
  maxQuantity: 20,
  name: 'Extra storage',
  slug: 'extra-storage-v1',
  versionName: '2026',
});
const SEATS_MONTHLY = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Extra seat, monthly',
  id: 'price-seats-monthly',
  isDefault: true,
  unitAmountDecimal: '1000',
});
const STORAGE_MONTHLY = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Extra storage, monthly',
  id: 'price-storage-monthly',
  isDefault: true,
  unitAmountDecimal: '800',
});
const HELD_SEATS: InstanceAddon = buildInstanceAddon({
  addon: SEATS,
  attachedAt: '2027-02-08T00:00:00.000Z',
  id: 'attachment-seats',
  prices: [SEATS_MONTHLY],
  quantity: 2,
});
// The license of the story instance belongs to this family.
const ENTERPRISE_FAMILY: LicenseFamilyView = {
  createdAt: '2026-01-01T00:00:00.000Z',
  id: 'family-enterprise',
  isPublic: false,
  slug: 'enterprise',
  updatedAt: '2026-01-01T00:00:00.000Z',
  versionCount: 3,
};
const PLAN = buildPrice({
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
    basePrice: PLAN,
    currentPeriodEnd: '2027-03-15T00:00:00.000Z',
    currentPeriodStart: '2027-02-15T00:00:00.000Z',
    customerName: 'Acme Corp',
    customerSlug: 'acme-corp',
    instanceName: instance.name,
    instanceSlug: instance.slug,
    ...overrides,
  });

/**
 * Everything the add-ons of an instance read: its subscription, what it holds, the
 * catalogue and what each version fits. What a story adds comes first, since the first
 * handler that matches answers.
 */
const handlersFor = (
  held: InstanceAddon[],
  value: InstanceBilling | null,
  ...more: RequestHandler[]
): RequestHandler[] => [
  ...more,
  handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stackWithAddons() }),
  handleGetInstanceBilling(() =>
    value
      ? HttpResponse.json(value)
      : HttpResponse.json(
          { code: 'GetInstanceBilling.NotFound', detail: 'No subscription', status: 404 },
          { status: 404 },
        ),
  ),
  handleListInstanceAddons({ body: held }),
  handleListAddons({ body: [SEATS, STORAGE] }),
  handleListLicenseFamilies(onePage([ENTERPRISE_FAMILY])),
  handleListAddonCompatibility({ body: { familySlugs: ['enterprise'] } }),
  handleListAddonPrices(({ params }) =>
    HttpResponse.json(params.addonSlug === 'extra-storage-v1' ? [STORAGE_MONTHLY] : [SEATS_MONTHLY]),
  ),
  handleListLicensePrices({ body: [PLAN] }),
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
        <div className="p-6">{children}</div>
      </InstanceDetailProvider>
    </StorybookRouter>
  );
}

const card = (value: InstanceBilling | null) => (
  <Frame>
    <InstanceAddonsCard instanceSlug={instance.slug} subscription={value} />
  </Frame>
);

const noop = () => undefined;
const attachDialog = () => (
  <Frame>
    <AttachAddonDialog onClose={noop} />
  </Frame>
);

// What an instance holds, on its Billing tab: the version and its slug, a quantity
// stepped one unit at a time, what a unit costs by the period of the subscription,
// and the way to add another while the subscription is live.
export const HoldingAnAddon: Story = {
  parameters: { msw: { handlers: handlersFor([HELD_SEATS], subscription()) } },
  render: () => card(subscription()),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Extra seats · 2026')).toBeVisible();
    await expect(canvas.getByText('$10.00')).toBeVisible();
    // The scopes of the session are read first: the action is there once they are.
    await expect(await canvas.findByRole('link', { name: 'Add an add-on' })).toBeVisible();
    await expect(canvas.getByTestId('addons-note')).toHaveTextContent(
      'Entitlement changes now; billed from the next renewal; no proration or refund.',
    );
  },
};

export const HoldingNothing: Story = {
  parameters: { msw: { handlers: handlersFor([], subscription()) } },
  render: () => card(subscription()),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByTestId('instance-addons-empty'),
    ).toHaveTextContent('No add-on');
  },
};

// A subscription that ended keeps what the instance holds readable, and takes nothing more.
export const SubscriptionEnded: Story = {
  parameters: {
    msw: { handlers: handlersFor([HELD_SEATS], subscription({ status: 'CANCELED' })) },
  },
  render: () => card(subscription({ status: 'CANCELED' })),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByTestId('addons-not-live')).toBeVisible();
    await expect(canvas.queryByRole('link', { name: 'Add an add-on' })).toBeNull();
  },
};

// A quantity the API refuses shows the words it gave, and goes back to what it holds.
export const QuantityRefused: Story = {
  parameters: {
    msw: {
      handlers: handlersFor(
        [HELD_SEATS],
        subscription(),
        handleSetInstanceAddonQuantity(() =>
          HttpResponse.json(
            {
              code: 'SetInstanceAddonQuantity.QuantityExceedsMax',
              detail: 'this add-on allows at most 3 units',
              status: 422,
            },
            { status: 422 },
          ),
        ),
      ),
    },
  },
  render: () => card(subscription()),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      await canvas.findByRole('button', { name: 'One unit more of Extra seats · 2026' }),
    );

    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'this add-on allows at most 3 units',
    );
    await expect(canvas.getByTestId('quantity-value')).toHaveTextContent('2');
  },
};

// A period that is being closed is not an error: the card says so, and makes the
// change again by itself.
export const PeriodBeingClosed: Story = {
  parameters: {
    msw: {
      handlers: handlersFor(
        [HELD_SEATS],
        subscription(),
        handleSetInstanceAddonQuantity(() =>
          HttpResponse.json(
            {
              code: 'SetInstanceAddonQuantity.BoundaryPending',
              detail: 'the period has ended and is being closed; retry in a minute',
              status: 409,
            },
            { status: 409 },
          ),
        ),
      ),
    },
  },
  render: () => card(subscription()),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      await canvas.findByRole('button', { name: 'One unit more of Extra seats · 2026' }),
    );

    await expect(await canvas.findByTestId('boundary-closing')).toHaveTextContent(
      'Closing the period',
    );
  },
};

// The dialog that adds one: the versions on sale that fit the instance, of a family it
// holds none of, and what the subscription bills for a unit of the one chosen.
export const AddingAnAddon: Story = {
  parameters: { msw: { handlers: handlersFor([HELD_SEATS], subscription()) } },
  render: attachDialog,
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: 'Add an add-on to Acme Production' });

    await userEvent.click(await within(dialog).findByRole('combobox', { name: /Add-on/ }));
    const options = await screen.findAllByRole('option');
    await expect(options.map((option) => option.textContent)).toEqual(['Extra storage · 2026']);
    await userEvent.click(options[0]!);
    // An open list is not checked for accessibility: it is waited out.
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());

    await waitFor(() =>
      expect(within(dialog).getByTestId('attach-addon-details')).toHaveTextContent(
        '$8.00/month per unit, billed from the next renewal.',
      ),
    );
  },
};

// The subscription starts with the add-ons that were included, or not at all.
export const SubscribingWithAddons: Story = {
  parameters: { msw: { handlers: handlersFor([], null) } },
  render: () => (
    <Frame>
      <SubscribeInstanceDialog onClose={noop} />
    </Frame>
  ),
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: 'Subscribe Acme Production' });
    const addons = await within(dialog).findByTestId('subscribe-addons');

    await userEvent.click(within(addons).getByRole('checkbox', { name: 'Extra seats · 2026' }));

    await expect(
      await within(addons).findByRole('group', { name: 'Quantity of Extra seats · 2026' }),
    ).toBeInTheDocument();
  },
};
