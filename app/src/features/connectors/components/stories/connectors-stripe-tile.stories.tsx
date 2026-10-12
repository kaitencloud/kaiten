import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { handleGetBillingCapabilities } from '@/api-client/msw.gen';
import { billingCapabilitiesProfiles } from '@/test-fixtures/storybook-billing-fixtures';
import type { StripeStanding } from '../../../../../e2e/app/_support/model/billing-capabilities';
import { ConnectorsPageContent } from '../connectors-page-content';
import { ConnectorsPageShell } from '../connectors-page-shell';

const standing = (state: StripeStanding) => [
  handleGetBillingCapabilities({
    body: billingCapabilitiesProfiles.stackWithStripe(state),
  }),
];

const meta = {
  title: 'Features/Connectors/Catalog',
  component: ConnectorsPageContent,
  parameters: { layout: 'fullscreen', msw: { handlers: standing('available') } },
  render: () => (
    <div className="min-h-screen p-6">
      <ConnectorsPageShell>
        <ConnectorsPageContent
          attioSettings={null}
          onOpenDetail={() => {}}
          onOpenStripe={() => {}}
        />
      </ConnectorsPageShell>
    </div>
  ),
  tags: ['autodocs'],
} satisfies Meta<typeof ConnectorsPageContent>;

export default meta;
type Story = StoryObj<typeof ConnectorsPageContent>;

// The tile changes section when Stripe becomes connected, so it is read afresh each time.
const stripeTile = (canvas: ReturnType<typeof within>) =>
  canvas.getByText('Stripe').closest('[data-slot="card"]') as HTMLElement;

const whenTileSays = (canvas: ReturnType<typeof within>, text: string) =>
  waitFor(() => expect(stripeTile(canvas)).toHaveTextContent(text));

// The tile of Stripe, where the organization can connect it: connected on its own page.
export const StripeAvailable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await whenTileSays(canvas, 'Available');
    await expect(
      within(stripeTile(canvas)).getByRole('button', { name: 'Connect' }),
    ).toBeEnabled();
  },
};

// Once it is connected the catalog lists Stripe with the connected ones, to manage.
export const StripeConnected: Story = {
  parameters: { msw: { handlers: standing('connected') } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await whenTileSays(canvas, 'Connected');
    await expect(
      within(stripeTile(canvas)).getByRole('button', { name: 'Manage' }),
    ).toBeEnabled();
  },
};

// Where Stripe cannot be connected the tile says why under its name and offers no way to try.
export const StripeUnavailable: Story = {
  parameters: { msw: { handlers: standing('vaultMissing') } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await whenTileSays(canvas, 'Stripe needs a configured Vault');
    await expect(
      within(stripeTile(canvas)).getByRole('button', { name: 'Connect' }),
    ).toBeDisabled();
  },
};
