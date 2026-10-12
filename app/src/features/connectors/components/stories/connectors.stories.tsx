import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import type { GetAttioSyncedRecordsQuery } from '@/api-client/graphql/graphql';
import { ATTIO_CONNECTOR_NAME } from '@/domains/crm-sync';
import { graphqlOperationHandler } from '@/e2e/msw/handler-factory';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { AttioConnectorDetail, type ConnectorSettings } from '../../attio';
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

const attio = (fields: Record<string, unknown>) => ({
  [ATTIO_CONNECTOR_NAME]: fields,
});

// What GetAttioSyncedRecords answers for the detail: two companies synced to
// Attio, the second one with the error its last sync failed on.
const syncedRecords: GetAttioSyncedRecordsQuery = {
  customers: {
    items: [
      {
        id: 'customer-1',
        integrations: attio({
          external_id: 'record-customer-1',
          last_error: null,
          synced_at: '2026-06-11T12:00:00Z',
        }),
        name: 'Acme Corp',
        slug: 'acme-corp',
      },
      {
        id: 'customer-2',
        integrations: attio({
          external_id: 'record-customer-2',
          last_error:
            'attio companies request failed with 400: Cannot find attribute with slug/ID "customer_id".',
          synced_at: '2026-06-12T09:30:00Z',
        }),
        name: 'Globex Inc',
        slug: 'globex-inc',
      },
    ],
  },
  instances: { items: [] },
};

const syncedRecordsHandlers = [
  graphqlOperationHandler({ GetAttioSyncedRecords: () => syncedRecords }),
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
        onOpenStripe={() => {}}
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
        onOpenStripe={() => {}}
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

export const Detail: Story = {
  parameters: { msw: { handlers: syncedRecordsHandlers } },
  render: () => (
    <StorybookRouter>
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
    await expect(await canvas.findByText('Acme Corp')).toBeVisible();
    await userEvent.click(
      canvas.getByRole('button', { name: 'Disconnect' }),
    );
    await expect(
      within(document.body).getByRole('alertdialog'),
    ).toHaveAttribute('data-open');
  },
};

export const DetailSyncError: Story = {
  parameters: { msw: { handlers: syncedRecordsHandlers } },
  render: () => (
    <StorybookRouter>
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
      await canvas.findByRole('button', {
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
