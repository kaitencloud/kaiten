import type { Meta, StoryObj } from '@storybook/react-vite';
import { HttpResponse } from 'msw';
import { Suspense } from 'react';
import { expect, screen, userEvent, within } from 'storybook/test';
import type { PublishableKey } from '@/api-client';
import {
  handleCreatePublishableKey,
  handleGetBillingCapabilities,
  handleListPublishableKeys,
  handleRevokePublishableKey,
  handleUpdatePublishableKey,
} from '@/api-client/msw.gen';
import {
  billingCapabilitiesProfiles,
  buildPublishableKey,
} from '@/test-fixtures/storybook-billing-fixtures';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { PublishableKeyFormDialog, PublishableKeysPageContent } from '..';

const meta = {
  title: 'Features/PublishableKeys/Screens',
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// A short, plain stand-in: the real key is 43 random characters behind the same prefix.
const SECRET = 'pk_test_key';

const PRICING = buildPublishableKey({
  allowedOrigins: ['https://shop.acme.test'],
  createdAt: '2026-09-01T12:00:00Z',
  id: 'pk-1',
  keyHint: 'a1B2',
  label: 'pricing',
  lastUsedAt: '2026-10-06T12:30:00Z',
});
const STOREFRONT = buildPublishableKey({
  allowedOrigins: [
    'https://store.acme.test',
    'http://localhost:5173',
    'https://eu.store.acme.test',
    'https://us.store.acme.test',
  ],
  createdAt: '2026-09-10T12:00:00Z',
  id: 'pk-storefront',
  keyHint: 'c3D4',
  label: 'Storefront',
});
const RENDERER = buildPublishableKey({
  createdAt: '2026-09-05T12:00:00Z',
  id: 'pk-renderer',
  keyHint: 'e5F6',
  label: 'Renderer',
});
const LEGACY = buildPublishableKey({
  allowedOrigins: ['https://old.acme.test'],
  createdAt: '2026-06-01T12:00:00Z',
  id: 'pk-2',
  keyHint: 'z9Y8',
  label: 'Legacy checkout',
  revokedAt: '2026-08-15T12:00:00Z',
});

const serve = (keys: PublishableKey[]) => [
  handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }),
  handleListPublishableKeys(({ request }) => {
    const includeRevoked =
      new URL(request.url).searchParams.get('includeRevoked') === 'true';

    return HttpResponse.json(
      keys.filter((key) => includeRevoked || !key.revokedAt),
    );
  }),
];

const page = (includeRevoked = false) => (
  <StorybookRouter initialEntries={['/integrations/publishable-keys']}>
    <Suspense fallback={null}>
      <PublishableKeysPageContent
        includeRevoked={includeRevoked}
        onIncludeRevokedChange={() => {}}
      />
    </Suspense>
  </StorybookRouter>
);

// The keys of the organization: what each is for, the last four characters that tell
// it apart, the origins it may be sent from (folded past the third) and whether it is live.
export const Keys: Story = {
  parameters: {
    msw: { handlers: serve([PRICING, STOREFRONT, RENDERER, LEGACY]) },
  },
  render: () => page(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('pricing')).toBeVisible();
    await expect(canvas.getByText('…a1B2')).toBeVisible();
    await expect(canvas.getByText('https://shop.acme.test')).toBeVisible();
    await expect(canvas.getByText('No browser origin')).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Show 1 more' }),
    ).toBeVisible();
    await expect(canvas.queryByText('Legacy checkout')).toBeNull();
  },
};

// The revoked keys too, as revoked, with no action on them.
export const WithRevokedKeys: Story = {
  parameters: {
    msw: { handlers: serve([PRICING, LEGACY]) },
  },
  render: () => page(true),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Legacy checkout')).toBeVisible();
    await expect(canvas.getByText('Revoked')).toBeVisible();
    await expect(
      canvas.queryByRole('button', { name: 'Revoke Legacy checkout' }),
    ).toBeNull();
  },
};

// No key yet: where a key comes from, and the way to issue one.
export const Empty: Story = {
  parameters: { msw: { handlers: serve([]) } },
  render: () => page(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByTestId('publishable-keys-empty')).toBeVisible();
    await expect(
      await canvas.findAllByRole('link', { name: 'New publishable key' }),
    ).not.toHaveLength(0);
  },
};

// Issuing a key: the label and the origins, one to a line. An entry that is no origin is
// named under the field, and the form cannot be sent until it is mended.
export const IssueAKey: Story = {
  parameters: { msw: { handlers: serve([PRICING]) } },
  render: () => (
    <StorybookRouter>
      <PublishableKeyFormDialog onClose={() => {}} />
    </StorybookRouter>
  ),
  play: async () => {
    await userEvent.type(await screen.findByLabelText(/^Label/), 'pricing');
    await userEvent.type(
      await screen.findByLabelText(/^Allowed origins/),
      'http://shop.acme.test',
    );
    await userEvent.tab();

    await expect(await screen.findByTestId('rejected-origins')).toHaveTextContent(
      'Not an origin: http://shop.acme.test',
    );
    await expect(screen.getByRole('button', { name: 'Create key' })).toBeDisabled();
  },
};

// The one moment the key exists outside the API: shown once, with a way to copy it and the
// warning that it will not be shown again.
export const KeyCreated: Story = {
  parameters: {
    msw: {
      handlers: [
        ...serve([PRICING]),
        handleCreatePublishableKey(async ({ request }) => {
          const body = await request.json();

          return HttpResponse.json(
            {
              allowedOrigins: body.allowedOrigins,
              createdAt: '2026-10-08T12:00:00Z',
              id: 'pk-new',
              key: SECRET,
              keyHint: 'pk_test_key'.slice(-4),
              label: body.label,
              updatedAt: '2026-10-08T12:00:00Z',
            },
            { status: 201 },
          );
        }),
      ],
    },
  },
  render: () => (
    <StorybookRouter>
      <PublishableKeyFormDialog onClose={() => {}} />
    </StorybookRouter>
  ),
  play: async () => {
    await userEvent.type(await screen.findByLabelText(/^Label/), 'checkout');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Create key' }),
    );

    await expect(await screen.findByTestId('created-key')).toHaveValue(SECRET);
    await expect(screen.getByRole('button', { name: 'Copy the key' })).toBeVisible();
    await expect(screen.getByRole('dialog')).toHaveTextContent(
      /You will not see this key again/,
    );
  },
};

// Changing a key: its label and its origins, prefilled.
export const EditAKey: Story = {
  parameters: {
    msw: {
      handlers: [
        ...serve([PRICING]),
        handleUpdatePublishableKey(() => HttpResponse.json(PRICING)),
      ],
    },
  },
  render: () => (
    <StorybookRouter>
      <PublishableKeyFormDialog onClose={() => {}} publishableKey={PRICING} />
    </StorybookRouter>
  ),
  play: async () => {
    await expect(await screen.findByLabelText(/^Label/)).toHaveValue('pricing');
    await expect(screen.getByLabelText(/^Allowed origins/)).toHaveValue(
      'https://shop.acme.test',
    );
  },
};

// Revoking a key, confirmed first: what revoking does, and that it cannot be undone.
export const RevokeAKey: Story = {
  parameters: {
    msw: {
      handlers: [
        ...serve([PRICING]),
        handleRevokePublishableKey(() =>
          HttpResponse.json({ ...PRICING, revokedAt: '2026-10-08T12:00:00Z' }),
        ),
      ],
    },
  },
  render: () => page(),
  play: async () => {
    await userEvent.click(
      await screen.findByRole('button', { name: 'Revoke pricing' }),
    );

    const dialog = await screen.findByRole('alertdialog');
    await expect(dialog).toHaveTextContent('Revoke pricing?');
    await expect(dialog).toHaveTextContent(/cannot be restored/);
  },
};
