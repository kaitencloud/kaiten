import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, within } from 'storybook/test';
import { DataTable } from '@/functionals/table';
import {
  getEntitlementsMetrics,
  type InstanceEntitlementRow,
} from '../../utils/instance-detail-entitlements.utils';
import { EntitlementsUsageCard } from '../instance-detail/tabs/entitlements/entitlements-usage-card';
import { useEntitlementsColumns } from '../instance-detail/tabs/entitlements/instance-detail-entitlements-columns';

const meta = {
  title: 'Features/Instances/EntitlementLimit',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const license = (value: number) => ({
  licenseEntitlementId: 'license-entitlement',
  limitCapExceededOveragePercent: null,
  value: { type: 'number' as const, value },
});

const row = (
  overrides: Partial<InstanceEntitlementRow> &
    Pick<InstanceEntitlementRow, 'entitlementName' | 'threshold' | 'value'>,
): InstanceEntitlementRow => ({
  currentPeriodEnd: null,
  currentPeriodStart: null,
  enabled: null,
  entitlementGroups: [],
  entitlementId: `ent-${overrides.entitlementName}`,
  entitlementSlug: overrides.entitlementName.toLowerCase(),
  entitlementType: 'NUMBER',
  limitCapExceededOveragePercent: 0,
  provenance: null,
  source: 'license',
  ...overrides,
});

// Traces: ten thousand from the license, three add-ons of a thousand each, doubled by a
// voucher. Requests: the license's grant, which nothing changes. Seats: granted only by
// an add-on. Storage: an add-on makes it unlimited.
const ROWS: InstanceEntitlementRow[] = [
  row({
    entitlementName: 'Traces',
    provenance: {
      addons: [
        {
          addonEntitlementId: 'addon-entitlement',
          addonId: 'addon',
          attachedAt: '2027-02-05T09:00:00.000Z',
          instanceAddonId: 'instance-addon',
          limitCapExceededOveragePercent: null,
          overrideBehavior: 'ADD',
          quantity: 3,
          value: { type: 'number', value: 1000 },
        },
      ],
      boosts: [
        {
          effectiveExpiresAt: null,
          effectiveStartsAt: '2027-02-06T09:00:00.000Z',
          instanceVoucherId: 'instance-voucher',
          modifierType: 'MULTIPLY',
          modifierValue: 2,
          redeemedAt: '2027-02-06T09:00:00.000Z',
          voucherEntitlementGrantId: 'grant',
          voucherId: 'voucher',
        },
      ],
      license: license(10000),
      number: {
        afterAddons: 13000,
        boostAdd: null,
        boostMultiply: 2,
        boostSet: null,
        effective: 26000,
        license: 10000,
        unlimited: false,
      },
    },
    threshold: 26000,
    value: 4200,
  }),
  row({
    entitlementName: 'Requests',
    // What the API sends for an identity row: the license, no layer, no composition.
    provenance: {
      addons: [],
      boosts: [],
      license: license(5000),
      number: null,
    },
    threshold: 5000,
    value: 1200,
  }),
  row({
    entitlementName: 'Seats',
    provenance: {
      addons: [
        {
          addonEntitlementId: 'addon-entitlement-seats',
          addonId: 'addon',
          attachedAt: '2027-02-05T09:00:00.000Z',
          instanceAddonId: 'instance-addon',
          limitCapExceededOveragePercent: 0,
          overrideBehavior: 'ADD',
          quantity: 2,
          value: { type: 'number', value: 5 },
        },
      ],
      boosts: [],
      license: null,
      number: {
        afterAddons: 10,
        boostAdd: null,
        boostMultiply: null,
        boostSet: null,
        effective: 10,
        license: null,
        unlimited: false,
      },
    },
    source: 'addon',
    threshold: 10,
    value: 4,
  }),
  row({
    entitlementName: 'Storage',
    limitCapExceededOveragePercent: -1,
    provenance: {
      addons: [
        {
          addonEntitlementId: 'addon-entitlement-storage',
          addonId: 'addon',
          attachedAt: '2027-02-05T09:00:00.000Z',
          instanceAddonId: 'instance-addon',
          limitCapExceededOveragePercent: null,
          overrideBehavior: 'ADD',
          quantity: 1,
          value: { type: 'number', value: -1 },
        },
      ],
      boosts: [],
      license: license(500),
      number: {
        afterAddons: -1,
        boostAdd: null,
        boostMultiply: null,
        boostSet: null,
        effective: -1,
        license: 500,
        unlimited: true,
      },
    },
    threshold: -1,
    value: 80,
  }),
];

function EntitlementsTable({ rows }: { rows: InstanceEntitlementRow[] }) {
  const columns = useEntitlementsColumns('en-US');

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(entitlement) => entitlement.entitlementId}
      pagination={false}
      variant="simple"
    />
  );
}

// The threshold of a limit that an add-on and a voucher changed says how, and that of an
// identity row is a figure.
export const HowALimitIsComposed: Story = {
  render: () => <EntitlementsTable rows={ROWS} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const traces = await canvas.findByRole('button', {
      name: '26,000: how the limit of Traces is composed',
    });

    await userEvent.hover(traces);

    await expect(await screen.findByTestId('limit-provenance')).toHaveTextContent(
      '10,000 license + 3 × 1,000 add-on × 2 voucher = 26,000',
    );
    // The identity row has the figure and nothing to open.
    await expect(canvas.getByText('5,000')).toBeVisible();
    await expect(
      canvas.queryByRole('button', { name: /limit of Requests/ }),
    ).toBeNull();
  },
};

// An entitlement that only an add-on grants says so beside its limit.
export const GrantedByAddons: Story = {
  render: () => <EntitlementsTable rows={ROWS} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const seats = await canvas.findByRole('button', {
      name: '10: how the limit of Seats is composed',
    });

    await expect(canvas.getByTestId('limit-source')).toHaveTextContent(
      'from add-ons',
    );
    await userEvent.click(seats);

    await expect(await screen.findByTestId('limit-provenance')).toHaveTextContent(
      '2 × 5 add-on = 10',
    );
  },
};

// A limit that is unlimited says who grants it.
export const UnlimitedByAnAddon: Story = {
  render: () => <EntitlementsTable rows={ROWS} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      await canvas.findByRole('button', {
        name: 'Unlimited: how the limit of Storage is composed',
      }),
    );

    await expect(await screen.findByTestId('limit-provenance')).toHaveTextContent(
      'Unlimited, granted by an add-on',
    );
  },
};

// The usage card draws the same limit under the meter of each counter, with the same
// popover.
export const InTheUsageCard: Story = {
  render: () => (
    <EntitlementsUsageCard
      entitlementsMetrics={getEntitlementsMetrics(ROWS)}
      locale="en-US"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      await canvas.findByRole('button', {
        name: '26,000: how the limit of Traces is composed',
      }),
    );

    await expect(await screen.findByTestId('limit-provenance')).toHaveTextContent(
      '10,000 license + 3 × 1,000 add-on × 2 voucher = 26,000',
    );
  },
};
