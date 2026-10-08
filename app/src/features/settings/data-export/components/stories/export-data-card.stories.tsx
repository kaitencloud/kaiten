import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { handleGetBillingCapabilities } from '@/api-client/msw.gen';
import { billingCapabilities } from '../../../../../../e2e/app/_support/model/billing-capabilities';
import { billingCapabilitiesProfiles } from '@/test-fixtures/storybook-billing-fixtures';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { ExportDataCard } from '../export-data-card';

const meta = {
  title: 'Features/Settings/ExportDataCard',
  component: ExportDataCard,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof ExportDataCard>;

export default meta;
type Story = StoryObj<typeof ExportDataCard>;

// What to keep before an organization is deleted: the invoices, as files, and the
// usage reports, a month to a file (one export reads 31 days at most).
export const WithBilling: Story = {
  parameters: {
    msw: {
      handlers: [
        handleGetBillingCapabilities({
          body: billingCapabilitiesProfiles.stack(),
        }),
      ],
    },
  },
  render: () => (
    <StorybookRouter>
      <ExportDataCard />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByTestId('invoices-export')).toBeVisible();
    await expect(
      await canvas.findByText(/Kaiten keeps 18 months of usage\./),
    ).toBeVisible();
    // 18 months kept, and the one in progress.
    await expect(canvas.getAllByRole('listitem')).toHaveLength(19);
  },
};

// Usage is the instances' and is kept with or without billing, so it is always
// offered; only the invoices go with billing.
export const WithoutBilling: Story = {
  parameters: {
    msw: {
      handlers: [
        handleGetBillingCapabilities({
          body: billingCapabilities({
            disabledReason: 'DEPLOYMENT_DISABLED',
            enabled: false,
            usageHistoryRetentionMonths: 6,
          }),
        }),
      ],
    },
  },
  render: () => (
    <StorybookRouter>
      <ExportDataCard />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByTestId('usage-export')).toBeVisible();
    // The usage card shows before the capabilities answer: wait for the
    // retention they set before counting the months.
    await expect(
      await canvas.findByText(/Kaiten keeps 6 months of usage\./),
    ).toBeVisible();
    await expect(canvas.queryByTestId('invoices-export')).toBeNull();
    // 6 months kept, and the one in progress.
    await expect(canvas.getAllByRole('listitem')).toHaveLength(7);
  },
};
