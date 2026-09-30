import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalendarDays, Shield, TriangleAlert } from 'lucide-react';
import { StatsCardsRow } from '../stats-cards-row';

const meta = {
  title: 'Functionals/StatsCardsRow',
  component: StatsCardsRow,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StatsCardsRow>;

export default meta;
type Story = StoryObj<typeof StatsCardsRow>;

export const Default: Story = {
  args: {
    items: [
      {
        id: 'expires',
        label: 'License Expires',
        value: '180 days',
        helper: 'Renews in 6 months',
        Icon: CalendarDays,
        valueClassName: 'text-success-subtle-foreground',
      },
      {
        id: 'entitlements',
        label: 'Entitlements',
        value: '6/7',
        helper: '1 entitlement disabled',
        Icon: Shield,
      },
      {
        id: 'alerts',
        label: 'Usage Alerts',
        value: '2 near limit',
        helper: 'Threshold >= 80%',
        Icon: TriangleAlert,
        iconClassName: 'text-warning-subtle-foreground',
      },
    ],
    columnsClassName: 'md:grid-cols-3',
  },
};

// Labels of one, two and three lines, helpers on some cards only: the values
// still sit on one line across the row.
export const UnevenLabels: Story = {
  args: {
    items: [
      { id: 'zones', label: 'Total zones', value: '3', Icon: Shield },
      {
        id: 'sharing',
        label: 'Zones sharing current release',
        value: '0',
        Icon: Shield,
      },
      {
        id: 'tokens',
        label: 'Tokens expiring soon',
        value: '0',
        helper: '12 total tokens',
        Icon: TriangleAlert,
      },
      {
        id: 'flags',
        label: 'Feature flags enabled',
        value: '2/2',
        Icon: CalendarDays,
      },
    ],
  },
  render: (args) => (
    <div className="max-w-3xl">
      <StatsCardsRow {...args} />
    </div>
  ),
};

export const FourColumns: Story = {
  args: {
    items: [
      { id: 'a', label: 'Total', value: '42' },
      { id: 'b', label: 'Active', value: '40' },
      {
        id: 'c',
        label: 'Deleted',
        value: '2',
        valueClassName: 'text-destructive-subtle-foreground',
      },
      { id: 'd', label: 'Pending', value: '1' },
    ],
    columnsClassName: 'md:grid-cols-4',
  },
};
