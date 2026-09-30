import type { Meta, StoryObj } from '@storybook/react-vite';
import { RiskRankingListCard } from '../risk-ranking-list-card';

const meta = {
  title: 'Functionals/RiskRankingListCard',
  component: RiskRankingListCard,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof RiskRankingListCard>;

export default meta;
type Story = StoryObj<typeof RiskRankingListCard>;

type StoryRiskItem = {
  id: string;
  label: string;
  meta: string;
  ratio: number | null;
};

const riskItems: StoryRiskItem[] = [
  {
    id: 'global-storage',
    label: 'Global storage',
    meta: '1.2 TB used of 1 TB allocation',
    ratio: 1.2,
  },
  {
    id: 'api-requests',
    label: 'API requests',
    meta: '820k used of 1M allocation',
    ratio: 0.82,
  },
  {
    id: 'team-seats',
    label: 'Team seats',
    meta: '170 active seats of 200',
    ratio: 0.85,
  },
  {
    id: 'reporting-jobs',
    label: 'Reporting jobs',
    meta: 'No limit reported',
    ratio: null,
  },
];

const commonProps = {
  title: 'Entitlement saturation',
  description: 'Highest-risk usage ratios across key commercial limits.',
  emptyLabel: 'No risk detected.',
  loadingLabel: 'Loading risk ranking...',
  formatRatio: (ratio: number | null) =>
    ratio === null ? 'Unlimited' : `${Math.round(ratio * 100)}%`,
  getKey: (item: StoryRiskItem) => item.id,
  getLabel: (item: StoryRiskItem) => item.label,
  getRatio: (item: StoryRiskItem) => item.ratio,
  renderMeta: (item: StoryRiskItem) => item.meta,
};

export const PercentageWidth: Story = {
  render: () => (
    <div className="max-w-xl">
      <RiskRankingListCard
        {...commonProps}
        isLoading={false}
        items={riskItems}
      />
    </div>
  ),
};

export const RelativeWidth: Story = {
  render: () => (
    <div className="max-w-xl">
      <RiskRankingListCard
        {...commonProps}
        isLoading={false}
        items={riskItems}
        widthMode="relative"
      />
    </div>
  ),
};

export const Loading: Story = {
  render: () => (
    <div className="max-w-xl">
      <RiskRankingListCard {...commonProps} isLoading items={[]} />
    </div>
  ),
};

export const Empty: Story = {
  render: () => (
    <div className="max-w-xl">
      <RiskRankingListCard {...commonProps} isLoading={false} items={[]} />
    </div>
  ),
};
