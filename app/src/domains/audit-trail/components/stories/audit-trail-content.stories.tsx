import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { GlobalAuditEntry } from '../../audit-trail.types';
import { useAuditTrailFilters } from '../../use-audit-trail-filters';
import { AuditTrailExportButton } from '../audit-trail-export-button';
import { AuditTrailList } from '../audit-trail-list';
import { AuditTrailStatsCards } from '../audit-trail-stats-cards';

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();
const hoursAgo = (hours: number) => minutesAgo(hours * 60);
const daysAgo = (days: number) => hoursAgo(days * 24);

const SAMPLE_ENTRIES: GlobalAuditEntry[] = [
  {
    id: '20481',
    eventName: 'ENTITLEMENT_USAGE_REPORT_REJECTED',
    eventType: 'com.kaiten.instance.entitlement.v1.usage_report_rejected',
    instanceSlug: 'acme-production',
    instanceName: 'Acme Production',
    customerName: 'Acme Corp',
    timestamp: minutesAgo(2),
    payload: {
      behavior: 'set',
      entitlement_slug: 'api-calls',
      event_count: 1,
      status: 'REJECTED',
      value: 1_050_000,
    },
  },
  {
    id: '20482',
    eventName: 'INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED',
    eventType:
      'com.kaiten.instance.entitlement.v1.usage_warning_threshold_reached',
    instanceSlug: 'acme-production',
    instanceName: 'Acme Production',
    customerName: 'Acme Corp',
    timestamp: minutesAgo(5),
    payload: {
      entitlement_slug: 'webhooks',
      threshold: 10,
      boundary: 9,
      value: 9,
    },
  },
  {
    id: '20483',
    eventName: 'INSTANCE_ENTITLEMENT_USAGE_REACHED',
    eventType: 'com.kaiten.instance.entitlement.v1.usage_reached',
    instanceSlug: 'techstart-prod',
    instanceName: 'TechStart Prod',
    customerName: 'TechStart',
    timestamp: minutesAgo(6),
    payload: {
      currentPeriodEnd: '2026-10-01T00:00:00.000Z',
      currentPeriodStart: '2026-09-01T00:00:00.000Z',
      entitlementId: 'ent-seats',
      entitlementSlug: 'seats',
      licenseId: 'lic-business',
      licenseSlug: 'business',
      limit: { type: 'number', value: 50 },
      value: { event_count: 12, type: 'number', value: 50 },
    },
  },
  {
    id: '20484',
    eventName: 'INSTANCE_ENTITLEMENT_CAP_EXCEEDED',
    eventType: 'com.kaiten.instance.entitlement.v1.cap_exceeded',
    instanceSlug: 'globex-prod',
    instanceName: 'Globex Prod',
    customerName: 'Globex',
    timestamp: minutesAgo(7),
    payload: {
      entitlement_slug: 'api-calls',
      threshold: 100_000,
      value: 104_200,
      overage: 4_200,
    },
  },
  {
    id: '20480',
    eventName: 'FEATURE_FLAG_UPDATED',
    eventType: 'com.kaiten.feature_flag.v1.updated',
    instanceSlug: 'techstart-prod',
    instanceName: 'TechStart Prod',
    customerName: 'TechStart',
    timestamp: minutesAgo(8),
    payload: { flag_key: 'new-checkout', enabled: true, rollout: '25%' },
  },
  {
    id: '20479',
    eventName: 'ENTITLEMENT_USAGE_REPORT_ACCEPTED',
    eventType: 'com.kaiten.instance.entitlement.v1.usage_report_accepted',
    instanceSlug: 'acme-production',
    instanceName: 'Acme Production',
    customerName: 'Acme Corp',
    timestamp: minutesAgo(18),
    payload: {
      behavior: 'set',
      entitlement_slug: 'seats',
      event_count: 1,
      status: 'ACCEPTED',
      value: 142,
    },
  },
  {
    id: '20478',
    eventName: 'ENTITLEMENT_VALUE_GET',
    eventType: 'com.kaiten.instance.entitlement.v1.value_get',
    instanceSlug: 'techstart-prod',
    instanceName: 'TechStart Prod',
    customerName: 'TechStart',
    timestamp: hoursAgo(1),
    payload: { entitlement_slug: 'seats', value: 64, type: 'NUMBER' },
  },
  {
    id: '20477',
    eventName: 'INSTANCE_CREATED',
    eventType: 'com.kaiten.instance.v1.created',
    instanceSlug: 'umbrella-sandbox',
    instanceName: 'Umbrella Sandbox',
    customerName: 'Umbrella',
    timestamp: hoursAgo(5),
    payload: { tier: 'trial', region: 'us-east-1' },
  },
  {
    id: '20476',
    eventName: 'INSTANCE_DEPLOYED',
    eventType: 'com.kaiten.instance.v1.deployed',
    instanceSlug: 'globex-prod',
    instanceName: 'Globex Prod',
    customerName: 'Globex',
    timestamp: daysAgo(1),
    payload: { release: 'v2.13.1', zone: 'us-east-1' },
  },
  {
    id: '20475',
    eventName: 'LICENSE_ENTITLEMENT_ASSIGNED',
    eventType: 'com.kaiten.license.entitlement.v1.assigned',
    instanceSlug: 'globex-prod',
    instanceName: 'Globex Prod',
    customerName: 'Globex',
    timestamp: daysAgo(2),
    payload: { license_id: 'lic_8841', plan: 'Enterprise', seats: 500 },
  },
];

function AuditTrailStory({ entries }: { entries: GlobalAuditEntry[] }) {
  const state = useAuditTrailFilters(entries);
  return (
    <div className="flex h-screen flex-col p-6">
      <div className="mb-4 flex justify-end">
        <AuditTrailExportButton
          entries={state.filteredEntries}
          getEventLabel={state.getEventLabel}
        />
      </div>
      <AuditTrailStatsCards entries={entries} />
      <div className="mt-6 min-h-0 flex-1">
        <AuditTrailList state={state} total={entries.length} />
      </div>
    </div>
  );
}

const meta = {
  title: 'Domains/AuditTrail',
  component: AuditTrailList,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof AuditTrailList>;

export default meta;
type Story = StoryObj<typeof AuditTrailList>;

export const Default: Story = {
  render: () => <AuditTrailStory entries={SAMPLE_ENTRIES} />,
  parameters: {
    docs: {
      description: {
        story:
          'Global audit trail feed across instances: summary stats, the shared search + filter toolbar, a scrollable event log and expandable payload detail.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // The API's event names read as labels, not as the constants it sends.
    await expect(
      canvas.getAllByText('Feature flag updated').length,
    ).toBeGreaterThan(0);
    await expect(canvas.queryByText('FEATURE FLAG UPDATED')).toBeNull();
  },
};

export const Warnings: Story = {
  render: () => <AuditTrailStory entries={SAMPLE_ENTRIES} />,
  parameters: {
    docs: {
      description: {
        story:
          'The usage events that say a limit is at hand (early warning reached, cap reached, cap exceeded) count on the Warnings card, carry the warning badge and are what the Warning status filter keeps.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const warningLabels = [
      'Entitlement near limit',
      'Entitlement fully used',
      'Entitlement limit exceeded',
    ];
    // A row is one button, named by its label and its status badge.
    const row = (label: string) =>
      canvas.queryByRole('button', { name: new RegExp(label) });

    // The card counts the three warning events of the sample.
    await expect(
      canvas.getByText('Warnings').previousElementSibling,
    ).toHaveTextContent('3');

    await userEvent.click(canvas.getByRole('button', { name: 'Warning' }));

    // The filter keeps those three, each with the warning badge, and nothing else.
    for (const label of warningLabels) {
      await expect(row(label)).toHaveTextContent('Warning');
    }
    for (const label of [
      'Usage rejected',
      'Usage reported',
      'Feature flag updated',
      'Instance created',
    ]) {
      await expect(row(label)).toBeNull();
    }
  },
};

export const LongEventFilter: Story = {
  render: () => <AuditTrailStory entries={SAMPLE_ENTRIES} />,
  parameters: {
    docs: {
      description: {
        story:
          'Filtered on an event whose label outgrows the filter button: the list shows it whole, the button cuts it and its tooltip gives it back.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The option list and the tooltip render in portals, outside the canvas.
    const page = within(canvasElement.ownerDocument.body);
    const label = 'Entitlement assigned to a license';

    await userEvent.click(canvas.getByRole('button', { name: 'Event type' }));
    await userEvent.click(await page.findByRole('button', { name: label }));
    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.hover(canvas.getByRole('button', { name: label }));

    await expect(await page.findByRole('tooltip')).toHaveTextContent(label);
  },
};

export const Empty: Story = {
  render: () => <AuditTrailStory entries={[]} />,
  parameters: {
    docs: {
      description: {
        story: 'Audit trail with no events to display.',
      },
    },
  },
};
