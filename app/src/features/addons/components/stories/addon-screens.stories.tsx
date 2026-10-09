import type { Meta, StoryObj } from '@storybook/react-vite';
import { HttpResponse, type RequestHandler } from 'msw';
import { type ReactNode, Suspense } from 'react';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';
import type {
  Addon,
  AddonFamily,
  AddonEntitlement,
  Entitlement,
  LicenseFamilyView,
  Price,
} from '@/api-client';
import {
  handleAssignAddonEntitlement,
  handleGetAddon,
  handleGetBillingCapabilities,
  handleListAddonCompatibility,
  handleListAddonEntitlements,
  handleListAddonFamilies,
  handleListAddonPrices,
  handleListEntitlements,
  handleListLicenseFamilies,
} from '@/api-client/msw.gen';
import {
  billingCapabilitiesProfiles,
  buildAddon,
  buildAddonGrant,
  buildPrice,
} from '@/test-fixtures/storybook-billing-fixtures';
import { onePage } from '@/test-fixtures/storybook-handlers';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { AddonCompatibilityTab } from '../compatibility';
import { AddonGrantsTab } from '../grants';
import { AddonPricesTab } from '../prices';

const meta = {
  title: 'Features/Addons/Screens',
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const SEATS_V1 = buildAddon({
  description: 'Five more named users a unit',
  familySlug: 'extra-seats',
  isDefault: true,
  maxQuantity: 10,
  name: 'Extra seats',
  slug: 'extra-seats',
  versionName: '2026',
});
const SEATS_V2 = buildAddon({
  description: 'Five more named users a unit, and more calls',
  familySlug: 'extra-seats',
  lifecycleState: 'DRAFT',
  maxQuantity: 20,
  name: 'Extra seats',
  slug: 'extra-seats-v2',
  version: 2,
  versionName: '2027',
});
const STORAGE_V1 = buildAddon({
  familySlug: 'extra-storage',
  lifecycleState: 'ARCHIVED',
  name: 'Extra storage',
  slug: 'extra-storage',
  versionName: '2025',
});

const family = (slug: string, versions: Addon[], isPublic = false): AddonFamily => ({
  currentVersion: versions.find((version) => version.isDefault),
  id: `addon-family-${slug}`,
  isPublic,
  lastVersion: Math.max(...versions.map(({ version }) => version)),
  slug,
  versions: [...versions].sort((left, right) => right.version - left.version),
});

const ENTITLEMENTS: Entitlement[] = [
  {
    aggregationMethod: 'LATEST',
    createdAt: '2026-01-01T00:00:00.000Z',
    description: null,
    id: 'entitlement-seats',
    name: 'Seats',
    slug: 'seats',
    type: 'NUMBER',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    aggregationMethod: 'SUM',
    createdAt: '2026-01-01T00:00:00.000Z',
    description: null,
    id: 'entitlement-api-calls',
    name: 'API Calls',
    resetAnchor: 'CALENDAR',
    resetPeriod: 'MONTH',
    slug: 'api-calls',
    type: 'NUMBER',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];
const FAMILIES: LicenseFamilyView[] = ['starter', 'business', 'enterprise'].map((slug) => ({
  createdAt: '2026-01-01T00:00:00.000Z',
  id: `family-${slug}`,
  isPublic: false,
  slug,
  updatedAt: '2026-01-01T00:00:00.000Z',
  versionCount: 1,
}));
const SEATS_GRANT: AddonEntitlement = buildAddonGrant({
  addonSlug: 'extra-seats-v2',
  behavior: 'ADD',
  entitlementSlug: 'seats',
  value: 5,
});
const MONTHLY: Price = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Extra seat, monthly',
  id: 'price-seats-monthly',
  isDefault: true,
  unitAmountDecimal: '1200',
});

/** What the screens of the catalogue read. What a story adds comes first, since the first handler that matches answers. */
const handlersFor = (...more: RequestHandler[]): RequestHandler[] => [
  ...more,
  handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stackWithAddons() }),
  handleGetAddon(({ params }) =>
    HttpResponse.json([SEATS_V1, SEATS_V2, STORAGE_V1].find(({ slug }) => slug === params.addonSlug)),
  ),
  handleListAddonFamilies({
    body: [
      family('extra-seats', [SEATS_V1, SEATS_V2], true),
      family('extra-storage', [STORAGE_V1]),
    ],
  }),
  handleListEntitlements(onePage(ENTITLEMENTS)),
  handleListLicenseFamilies(onePage(FAMILIES)),
  handleListAddonEntitlements({ body: [SEATS_GRANT] }),
  handleListAddonPrices({ body: [MONTHLY] }),
  handleListAddonCompatibility({ body: { familySlugs: ['starter', 'business'] } }),
];

function Frame({ children }: { children: ReactNode }) {
  return (
    <StorybookRouter initialEntries={['/addons/extra-seats-v2']}>
      <Suspense fallback={null}>
        <div className="p-6">{children}</div>
      </Suspense>
    </StorybookRouter>
  );
}

// What a version grants per unit, and how it combines with the license's grant.
export const Grants: Story = {
  parameters: { msw: { handlers: handlersFor() } },
  render: () => (
    <Frame>
      <AddonGrantsTab addonSlug="extra-seats-v2" />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Seats')).toBeVisible();
    await expect(canvas.getByText('Add')).toBeVisible();
    // The scopes of the session are read first: the action is there once they are.
    await expect(await canvas.findByRole('link', { name: 'Add entitlement' })).toBeVisible();
  },
};

// A version an instance with a live subscription holds cannot change what it sells:
// the refusal leads to a new version.
export const GrantOfAFrozenVersion: Story = {
  parameters: {
    msw: {
      handlers: handlersFor(
        handleAssignAddonEntitlement(() =>
          HttpResponse.json(
            {
              code: 'AssignAddonEntitlement.BillingActive',
              detail: 'an instance with a live subscription holds this add-on version',
              status: 409,
            },
            { status: 409 },
          ),
        ),
      ),
    },
  },
  render: () => (
    <Frame>
      <AddonGrantsTab addonSlug="extra-seats-v2" grantParam="new" />
    </Frame>
  ),
  play: async () => {
    await expect(
      await screen.findByRole('dialog', { name: /Add an entitlement|New grant|Add/ }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  },
};

// What a version is sold for: a slot for each period it can be attached to a
// subscription of, and one with no default price says so.
export const Prices: Story = {
  parameters: { msw: { handlers: handlersFor() } },
  render: () => (
    <Frame>
      <AddonPricesTab addonSlug="extra-seats-v2" />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const slots = await canvas.findByRole('region', { name: /billing periods|Periods|period/i });

    await expect(within(slots).getByText('$12.00/month')).toBeVisible();
    await expect(slots.querySelector('[data-period="ANNUAL"]')).toHaveAttribute('data-status', 'missing');
  },
};

// A version that fits no license family can be attached to nothing, and the tab says so.
export const CompatibilityOfNothing: Story = {
  parameters: {
    msw: { handlers: handlersFor(handleListAddonCompatibility({ body: { familySlugs: [] } })) },
  },
  render: () => (
    <Frame>
      <AddonCompatibilityTab addonSlug="extra-seats-v2" />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    for (const family of ['starter', 'business', 'enterprise']) {
      await expect(await canvas.findByRole('checkbox', { name: new RegExp(family) })).not.toBeChecked();
    }
  },
};

// The families a version fits, ticked: Business and Starter, not Enterprise.
export const CompatibilityOfTwoFamilies: Story = {
  parameters: { msw: { handlers: handlersFor() } },
  render: () => (
    <Frame>
      <AddonCompatibilityTab addonSlug="extra-seats-v2" />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole('checkbox', { name: /starter/i })).toBeChecked();
    await expect(canvas.getByRole('checkbox', { name: /enterprise/i })).not.toBeChecked();
    await userEvent.tab();
  },
};
