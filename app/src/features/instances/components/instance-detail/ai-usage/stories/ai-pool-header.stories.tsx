import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import type { EntitlementUsage } from '@/api-client';
import { AiPoolHeader } from '../ai-pool-header';

const NOW = Date.parse('2026-11-11T09:40:00.000Z');

const usage = (
  consumed: number,
  reserved: number,
  limit: number,
  overagePercent: number,
  windowed = true,
): EntitlementUsage => ({
  entitlementId: 'entitlement-ai-credits',
  entitlementSlug: 'ai-credits',
  licenseId: 'license-enterprise-v2',
  licenseSlug: 'enterprise-v2',
  source: 'license',
  value: { type: 'number', value: consumed },
  limit: { type: 'number', value: limit },
  limitCapExceededOveragePercent: overagePercent,
  reserved: String(reserved),
  ...(windowed
    ? {
        currentPeriodStart: '2026-11-01T00:00:00.000Z',
        currentPeriodEnd: '2026-12-01T00:00:00.000Z',
      }
    : {}),
});

const meta = {
  title: 'Features/Instances/AiUsage/PoolHeader',
  component: AiPoolHeader,
  parameters: { layout: 'padded' },
  args: { name: 'AI credits', now: NOW, holds: 2, usage: usage(183_420.5, 1_250.5, 250_000, 10) },
  decorators: [
    (Story) => (
      <div className="rounded-xl border bg-card">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AiPoolHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Acme Production: within its included credits, with a projection. */
export const WithinIncluded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('90,329.00')).toBeInTheDocument();
    await expect(canvas.getByRole('meter')).toHaveAttribute('aria-valuemax', '275000');
    await expect(canvas.getByText(/credits a day/)).toBeInTheDocument();
    await expect(canvas.getByText(/Included credits run out on/)).toBeInTheDocument();
  },
};

/** Globex Staging: past a hard limit, so nothing more can be reserved. */
export const Overdrawn: Story = {
  args: { holds: 1, usage: usage(509, 3, 500, 0) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent('Overdrawn by 12.00 credits');
    await expect(canvas.getByText('-12.00')).toBeInTheDocument();
    await expect(canvas.getByText('hard limit, no overage')).toBeInTheDocument();
  },
};

/** Globex Production: past the pool's own warning threshold (80 % of 5,000). */
export const NearLimit: Story = {
  args: {
    holds: 1,
    usage: usage(4_272.4, 37.6, 5_000, 10),
    warningThresholdPercent: 80,
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/warning threshold: 80 % of the included credits \(4,000\)/),
    ).toBeInTheDocument();
  },
};

/** The same consumption on a pool that warns at 90 %: not near its limit yet. */
export const BelowItsOwnThreshold: Story = {
  args: {
    holds: 1,
    usage: usage(4_272.4, 37.6, 5_000, 10),
    warningThresholdPercent: 90,
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByText(/warning threshold/),
    ).toBeNull();
  },
};

/** A pool with no warning threshold is never "near": the 80 % constant is gone. */
export const NoThreshold: Story = {
  args: { holds: 0, usage: usage(4_900, 0, 5_000, 10) },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByText(/warning threshold/),
    ).toBeNull();
  },
};

/** Included credits used, drawing on the overage. */
export const InOverage: Story = {
  args: { holds: 0, usage: usage(5_200, 0, 5_000, 10) },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/draw on the permitted overage/),
    ).toBeInTheDocument();
  },
};

/** An unlimited pool: no meter, no projection. */
export const Unlimited: Story = {
  args: { holds: 0, usage: usage(12_000, 0, -1, 0) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('meter')).toBeNull();
    await expect(canvas.getAllByText('Unlimited').length).toBeGreaterThan(0);
    await expect(canvas.queryByText(/credits a day/)).toBeNull();
  },
};

/** A lifetime pool: a meter, and no projection, since there is no window. */
export const Lifetime: Story = {
  args: { holds: 0, usage: usage(300, 0, 1_000, 0, false) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Lifetime window')).toBeInTheDocument();
    await expect(canvas.queryByText(/credits a day/)).toBeNull();
  },
};
