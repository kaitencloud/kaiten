import type { Meta, StoryObj } from '@storybook/react-vite';
import { getUsageStatus } from '../../entitlement-usage-status';
import { UsageMeter } from '../usage-meter';
import { UsageStatusBadge } from '../usage-status-badge';

const meta = {
  title: 'Domains/EntitlementUsage/UsageMeter',
  component: UsageMeter,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof UsageMeter>;

export default meta;
type Story = StoryObj<typeof meta>;

// The same entitlement under the contracts a grant can carry: the two
// numbers on the grant decide the wall, not a flag on the catalogue.
const contracts = [
  { label: 'Hard limit, at the wall', overage: 0, threshold: 250, value: 250 },
  {
    label: 'Soft limit, in allowance',
    overage: 20,
    threshold: 250,
    value: 274,
  },
  {
    label: 'Soft limit, past the wall',
    overage: 20,
    threshold: 250,
    value: 312,
  },
  {
    label: 'Soft limit, under the grant',
    overage: 20,
    threshold: 250,
    value: 160,
  },
  { label: 'Unlimited, no meter', overage: -1, threshold: -1, value: 1840 },
];

export const Contracts: Story = {
  args: { limitCapExceededOveragePercent: 20, threshold: 250, value: 274 },
  render: () => (
    <div className="grid max-w-xl gap-5">
      {contracts.map((contract) => {
        const status = getUsageStatus(
          contract.value,
          contract.threshold,
          contract.overage,
        );

        return (
          <div key={contract.label} className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">{contract.label}</span>
              <div className="flex items-center gap-2">
                <span className="tabular-nums text-muted-foreground">
                  {contract.value.toLocaleString('en-US')} /{' '}
                  {contract.threshold < 0
                    ? 'Unlimited'
                    : contract.threshold.toLocaleString('en-US')}
                </span>
                <UsageStatusBadge status={status} />
              </div>
            </div>
            <UsageMeter
              limitCapExceededOveragePercent={contract.overage}
              threshold={contract.threshold}
              value={contract.value}
            />
          </div>
        );
      })}
    </div>
  ),
};

export const InATableCell: Story = {
  args: {
    className: 'w-16',
    limitCapExceededOveragePercent: 20,
    size: 'sm',
    threshold: 250,
    value: 274,
  },
};
