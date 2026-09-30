import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DetailCard } from '../detail-card';

const meta = {
  title: 'Functionals/DetailCard',
  component: DetailCard,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DetailCard>;

export default meta;
type Story = StoryObj<typeof DetailCard>;

export const Default: Story = {
  render: () => (
    <div className="max-w-xl">
      <DetailCard>
        <DetailCard.Header>
          <DetailCard.Title>Production instance</DetailCard.Title>
          <DetailCard.Description>
            Operational details and linked release state.
          </DetailCard.Description>
        </DetailCard.Header>
        <DetailCard.Content>
          <DetailCard.Rows>
            <DetailCard.Row label="Customer" value="Acme Corp" />
            <DetailCard.Row label="License" value="Enterprise Pro" />
            <DetailCard.Row
              label="Status"
              value={<Badge variant="default">Active</Badge>}
            />
            <DetailCard.Row label="Region" value="EU West" />
          </DetailCard.Rows>
          <DetailCard.Divider />
          <Button variant="outline" className="w-fit">
            Open detail
          </Button>
        </DetailCard.Content>
      </DetailCard>
    </div>
  ),
};

// A tall card next to two short ones: the grid aligns them at the top and the
// short ones stack, so no card is stretched to the tallest.
export const UnevenSiblings: Story = {
  render: () => (
    <div className="grid items-start gap-4 md:grid-cols-3">
      <DetailCard className="md:col-span-2">
        <DetailCard.Header>
          <DetailCard.Title>General information</DetailCard.Title>
          <DetailCard.Description>
            Identity and audit trail.
          </DetailCard.Description>
        </DetailCard.Header>
        <DetailCard.Content>
          <DetailCard.Rows>
            <DetailCard.Row label="Name" value="Entitlement values reported" />
            <DetailCard.Row label="Type" value="Number" />
            <DetailCard.Row label="Aggregation method" value="Sum" />
            <DetailCard.Row label="Usage resets" value="Never (lifetime)" />
            <DetailCard.Row label="Base unit" value="n/a" />
            <DetailCard.Row
              label="User facing"
              value={<Badge variant="secondary">Hidden</Badge>}
            />
            <DetailCard.Row
              align="start"
              label="Description"
              value="Entitlement usage reported through the API."
              valueClassName="max-w-md font-normal text-muted-foreground"
            />
          </DetailCard.Rows>
          <DetailCard.Divider />
          <p className="text-xs text-muted-foreground">
            Created Sep 10, 2026 by Kaiten
          </p>
        </DetailCard.Content>
      </DetailCard>
      <div className="grid gap-4">
        <DetailCard>
          <DetailCard.Header>
            <DetailCard.Title>Coverage</DetailCard.Title>
          </DetailCard.Header>
          <DetailCard.Content>
            <DetailCard.Rows>
              <DetailCard.Row label="Linked licenses" value="1" />
              <DetailCard.Row label="Impacted instances" value="3" />
              <DetailCard.Row label="Impacted customers" value="3" />
            </DetailCard.Rows>
          </DetailCard.Content>
        </DetailCard>
        <DetailCard>
          <DetailCard.Header>
            <DetailCard.Title>Alerts</DetailCard.Title>
          </DetailCard.Header>
          <DetailCard.Content>
            <DetailCard.Rows>
              <DetailCard.Row label="Near limit" value="0" />
              <DetailCard.Row label="Over limit" value="0" />
              <DetailCard.Row label="Risk ratio" value="0%" />
            </DetailCard.Rows>
          </DetailCard.Content>
        </DetailCard>
      </div>
    </div>
  ),
};

export const LongValues: Story = {
  render: () => (
    <div className="max-w-xl">
      <DetailCard>
        <DetailCard.Header>
          <DetailCard.Title>Entitlement contract</DetailCard.Title>
          <DetailCard.Description>
            Start-aligned rows for long values and wrapped descriptions.
          </DetailCard.Description>
        </DetailCard.Header>
        <DetailCard.Content>
          <DetailCard.Rows>
            <DetailCard.Row
              align="start"
              label="Identifier"
              value="enterprise-global-storage-allocation"
              valueClassName="max-w-[18rem]"
            />
            <DetailCard.Row
              align="start"
              label="Description"
              value="Maximum retained storage across production workspaces and historical usage exports."
              valueClassName="max-w-[18rem]"
            />
            <DetailCard.Row label="Aggregation" value="Sum by customer" />
          </DetailCard.Rows>
        </DetailCard.Content>
      </DetailCard>
    </div>
  ),
};
