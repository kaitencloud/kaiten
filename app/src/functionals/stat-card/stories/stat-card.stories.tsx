import type { Meta, StoryObj } from '@storybook/react-vite';
import { AlertTriangle, Calendar, GitBranch } from 'lucide-react';
import { dataModelIcons } from '@/lib/data-model-icons';
import { StatCard } from '../stat-card';

const meta = {
  title: 'Functionals/StatCard',
  component: StatCard,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StatCard>;

export default meta;
type Story = StoryObj<typeof StatCard>;

const CustomerIcon = dataModelIcons.customer;
const InstanceIcon = dataModelIcons.instance;
const EntitlementIcon = dataModelIcons.entitlement;
const LicenseIcon = dataModelIcons.license;
const FeatureFlagIcon = dataModelIcons.featureFlag;
const TokenIcon = dataModelIcons.token;

const InstanceCards = () => (
  <>
    <StatCard>
      <StatCard.Label>License Expires</StatCard.Label>
      <StatCard.Icon>
        <Calendar />
      </StatCard.Icon>
      <StatCard.Value className="text-success-subtle-foreground">
        Oct 1, 2027
      </StatCard.Value>
      <StatCard.Helper>in 12 months</StatCard.Helper>
    </StatCard>
    <StatCard>
      <StatCard.Label>Entitlements</StatCard.Label>
      <StatCard.Icon>
        <EntitlementIcon />
      </StatCard.Icon>
      <StatCard.Value className="text-warning-subtle-foreground">
        5/6
      </StatCard.Value>
      <StatCard.Helper>1 entitlement disabled</StatCard.Helper>
    </StatCard>
    <StatCard>
      <StatCard.Label>Usage Alerts</StatCard.Label>
      <StatCard.Icon className="text-warning-subtle-foreground">
        <AlertTriangle />
      </StatCard.Icon>
      <StatCard.Value>2</StatCard.Value>
      <StatCard.Helper>near limit, lifetime counters</StatCard.Helper>
      <StatCard.Helper className="text-warning-subtle-foreground">
        1 resets at the next period
      </StatCard.Helper>
    </StatCard>
  </>
);

export const Default: Story = {
  render: () => (
    <StatCard.Row columnsClassName="md:grid-cols-3">
      <InstanceCards />
    </StatCard.Row>
  ),
};

// `dense` on the row reaches every card in it.
export const Dense: Story = {
  render: () => (
    <StatCard.Row dense columnsClassName="md:grid-cols-3">
      <InstanceCards />
    </StatCard.Row>
  ),
};

// The same row, default then dense, to compare the room each takes.
export const DenseComparison: Story = {
  render: () => (
    <div className="space-y-6">
      <StatCard.Row columnsClassName="md:grid-cols-3">
        <InstanceCards />
      </StatCard.Row>
      <StatCard.Row dense columnsClassName="md:grid-cols-3">
        <InstanceCards />
      </StatCard.Row>
    </div>
  ),
};

// A card stands on its own too, anywhere a single figure is wanted.
export const Standalone: Story = {
  render: () => (
    <div className="flex flex-wrap items-start gap-4">
      <StatCard className="w-64">
        <StatCard.Label>Customers</StatCard.Label>
        <StatCard.Icon>
          <CustomerIcon />
        </StatCard.Icon>
        <StatCard.Value>4</StatCard.Value>
      </StatCard>
      <StatCard className="w-64">
        <StatCard.Label>Expiring in 30 days</StatCard.Label>
        <StatCard.Icon>
          <AlertTriangle />
        </StatCard.Icon>
        <StatCard.Value>0</StatCard.Value>
        <StatCard.Helper>0 within 60 days</StatCard.Helper>
        <StatCard.Helper>3 within 90 days</StatCard.Helper>
      </StatCard>
      <StatCard dense className="w-56">
        <StatCard.Label>Licenses</StatCard.Label>
        <StatCard.Icon>
          <LicenseIcon />
        </StatCard.Icon>
        <StatCard.Value>6</StatCard.Value>
        <StatCard.Helper>dense, on its own</StatCard.Helper>
      </StatCard>
    </div>
  ),
};

// Labels of one, two and three lines, helpers on some cards only, one or two
// of them: labels, values and helpers each keep one line across the row.
export const UnevenContent: Story = {
  render: () => (
    <div className="max-w-3xl">
      <StatCard.Row>
        <StatCard>
          <StatCard.Label>Total zones</StatCard.Label>
          <StatCard.Value>3</StatCard.Value>
        </StatCard>
        <StatCard>
          <StatCard.Label>Zones sharing current release</StatCard.Label>
          <StatCard.Icon>
            <GitBranch />
          </StatCard.Icon>
          <StatCard.Value>0</StatCard.Value>
          <StatCard.Helper>of 3 zones</StatCard.Helper>
        </StatCard>
        <StatCard>
          <StatCard.Label>Tokens expiring soon</StatCard.Label>
          <StatCard.Icon className="text-destructive-subtle-foreground">
            <TokenIcon />
          </StatCard.Icon>
          <StatCard.Value className="text-destructive-subtle-foreground">
            2
          </StatCard.Value>
          <StatCard.Helper>12 total tokens</StatCard.Helper>
          <StatCard.Helper>1 already expired</StatCard.Helper>
        </StatCard>
        <StatCard>
          <StatCard.Label>Feature flags enabled</StatCard.Label>
          <StatCard.Icon className="text-success-subtle-foreground">
            <FeatureFlagIcon />
          </StatCard.Icon>
          <StatCard.Value>2/2</StatCard.Value>
        </StatCard>
      </StatCard.Row>
    </div>
  ),
};

// The dashboard's six figures, wrapping to two lines below `xl`.
export const SixColumns: Story = {
  render: () => (
    <StatCard.Row dense columnsClassName="md:grid-cols-3 xl:grid-cols-6">
      <StatCard>
        <StatCard.Label>Customers</StatCard.Label>
        <StatCard.Icon>
          <CustomerIcon />
        </StatCard.Icon>
        <StatCard.Value>4</StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>Active Instances</StatCard.Label>
        <StatCard.Icon>
          <InstanceIcon />
        </StatCard.Icon>
        <StatCard.Value>6</StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>Expiring in 30 days</StatCard.Label>
        <StatCard.Icon>
          <AlertTriangle />
        </StatCard.Icon>
        <StatCard.Value>0</StatCard.Value>
        <StatCard.Helper>0 within 60 days</StatCard.Helper>
      </StatCard>
      <StatCard>
        <StatCard.Label>Licenses</StatCard.Label>
        <StatCard.Icon>
          <LicenseIcon />
        </StatCard.Icon>
        <StatCard.Value>6</StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>Feature Flags Enabled</StatCard.Label>
        <StatCard.Icon className="text-success-subtle-foreground">
          <FeatureFlagIcon />
        </StatCard.Icon>
        <StatCard.Value>7/7</StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>Tokens Expiring Soon</StatCard.Label>
        <StatCard.Icon>
          <TokenIcon />
        </StatCard.Icon>
        <StatCard.Value>0</StatCard.Value>
        <StatCard.Helper>1 active token</StatCard.Helper>
      </StatCard>
    </StatCard.Row>
  ),
};

// Two figures that weigh the same share a card at one size, each captioned by
// its unit; the row's neighbours keep their labels and values on one line.
export const TwoValues: Story = {
  render: () => (
    <StatCard.Row columnsClassName="md:grid-cols-3">
      <StatCard>
        <StatCard.Label>License Expires</StatCard.Label>
        <StatCard.Icon>
          <Calendar />
        </StatCard.Icon>
        <StatCard.Value className="text-success-subtle-foreground">
          Oct 1, 2027
        </StatCard.Value>
        <StatCard.Helper>in 12 months</StatCard.Helper>
      </StatCard>
      <StatCard>
        <StatCard.Label>Entitlements</StatCard.Label>
        <StatCard.Icon>
          <EntitlementIcon />
        </StatCard.Icon>
        <StatCard.Value>5/6</StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>Usage Alerts</StatCard.Label>
        <StatCard.Icon className="text-warning-subtle-foreground">
          <AlertTriangle />
        </StatCard.Icon>
        <StatCard.Value className="text-warning-subtle-foreground">
          2<StatCard.Unit>near limit</StatCard.Unit>
        </StatCard.Value>
        <StatCard.Value className="text-destructive-subtle-foreground">
          1<StatCard.Unit>limit reached</StatCard.Unit>
        </StatCard.Value>
        <StatCard.Helper>1 resets at the next period</StatCard.Helper>
      </StatCard>
    </StatCard.Row>
  ),
};

export const TwoValuesDense: Story = {
  render: () => (
    <StatCard.Row dense columnsClassName="md:grid-cols-3">
      <StatCard>
        <StatCard.Label>License Expires</StatCard.Label>
        <StatCard.Icon>
          <Calendar />
        </StatCard.Icon>
        <StatCard.Value className="text-success-subtle-foreground">
          Oct 1, 2027
        </StatCard.Value>
        <StatCard.Helper>in 12 months</StatCard.Helper>
      </StatCard>
      <StatCard>
        <StatCard.Label>Entitlements</StatCard.Label>
        <StatCard.Icon>
          <EntitlementIcon />
        </StatCard.Icon>
        <StatCard.Value>5/6</StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>Usage Alerts</StatCard.Label>
        <StatCard.Icon className="text-warning-subtle-foreground">
          <AlertTriangle />
        </StatCard.Icon>
        <StatCard.Value className="text-warning-subtle-foreground">
          2<StatCard.Unit>near limit</StatCard.Unit>
        </StatCard.Value>
        <StatCard.Value className="text-destructive-subtle-foreground">
          1<StatCard.Unit>limit reached</StatCard.Unit>
        </StatCard.Value>
      </StatCard>
    </StatCard.Row>
  ),
};
