import type { Meta, StoryObj } from '@storybook/react-vite';
import type { QueryClient } from '@tanstack/react-query';
import { expect, userEvent, within } from 'storybook/test';
import { ATTIO_CONNECTOR_NAME } from '@/domains/crm-sync';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import {
  AttioConnectorDetail,
  attioSyncedRecordsQueryOptions,
  type ConnectorSettings,
} from '../../attio';
import { ConnectorsPageContent } from '../connectors-page-content';
import { ConnectorsPageShell } from '../connectors-page-shell';

const connectedSettings: ConnectorSettings = {
  connector_name: ATTIO_CONNECTOR_NAME,
  settings: {
    attioApiKey: '***',
    attioApiUrl: 'https://api.attio.com',
    fieldsMapping: { 'customer.id': 'kaiten_customer_id' },
    syncPolicy: 'create-and-bind',
  },
};

const syncedRecords = [
  {
    externalId: 'record-customer-1',
    id: 'customer-1',
    kind: 'customer' as const,
    lastError: null,
    name: 'Acme Corp',
    object: 'Company' as const,
    slug: 'acme-corp',
    syncedAt: '2026-06-11T12:00:00Z',
  },
  {
    externalId: 'record-customer-2',
    id: 'customer-2',
    kind: 'customer' as const,
    lastError:
      'attio companies request failed with 400: Cannot find attribute with slug/ID "customer_id".',
    name: 'Globex Inc',
    object: 'Company' as const,
    slug: 'globex-inc',
    syncedAt: '2026-06-12T09:30:00Z',
  },
];

const meta = {
  title: 'Features/Connectors/Attio',
  component: ConnectorsPageContent,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof ConnectorsPageContent>;

export default meta;
type Story = StoryObj<typeof ConnectorsPageContent>;

function enabledConnectButton(canvas: ReturnType<typeof within>) {
  const button = canvas
    .getAllByRole('button', { name: 'Connect' })
    .find((candidate: HTMLElement) => !candidate.hasAttribute('disabled'));

  if (!button) {
    throw new Error('Enabled Attio connect button not found');
  }
  return button;
}

const frame = (content: React.ReactNode) => (
  <div className="min-h-screen p-6">
    <ConnectorsPageShell>{content}</ConnectorsPageShell>
  </div>
);

export const Catalog: Story = {
  render: () =>
    frame(
      <ConnectorsPageContent
        attioSettings={null}
        onOpenDetail={() => {}}
      />,
    ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Attio')).toBeVisible();
    await expect(enabledConnectButton(canvas)).toBeEnabled();
  },
};

export const SetupWizard: Story = {
  render: () =>
    frame(
      <ConnectorsPageContent
        attioSettings={null}
        onOpenDetail={() => {}}
      />,
    ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(enabledConnectButton(canvas));
    await expect(
      canvas.getByRole('heading', {
        name: 'Connect to your Attio workspace',
      }),
    ).toBeVisible();
    await expect(
      canvas.getByPlaceholderText(/atk_live_/),
    ).toHaveAttribute('type', 'password');
  },
};

function seedDetail(queryClient: QueryClient) {
  queryClient.setQueryData(
    attioSyncedRecordsQueryOptions.queryKey,
    syncedRecords,
  );
}

export const Detail: Story = {
  render: () => (
    <StorybookRouter seed={seedDetail}>
      <div className="min-h-screen p-6">
        <AttioConnectorDetail
          attioSettings={connectedSettings}
          onDisconnect={() => {}}
        />
      </div>
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Acme Corp')).toBeVisible();
    await userEvent.click(
      canvas.getByRole('button', { name: 'Disconnect' }),
    );
    await expect(
      within(document.body).getByRole('alertdialog'),
    ).toHaveAttribute('data-open');
  },
};

export const DetailSyncError: Story = {
  render: () => (
    <StorybookRouter seed={seedDetail}>
      <div className="min-h-screen p-6">
        <AttioConnectorDetail
          attioSettings={connectedSettings}
          onDisconnect={() => {}}
        />
      </div>
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // A failed record surfaces the worker's last_error: opening the row reveals
    // the full Attio message instead of hiding it in a hover tooltip.
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'View Attio synchronization error details',
      }),
    );
    const errorDialog = within(document.body).getByRole('dialog');
    await expect(errorDialog).toHaveTextContent('Attio synchronization error');
    await expect(errorDialog).toHaveTextContent(
      'Cannot find attribute with slug/ID "customer_id"',
    );
  },
};
