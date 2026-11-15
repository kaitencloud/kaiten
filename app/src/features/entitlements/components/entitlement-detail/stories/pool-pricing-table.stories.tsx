import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type {
  AddonGrantsState,
  PoolVersionSummary,
} from '@/domains/ai-credits';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { PoolPricingTable } from '../pool-pricing-table';

// Rows as the summary of the dev world's `ai-credits` pool reads them: a
// version granting the pool with no rule, an archived one, and priced ones.
const base = {
  name: 'Starter',
  version: '1',
  familySlug: 'starter',
  rulesCount: 1,
  wildcards: [null],
  modelsPriced: 12,
  cheapest: {
    modelSlug: 'text-embedding-3-small',
    modelName: 'Text Embedding 3 Small',
    costPerCredit: '0.00004',
  },
  dearest: {
    modelSlug: 'claude-opus-4-1',
    modelName: 'Claude Opus 4.1',
    costPerCredit: '0.06',
  },
  partialCosts: 0,
  noRule: false,
  pricedNotGranted: false,
  grantedByAddons: false,
  archived: false,
} satisfies Partial<PoolVersionSummary>;

const rows: PoolVersionSummary[] = [
  {
    ...base,
    licenseSlug: 'trial',
    name: 'Trial',
    versionName: '2026',
    lifecycleState: 'PUBLISHED',
    grant: { kind: 'HARD_LIMIT', value: 100 },
    rulesCount: 0,
    wildcards: [],
    modelsPriced: 0,
    cheapest: null,
    dearest: null,
    noRule: true,
  },
  {
    ...base,
    licenseSlug: 'starter',
    versionName: '2025',
    lifecycleState: 'ARCHIVED',
    grant: { kind: 'HARD_LIMIT', value: 300 },
    archived: true,
  },
  {
    ...base,
    licenseSlug: 'business',
    name: 'Business',
    versionName: '2026',
    lifecycleState: 'PUBLISHED',
    grant: { kind: 'OVERAGE', value: 5000, percent: 10, maximum: 5500 },
    rulesCount: 3,
    wildcards: ['COMPLETION'],
    modelsPriced: 8,
    // One priced model whose reference call the catalogue costs in part only.
    partialCosts: 1,
  },
  {
    ...base,
    licenseSlug: 'partner',
    name: 'Partner',
    versionName: '2026',
    lifecycleState: 'PUBLISHED',
    grant: { kind: 'NOT_GRANTED' },
    wildcards: [],
    modelsPriced: 1,
    pricedNotGranted: true,
  },
  {
    ...base,
    licenseSlug: 'reseller',
    name: 'Reseller',
    familySlug: 'reseller',
    versionName: '2026',
    lifecycleState: 'PUBLISHED',
    grant: { kind: 'NOT_GRANTED' },
    wildcards: [null],
    modelsPriced: 12,
    pricedNotGranted: true,
    grantedByAddons: true,
  },
];

// What the add-on grants read answered for the Reseller family.
const addonGrants = new Map<string, AddonGrantsState>([
  [
    'reseller',
    {
      status: 'READY',
      grants: [
        {
          addonFamilySlug: 'partner-credit-pack',
          addonId: '00000000-0000-4000-9000-000000000002',
          addonName: 'Partner credit pack',
          addonSlug: 'partner-credit-pack-v2',
          addonVersion: 2,
          entitlementSlug: 'ai-credits',
          isDefault: true,
          lifecycleState: 'PUBLISHED',
          maxQuantity: 10,
          overrideBehavior: 'ADD',
          unlimited: false,
          value: { type: 'number', value: 2000 },
        },
      ],
    },
  ],
]);

const meta = {
  title: 'Features/Entitlements/PoolPricingTable',
  component: PoolPricingTable,
  args: { addonGrants, poolName: 'AI credits', poolSlug: 'ai-credits', rows },
  render: (args) => (
    <StorybookRouter>
      <PoolPricingTable {...args} />
    </StorybookRouter>
  ),
  tags: ['autodocs'],
} satisfies Meta<typeof PoolPricingTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Versions: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'One row per licence version: the grant, the rules, the models priced, the wildcard and the cost per credit range, with a link into the rate card.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('No rule · calls refused'),
    ).toBeVisible();
    await expect(canvas.getByText('Priced, not granted')).toBeVisible();
    // An add-on can grant the pool on Reseller: said in the place of a grant,
    // and opened to say which add-on and what that means.
    const through = canvas.getByRole('button', {
      name: 'Through add-on · Partner credit pack',
    });
    await userEvent.click(through);
    const meaning = await within(document.body).findByText(
      /It does not mean every instance holds it/,
    );
    await waitFor(() => expect(meaning).toBeVisible());
    // Closed again before the story ends: an open popover keeps focus guards
    // in the page, which the accessibility check reads as focusable and hidden.
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(within(document.body).queryByRole('dialog')).toBeNull(),
    );
    await expect(canvas.getByText('+10 % → 5,500')).toBeVisible();
    await expect(
      canvas.getAllByRole('button', { name: /in the rate card$/ }),
    ).toHaveLength(rows.length);
  },
};

export const SelectedVersion: Story = {
  args: { selectedVersion: 'business' },
};
