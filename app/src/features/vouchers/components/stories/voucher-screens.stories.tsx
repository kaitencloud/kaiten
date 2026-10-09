import type { Meta, StoryObj } from '@storybook/react-vite';
import type { RequestHandler } from 'msw';
import { type ReactNode, Suspense } from 'react';
import { expect, screen, userEvent, within } from 'storybook/test';
import type { Customer, Entitlement, License, Voucher } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleGetLicenses,
  handleGetVoucher,
  handleListAddons,
  handleListCustomers,
  handleListEntitlements,
  handleListVoucherRedemptions,
} from '@/api-client/msw.gen';
import {
  billingCapabilitiesProfiles,
  buildEntitlement,
  buildRedemption,
  buildVoucher,
} from '@/test-fixtures/storybook-billing-fixtures';
import { onePage } from '@/test-fixtures/storybook-handlers';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { VoucherDetailPage } from '../pages/voucher-detail-page';
import { VoucherWizardPage } from '../pages/voucher-wizard-page';

const meta = {
  title: 'Features/Vouchers/Screens',
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const WELCOME = buildVoucher({
  code: 'WELCOME-SPRING-2027',
  description: 'Twenty percent off the base price for the first three invoices',
  duration: 'REPEATING',
  durationInPeriods: 3,
  id: 'voucher-welcome',
  maxRedemptions: 100,
  name: 'Welcome spring',
  priceAppliesTo: 'LICENSE_BASE',
  priceDiscountType: 'PERCENTAGE',
  priceDiscountValue: '20',
  redemptionsCount: 2,
});
const BOOST = buildVoucher({
  code: 'LAUNCH-BOOST-50K',
  duration: 'ONE_TIME',
  grants: [
    { entitlementSlug: 'tokens', modifierType: 'ADD', modifierValue: '50000' },
  ],
  id: 'voucher-boost',
  maxRedemptions: 5,
  name: 'Launch boost',
  voucherType: 'ENTITLEMENT_BOOST',
});
const DRAFT = buildVoucher({
  code: 'SUMMER-SALE-2027',
  currency: 'USD',
  id: 'voucher-draft',
  name: 'Summer sale',
  priceAppliesTo: 'BOTH',
  priceDiscountType: 'FIXED_AMOUNT',
  priceDiscountValue: '2500',
  status: 'DRAFT',
});
const ARCHIVED = buildVoucher({
  code: 'BLACK-FRIDAY-2025',
  id: 'voucher-archived',
  name: 'Black Friday 2025',
  priceDiscountValue: '15',
  status: 'ARCHIVED',
});

const REDEMPTIONS = [
  buildRedemption({
    applicationsCount: 1,
    applicationsMax: 3,
    id: 'redemption-annual',
    instanceSlug: 'initech-annual',
    redeemedAt: '2026-03-01T10:00:00.000Z',
    voucher: WELCOME,
  }),
  buildRedemption({
    applicationsCount: 3,
    applicationsMax: 3,
    expiredAt: '2026-06-01T10:00:00.000Z',
    id: 'redemption-hooli',
    instanceSlug: 'hooli-starter',
    redeemedAt: '2026-01-05T09:30:00.000Z',
    status: 'EXPIRED',
    voucher: WELCOME,
  }),
  buildRedemption({
    id: 'redemption-revoked',
    instanceSlug: 'globex-staging',
    redeemedAt: '2026-02-05T09:30:00.000Z',
    revokedAt: '2026-02-06T09:30:00.000Z',
    revokedReason: 'Redeemed by the wrong instance',
    status: 'REVOKED',
    voucher: WELCOME,
  }),
];

const ENTITLEMENTS: Entitlement[] = [
  buildEntitlement({ name: 'Tokens', slug: 'tokens', type: 'NUMBER' }),
  buildEntitlement({
    name: 'AI credits',
    slug: 'ai-credits',
    type: 'NUMBER_AI_CREDIT',
  }),
  buildEntitlement({ name: 'SSO', slug: 'sso', type: 'BOOLEAN' }),
  buildEntitlement({ name: 'Theme', slug: 'theme', type: 'CONFIG' }),
];
const CUSTOMERS = [
  { id: 'c-1', name: 'Hooli', slug: 'hooli' },
  { id: 'c-2', name: 'Initech', slug: 'initech' },
] as unknown as Customer[];
const LICENSES = [
  {
    id: 'license-pro',
    lifecycleState: 'PUBLISHED',
    name: 'Pro',
    slug: 'pro-v2',
    version: 2,
  },
] as unknown as License[];

/** What the screens read of the organization, and of the voucher they show. */
const handlersFor = (voucher?: Voucher): RequestHandler[] => [
  handleGetBillingCapabilities({
    body: billingCapabilitiesProfiles.stackWithVouchers(),
  }),
  handleListCustomers(onePage(CUSTOMERS)),
  handleGetLicenses(onePage(LICENSES)),
  handleListAddons({ body: [] }),
  handleListEntitlements(onePage(ENTITLEMENTS)),
  ...(voucher
    ? [
        handleGetVoucher({ body: voucher }),
        handleListVoucherRedemptions({
          body: voucher.id === WELCOME.id ? REDEMPTIONS : [],
        }),
      ]
    : []),
];

function Frame({
  children,
  path,
}: {
  children: ReactNode;
  path: string;
}) {
  return (
    <StorybookRouter initialEntries={[path]}>
      <Suspense fallback={null}>{children}</Suspense>
    </StorybookRouter>
  );
}

const nextButton = () => screen.findByRole('button', { name: /^Next/ });

// The first step of the wizard: the two kinds the release ships, the two that come later
// shown disabled, and the name every voucher needs before it goes on.
export const WizardKinds: Story = {
  parameters: { msw: { handlers: handlersFor() } },
  render: () => (
    <Frame path="/vouchers/new">
      <VoucherWizardPage />
    </Frame>
  ),
  play: async () => {
    await expect(
      await screen.findByRole('button', { name: /^Discount/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      screen.getByRole('button', { name: /^Boost/ }),
    ).toHaveAttribute('aria-pressed', 'false');
    for (const later of ['Feature grant', 'Bundle']) {
      await expect(
        screen.getByRole('button', { name: new RegExp(`^${later}`) }),
      ).toHaveAttribute('aria-disabled', 'true');
    }

    await userEvent.click(await nextButton());

    await expect(await screen.findByText('Enter a name')).toBeVisible();
  },
};

// The offer of a boost: a change to add, and only the entitlements that carry a number
// to choose among.
export const WizardBoostOffer: Story = {
  parameters: { msw: { handlers: handlersFor() } },
  render: () => (
    <Frame path="/vouchers/new">
      <VoucherWizardPage />
    </Frame>
  ),
  play: async () => {
    await userEvent.click(await screen.findByRole('button', { name: /^Boost/ }));
    await userEvent.type(await screen.findByLabelText(/^Name/), 'More tokens');
    await userEvent.click(await nextButton());
    await userEvent.click(
      await screen.findByRole('button', { name: /Add a change/ }),
    );

    await userEvent.click(
      await screen.findByRole('button', { name: /Choose an entitlement/ }),
    );
    const offered = (await screen.findAllByRole('option')).map((option) =>
      option.textContent?.trim(),
    );
    await expect(offered.sort()).toEqual(['AI credits', 'Tokens']);
  },
};

// The last step of a discount: the voucher in plain language, one sentence a line, and
// the choice between keeping a draft and publishing.
export const WizardReview: Story = {
  parameters: { msw: { handlers: handlersFor() } },
  render: () => (
    <Frame path="/vouchers/new">
      <VoucherWizardPage />
    </Frame>
  ),
  play: async () => {
    await userEvent.type(await screen.findByLabelText(/^Name/), 'Spring');
    await userEvent.click(await nextButton());
    await userEvent.type(await screen.findByLabelText(/^Percentage/), '20');
    await userEvent.click(await nextButton());
    await userEvent.click(await nextButton());

    const review = await screen.findByTestId('voucher-review');
    await expect(review).toHaveTextContent('20% off the base price, on one invoice.');
    await expect(
      screen.getByRole('button', { name: 'Save as a draft' }),
    ).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Publish' })).toBeVisible();
  },
};

// A published discount: its code to copy, what it does in plain language and the
// instances that redeemed it, with the state of each redemption.
export const DetailOfADiscount: Story = {
  parameters: { msw: { handlers: handlersFor(WELCOME) } },
  render: () => (
    <Frame path="/vouchers/voucher-welcome">
      <VoucherDetailPage voucherId="voucher-welcome" />
    </Frame>
  ),
  play: async () => {
    await expect(await screen.findByTestId('voucher-code')).toHaveValue(
      'WELCOME-SPRING-2027',
    );
    await expect(screen.getByTestId('voucher-summary')).toHaveTextContent(
      '20% off the base price, on the next 3 invoices.',
    );
    const table = await screen.findByRole('table');
    await expect(within(table).getByText('initech-annual')).toBeVisible();
    await expect(
      within(table).getByText('Revoked: Redeemed by the wrong instance'),
    ).toBeVisible();
    await expect(
      await screen.findByRole('link', { name: 'Add a boost' }),
    ).toBeVisible();
  },
};

// A boost: its changes in words, counted in billing periods, and no way to add a boost to it.
export const DetailOfABoost: Story = {
  parameters: { msw: { handlers: handlersFor(BOOST) } },
  render: () => (
    <Frame path="/vouchers/voucher-boost">
      <VoucherDetailPage voucherId="voucher-boost" />
    </Frame>
  ),
  play: async () => {
    await expect(await screen.findByTestId('voucher-summary')).toHaveTextContent(
      'Tokens + 50,000, for one billing period.',
    );
    await expect(
      screen.queryByRole('link', { name: 'Add a boost' }),
    ).not.toBeInTheDocument();
  },
};

// A draft is finished where it was made, published, or archived; it has no redemptions.
export const DetailOfADraft: Story = {
  parameters: { msw: { handlers: handlersFor(DRAFT) } },
  render: () => (
    <Frame path="/vouchers/voucher-draft">
      <VoucherDetailPage voucherId="voucher-draft" />
    </Frame>
  ),
  play: async () => {
    await expect(
      await screen.findByRole('button', { name: 'Publish' }),
    ).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Archive' })).toBeVisible();
    await expect(
      await screen.findByText('No instance has redeemed this voucher yet.'),
    ).toBeVisible();
  },
};

// An archived voucher can only be read.
export const DetailOfAnArchivedVoucher: Story = {
  parameters: { msw: { handlers: handlersFor(ARCHIVED) } },
  render: () => (
    <Frame path="/vouchers/voucher-archived">
      <VoucherDetailPage voucherId="voucher-archived" />
    </Frame>
  ),
  play: async () => {
    await expect(await screen.findByTestId('voucher-code')).toHaveValue(
      'BLACK-FRIDAY-2025',
    );
    for (const action of ['Publish', 'Archive']) {
      await expect(
        screen.queryByRole('button', { name: action }),
      ).not.toBeInTheDocument();
    }
  },
};
