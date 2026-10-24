import type { Meta, StoryObj } from '@storybook/react-vite';
import { HttpResponse } from 'msw';
import { Suspense } from 'react';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';
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

// A key that opens the anonymous checkout: Cloudflare's published test site key, and a
// secret stored for it. Only whether a secret is stored is ever known to the console.
const CHECKOUT = buildPublishableKey({
  allowedOrigins: ['https://checkout.acme.test'],
  anonymousCheckout: true,
  createdAt: '2026-09-20T12:00:00Z',
  id: 'pk-checkout',
  keyHint: 'k7Lm',
  label: 'Checkout page',
});

const serve = (
  keys: PublishableKey[],
  capabilities = billingCapabilitiesProfiles.stack(),
) => [
  handleGetBillingCapabilities({ body: capabilities }),
  handleListPublishableKeys(({ request }) => {
    const includeRevoked =
      new URL(request.url).searchParams.get('includeRevoked') === 'true';

    return HttpResponse.json({
      hasMore: false,
      items: keys.filter((key) => includeRevoked || !key.revokedAt),
    });
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

// A live key that opens the anonymous checkout says so beside its state; the list shows
// neither its site key nor its secret.
export const WithAnonymousCheckout: Story = {
  parameters: { msw: { handlers: serve([PRICING, CHECKOUT, LEGACY]) } },
  render: () => page(true),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Checkout page')).toBeVisible();
    await expect(canvas.getAllByText('Anonymous checkout')).toHaveLength(1);
    await expect(canvas.queryByText('1x00000000000000000000AA')).toBeNull();
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

// Issuing a key that opens the anonymous checkout: the switch waits for a Turnstile site key
// and a secret, which is typed in a password field and never shown again.
export const IssueWithAnonymousCheckout: Story = {
  parameters: { msw: { handlers: serve([PRICING]) } },
  render: () => (
    <StorybookRouter>
      <PublishableKeyFormDialog onClose={() => {}} />
    </StorybookRouter>
  ),
  play: async () => {
    const checkout = await screen.findByRole('switch', {
      name: 'Allow anonymous checkout',
    });
    await expect(checkout).toHaveAttribute('aria-disabled', 'true');

    await userEvent.type(
      await screen.findByLabelText(/^Turnstile site key/),
      '1x00000000000000000000AA',
    );
    const secret = await screen.findByLabelText(/^Turnstile secret/);
    await expect(secret).toHaveAttribute('type', 'password');
    await userEvent.type(secret, '1x0000000000000000000000000000000AA');

    await expect(checkout).not.toHaveAttribute('aria-disabled', 'true');
  },
};

// A deployment with no Vault cannot store the secret: the field is disabled and says why,
// so the checkout stays off. A key for the catalog is still issued.
export const IssueWithoutVault: Story = {
  parameters: {
    msw: {
      handlers: serve([PRICING], billingCapabilitiesProfiles.stackWithStripe('vaultMissing')),
    },
  },
  render: () => (
    <StorybookRouter>
      <PublishableKeyFormDialog onClose={() => {}} />
    </StorybookRouter>
  ),
  play: async () => {
    // The capabilities say there is no Vault once they are read.
    await waitFor(async () =>
      expect(await screen.findByLabelText(/^Turnstile secret/)).toBeDisabled(),
    );
    await expect(
      screen.getByText(/Anonymous checkout needs a configured Vault/),
    ).toBeInTheDocument();
    await expect(
      screen.getByRole('switch', { name: 'Allow anonymous checkout' }),
    ).toHaveAttribute('aria-disabled', 'true');
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

// Changing a key that opens the anonymous checkout: the secret is never read back, so the
// form says only that one is stored, and offers to replace it or remove it.
export const EditAnonymousCheckout: Story = {
  parameters: {
    msw: {
      handlers: [
        ...serve([CHECKOUT]),
        handleUpdatePublishableKey(() => HttpResponse.json(CHECKOUT)),
      ],
    },
  },
  render: () => (
    <StorybookRouter>
      <PublishableKeyFormDialog onClose={() => {}} publishableKey={CHECKOUT} />
    </StorybookRouter>
  ),
  play: async () => {
    await expect(
      await screen.findByRole('switch', { name: 'Allow anonymous checkout' }),
    ).toHaveAttribute('aria-checked', 'true');
    await expect(screen.getByLabelText(/^Turnstile site key/)).toHaveValue(
      '1x00000000000000000000AA',
    );
    await expect(screen.getByTestId('turnstile-secret-status')).toHaveTextContent(
      'A secret is stored for this key.',
    );

    // A secret removed under a switch that is on cannot be saved, and says why.
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(async () =>
      expect(
        await screen.findByText(
          'Anonymous checkout needs a site key and a secret. Give both, or turn it off.',
        ),
      ).toBeVisible(),
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
