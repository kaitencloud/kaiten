import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { StrictMode } from 'react';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { testI18n } from '@/__tests__/test-i18n';
import type {
  PublishableKey,
  PublishableKeyDraft,
  PublishableKeyPatch,
} from '@/api-client';
import {
  handleCreatePublishableKey,
  handleGetBillingCapabilities,
  handleListPublishableKeys,
  handleUpdatePublishableKey,
} from '@/api-client/msw.gen';
import { refusal, useBillingTexts } from '@/test-fixtures/billing-test-support';
import { buildPublishableKey } from '../../../../../e2e/app/_support/fixtures';
import { billingCapabilitiesProfiles } from '../../../../../e2e/app/_support/model/billing-capabilities';
import { PublishableKeyFormDialog } from '..';
import {
  PRICING,
  renderScreen,
  sessionWith,
} from './publishable-key-test-support';

// The anonymous checkout of a key: the switch that waits for a Turnstile site key and a
// secret, the secret that is written and never read, and the refusals of the API.

const getAuthToken = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast }));

useBillingTexts();

// The i18n instance of the unit tests answers a missing key with itself; the console
// answers with the default a field gives it.
const missingKeyHandler = testI18n.options.parseMissingKeyHandler;
beforeAll(() => {
  testI18n.options.parseMissingKeyHandler = undefined;
});
afterAll(() => {
  testI18n.options.parseMissingKeyHandler = missingKeyHandler;
});

// Cloudflare's published test keys, which always pass: never those of a real widget.
const SITE_KEY = '1x00000000000000000000AA';
const TURNSTILE_SECRET = '1x0000000000000000000000000000000AA';

const onClose = vi.fn();

/** A key that opens the anonymous checkout, with a secret stored for it. */
const CHECKOUT = buildPublishableKey({
  allowedOrigins: ['https://shop.acme.test'],
  anonymousCheckout: true,
  createdAt: '2026-09-20T12:00:00Z',
  id: 'pk-checkout',
  keyHint: 'k7Lm',
  label: 'checkout',
});

beforeEach(() => {
  onClose.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
  getAuthToken.mockResolvedValue(sessionWith());
  server.use(
    handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }),
    handleListPublishableKeys(() =>
      HttpResponse.json({ hasMore: false, items: [PRICING, CHECKOUT] }),
    ),
  );
});

const type = async (
  user: ReturnType<typeof userEvent.setup>,
  label: RegExp,
  text: string,
) => {
  const field = await screen.findByLabelText(label);
  await user.clear(field);
  await user.type(field, text);
};

const anonymousSwitch = () =>
  screen.findByRole('switch', { name: 'Allow anonymous checkout' });

// A switch is not a form control that can be `disabled`: it says so by `aria-disabled`.
const expectOff = (control: HTMLElement) => {
  expect(control).toHaveAttribute('aria-checked', 'false');
  expect(control).toHaveAttribute('aria-disabled', 'true');
};
const expectTurnable = (control: HTMLElement) =>
  expect(control).not.toHaveAttribute('aria-disabled', 'true');

const serveCreate = (sent: PublishableKeyDraft[] = []) =>
  server.use(
    handleCreatePublishableKey(async ({ request }) => {
      const body = await request.json();
      sent.push(body);

      return HttpResponse.json(
        {
          allowedOrigins: body.allowedOrigins,
          anonymousCheckout: body.anonymousCheckout ?? false,
          createdAt: '2026-10-08T12:00:00Z',
          id: 'pk-new',
          key: 'pk_test_key',
          keyHint: '_key',
          label: body.label,
          turnstileSecretConfigured: body.turnstileSecret !== undefined,
          turnstileSiteKey: body.turnstileSiteKey ?? null,
          updatedAt: '2026-10-08T12:00:00Z',
        },
        { status: 201 },
      );
    }),
  );

const serveUpdate = (
  key: PublishableKey,
  sent: PublishableKeyPatch[] = [],
) =>
  server.use(
    handleUpdatePublishableKey(async ({ request }) => {
      const body = await request.json();
      sent.push(body);

      return HttpResponse.json({
        ...key,
        label: body.label ?? key.label,
      });
    }),
  );

describe('issuing a key that opens the anonymous checkout', () => {
  it('keeps the switch off until a site key and a secret are given, then sends all three', async () => {
    const user = userEvent.setup();
    const sent: PublishableKeyDraft[] = [];
    serveCreate(sent);
    const { client } = renderScreen(
      <PublishableKeyFormDialog onClose={onClose} />,
    );

    expectOff(await anonymousSwitch());
    // The secret is typed in a password field, empty, and says what it is for.
    const secret = await screen.findByLabelText(/^Turnstile secret/);
    expect(secret).toHaveAttribute('type', 'password');
    expect(secret).toHaveValue('');
    expect(secret).toHaveAttribute('autocomplete', 'off');

    await type(user, /^Turnstile site key/, SITE_KEY);
    expectOff(await anonymousSwitch());
    await user.type(secret, TURNSTILE_SECRET);
    await waitFor(async () => expectTurnable(await anonymousSwitch()));

    await user.click(await anonymousSwitch());
    await type(user, /^Label/, 'storefront');
    await user.click(await screen.findByRole('button', { name: 'Create key' }));

    await screen.findByTestId('created-key');
    expect(sent).toEqual([
      {
        allowedOrigins: [],
        anonymousCheckout: true,
        label: 'storefront',
        turnstileSecret: TURNSTILE_SECRET,
        turnstileSiteKey: SITE_KEY,
      },
    ]);
    // The secret is gone with the form, and the mutation that carried it is not kept.
    expect(screen.getByRole('dialog')).not.toHaveTextContent(TURNSTILE_SECRET);
    await waitFor(() =>
      expect(client.getMutationCache().getAll()).toHaveLength(0),
    );
    expect(JSON.stringify(window.localStorage)).not.toContain(TURNSTILE_SECRET);
    expect(JSON.stringify(window.sessionStorage)).not.toContain(
      TURNSTILE_SECRET,
    );
  });

  it('sends neither the switch nor a Turnstile member for a key that is only for the catalog', async () => {
    const user = userEvent.setup();
    const sent: PublishableKeyDraft[] = [];
    serveCreate(sent);
    renderScreen(<PublishableKeyFormDialog onClose={onClose} />);

    await type(user, /^Label/, 'pricing page');
    await user.click(await screen.findByRole('button', { name: 'Create key' }));

    await screen.findByTestId('created-key');
    expect(sent).toEqual([{ allowedOrigins: [], label: 'pricing page' }]);
  });

  it('says what the anonymous checkout lets a visitor do', async () => {
    renderScreen(<PublishableKeyFormDialog onClose={onClose} />);

    const checkout = await anonymousSwitch();

    expect(checkout).toHaveAccessibleDescription(
      /every visitor of this key’s origins can start a checkout and create a customer/i,
    );
  });

  it('refuses a site key that is not one, on its field', async () => {
    const user = userEvent.setup();
    renderScreen(<PublishableKeyFormDialog onClose={onClose} />);

    await type(user, /^Label/, 'storefront');
    await type(user, /^Turnstile site key/, 'not a key!');
    await user.tab();

    expect(
      await screen.findByText(
        'A site key is 1 to 255 letters, digits, hyphens or underscores',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create key' })).toBeDisabled();
  });

  it('leaves the focus where the dialog put it, on the label, in StrictMode as in production', async () => {
    renderScreen(
      <StrictMode>
        <PublishableKeyFormDialog onClose={onClose} />
      </StrictMode>,
    );

    const secret = await screen.findByLabelText(/^Turnstile secret/);

    await waitFor(() => expect(screen.getByLabelText(/^Label/)).toHaveFocus());
    expect(secret).not.toHaveFocus();
  });

  describe('on a deployment with no Vault', () => {
    beforeEach(() => {
      server.use(
        handleGetBillingCapabilities({
          body: billingCapabilitiesProfiles.stackWithStripe('vaultMissing'),
        }),
      );
    });

    it('disables the secret and says the deployment cannot store it, and the switch stays off', async () => {
      renderScreen(<PublishableKeyFormDialog onClose={onClose} />);

      const secret = await screen.findByLabelText(/^Turnstile secret/);
      await waitFor(() => expect(secret).toBeDisabled());
      expect(
        screen.getByText(
          'Anonymous checkout needs a configured Vault: this deployment cannot store a Turnstile secret.',
        ),
      ).toBeVisible();
      expectOff(await anonymousSwitch());
      // A key for the catalog alone is still issued.
      expect(screen.getByLabelText(/^Label/)).toBeEnabled();
    });
  });

  it('says plainly on the secret that the deployment has no Vault when the API refuses it, and keeps what was typed', async () => {
    const user = userEvent.setup();
    server.use(
      handleCreatePublishableKey(() =>
        refusal(422, {
          code: 'CreatePublishableKey.VaultNotConfigured',
          detail:
            'The Turnstile secret is stored in Vault, and this deployment has none configured: set VAULT_ADDR',
        }),
      ),
    );
    renderScreen(<PublishableKeyFormDialog onClose={onClose} />);

    await type(user, /^Label/, 'storefront');
    await type(user, /^Turnstile site key/, SITE_KEY);
    await type(user, /^Turnstile secret/, TURNSTILE_SECRET);
    await user.click(await screen.findByRole('button', { name: 'Create key' }));

    const message = await screen.findByText(
      'This deployment has no Vault, so it cannot store a Turnstile secret. Configure a Vault, or leave anonymous checkout off.',
    );
    expect(message).toBeVisible();
    expect(screen.getByLabelText(/^Turnstile secret/)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText(/^Turnstile site key/)).toHaveValue(SITE_KEY);
    expect(screen.queryByTestId('created-key')).not.toBeInTheDocument();
  });

  it('says it in the console’s words on the switch when the API refuses the checkout for want of a Turnstile value', async () => {
    const user = userEvent.setup();
    server.use(
      handleCreatePublishableKey(() =>
        refusal(422, {
          code: 'CreatePublishableKey.TurnstileNotConfigured',
          detail:
            'anonymousCheckout needs a Turnstile site key and a Turnstile secret',
        }),
      ),
    );
    renderScreen(<PublishableKeyFormDialog onClose={onClose} />);

    await type(user, /^Label/, 'storefront');
    await type(user, /^Turnstile site key/, SITE_KEY);
    await type(user, /^Turnstile secret/, TURNSTILE_SECRET);
    await user.click(await anonymousSwitch());
    await user.click(await screen.findByRole('button', { name: 'Create key' }));

    const message = await screen.findByText(
      'Anonymous checkout needs a site key and a secret. Give both, or turn it off.',
    );
    expect(message).toBeVisible();
    expect(await anonymousSwitch()).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('changing a key that opens the anonymous checkout', () => {
  it('opens with the switch on, the site key, and a secret that is stored and never shown', async () => {
    renderScreen(
      <PublishableKeyFormDialog onClose={onClose} publishableKey={CHECKOUT} />,
    );

    expect(await anonymousSwitch()).toBeChecked();
    expect(screen.getByLabelText(/^Turnstile site key/)).toHaveValue(SITE_KEY);
    expect(screen.getByTestId('turnstile-secret-status')).toHaveTextContent(
      'A secret is stored for this key. It is never shown.',
    );
    // No field holds the secret, so there is nothing to read back or to fill in.
    expect(
      screen.getByRole('dialog').querySelector('input[type="password"]'),
    ).toBeNull();
    expect(
      within(
        screen.getByRole('group', { name: 'Turnstile secret' }),
      )
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Replace', 'Remove']);
  });

  it('says nothing of Turnstile when only the label changes, so the stored secret stays', async () => {
    const user = userEvent.setup();
    const sent: PublishableKeyPatch[] = [];
    serveUpdate(CHECKOUT, sent);
    renderScreen(
      <PublishableKeyFormDialog onClose={onClose} publishableKey={CHECKOUT} />,
    );

    await type(user, /^Label/, 'checkout page');
    await user.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(sent).toEqual([
      { allowedOrigins: ['https://shop.acme.test'], label: 'checkout page' },
    ]);
  });

  it('replaces the secret: a field to type it in, empty, and the way back', async () => {
    const user = userEvent.setup();
    const sent: PublishableKeyPatch[] = [];
    serveUpdate(CHECKOUT, sent);
    renderScreen(
      <PublishableKeyFormDialog onClose={onClose} publishableKey={CHECKOUT} />,
    );

    await user.click(await screen.findByRole('button', { name: 'Replace' }));

    const secret = await screen.findByLabelText(/^Turnstile secret/);
    expect(secret).toHaveAttribute('type', 'password');
    expect(secret).toHaveValue('');
    // The button pressed left with the state it belonged to: the focus follows.
    await waitFor(() => expect(secret).toHaveFocus());
    // A replacement that is empty cannot be saved: it would say nothing.
    await user.type(secret, 'x');
    await user.clear(secret);
    expect(
      await screen.findByText('Enter the new secret, or keep the current one'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.click(
      screen.getByRole('button', { name: 'Keep the current secret' }),
    );
    expect(await screen.findByTestId('turnstile-secret-status')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Replace' }));
    await user.type(
      await screen.findByLabelText(/^Turnstile secret/),
      TURNSTILE_SECRET,
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(sent).toEqual([
      {
        allowedOrigins: ['https://shop.acme.test'],
        label: 'checkout',
        turnstileSecret: TURNSTILE_SECRET,
      },
    ]);
  });

  it('will not remove the secret of a key that still opens the checkout, and says why', async () => {
    const user = userEvent.setup();
    renderScreen(
      <PublishableKeyFormDialog onClose={onClose} publishableKey={CHECKOUT} />,
    );

    await user.click(await screen.findByRole('button', { name: 'Remove' }));

    // Said once, on the switch: the line of the secret only says what happens to it,
    // and the hint by the button does not ask for a required field nobody left empty.
    expect(await screen.findByTestId('turnstile-secret-status')).toHaveTextContent(
      'The secret will be removed when you save.',
    );
    expect(
      await screen.findByText(
        'Anonymous checkout needs a secret. Keep the current one, or turn anonymous checkout off.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByText(
        'Anonymous checkout needs a site key and a secret. Give both, or turn it off.',
      ),
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(
      await screen.findByText('Change what is marked above to save'),
    ).toBeVisible();
    expect(screen.queryByText('Fill in the required fields')).toBeNull();
    // The switch that is on can always be turned off.
    expectTurnable(await anonymousSwitch());
  });

  it('removes the secret once the checkout is turned off, with an empty secret', async () => {
    const user = userEvent.setup();
    const sent: PublishableKeyPatch[] = [];
    serveUpdate(CHECKOUT, sent);
    renderScreen(
      <PublishableKeyFormDialog onClose={onClose} publishableKey={CHECKOUT} />,
    );

    await user.click(await screen.findByRole('button', { name: 'Remove' }));
    await user.click(await anonymousSwitch());
    await user.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(sent).toEqual([
      {
        allowedOrigins: ['https://shop.acme.test'],
        anonymousCheckout: false,
        label: 'checkout',
        turnstileSecret: '',
      },
    ]);
  });

  it('takes the removal back', async () => {
    const user = userEvent.setup();
    renderScreen(
      <PublishableKeyFormDialog onClose={onClose} publishableKey={CHECKOUT} />,
    );

    await user.click(await screen.findByRole('button', { name: 'Remove' }));
    await user.click(await screen.findByRole('button', { name: 'Keep the secret' }));

    expect(await screen.findByTestId('turnstile-secret-status')).toHaveTextContent(
      'A secret is stored for this key.',
    );
    // Nothing is asked of the switch any more: the key holds both values again.
    expect(
      screen.queryByText(
        'Anonymous checkout needs a site key and a secret. Give both, or turn it off.',
      ),
    ).not.toBeInTheDocument();
  });

  it('clears the site key with an empty value, once the checkout is off', async () => {
    const user = userEvent.setup();
    const sent: PublishableKeyPatch[] = [];
    serveUpdate(CHECKOUT, sent);
    renderScreen(
      <PublishableKeyFormDialog onClose={onClose} publishableKey={CHECKOUT} />,
    );

    await user.clear(await screen.findByLabelText(/^Turnstile site key/));
    // The switch is on, and the key would lose what it needs: said at once.
    expect(
      await screen.findByText(
        'Anonymous checkout needs a site key and a secret. Give both, or turn it off.',
      ),
    ).toBeVisible();
    await user.click(await anonymousSwitch());
    await user.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(sent).toEqual([
      {
        allowedOrigins: ['https://shop.acme.test'],
        anonymousCheckout: false,
        label: 'checkout',
        turnstileSiteKey: '',
      },
    ]);
  });

  it('turns the checkout on for a key that has neither value, once both are given', async () => {
    const user = userEvent.setup();
    const sent: PublishableKeyPatch[] = [];
    serveUpdate(PRICING, sent);
    renderScreen(
      <PublishableKeyFormDialog onClose={onClose} publishableKey={PRICING} />,
    );

    expectOff(await anonymousSwitch());
    await type(user, /^Turnstile site key/, SITE_KEY);
    await type(user, /^Turnstile secret/, TURNSTILE_SECRET);
    await user.click(await anonymousSwitch());
    await user.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(sent).toEqual([
      {
        allowedOrigins: ['https://shop.acme.test'],
        anonymousCheckout: true,
        label: 'pricing',
        turnstileSecret: TURNSTILE_SECRET,
        turnstileSiteKey: SITE_KEY,
      },
    ]);
  });

  it('says it in the console’s words when the API refuses the site key it was left with', async () => {
    const user = userEvent.setup();
    server.use(
      handleUpdatePublishableKey(() =>
        refusal(422, {
          code: 'UpdatePublishableKey.TurnstileNotConfigured',
          detail:
            'anonymousCheckout needs a Turnstile site key and a Turnstile secret',
        }),
      ),
    );
    renderScreen(
      <PublishableKeyFormDialog onClose={onClose} publishableKey={CHECKOUT} />,
    );

    await type(user, /^Label/, 'checkout page');
    await user.click(await screen.findByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'Anonymous checkout needs a site key and a secret. Give both, or turn it off.',
      ),
    ).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('stops saying a secret is stored when the API refuses because it was removed elsewhere', async () => {
    const user = userEvent.setup();
    server.use(
      handleUpdatePublishableKey(() =>
        refusal(422, {
          code: 'UpdatePublishableKey.TurnstileNotConfigured',
          detail:
            'anonymousCheckout needs a Turnstile site key and a Turnstile secret',
        }),
      ),
      // Read again after the refusal: another tab took the secret away.
      handleListPublishableKeys(() =>
        HttpResponse.json({
          hasMore: false,
          items: [PRICING, { ...CHECKOUT, turnstileSecretConfigured: false }],
        }),
      ),
    );
    renderScreen(
      <PublishableKeyFormDialog onClose={onClose} publishableKey={CHECKOUT} />,
    );

    await type(user, /^Label/, 'checkout page');
    await user.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.queryByTestId('turnstile-secret-status')).toBeNull(),
    );
    expect(
      screen.queryByText('A secret is stored for this key. It is never shown.'),
    ).toBeNull();
    expect(
      await screen.findByLabelText(/Turnstile secret/),
    ).toHaveValue('');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows a plain 422 that names the site key on the site key field, with the API’s message', async () => {
    const user = userEvent.setup();
    server.use(
      handleUpdatePublishableKey(() =>
        refusal(422, {
          detail: 'validation failed',
          errors: [
            {
              location: 'body.turnstileSiteKey',
              message: 'expected length <= 255',
            },
          ],
        }),
      ),
    );
    renderScreen(
      <PublishableKeyFormDialog onClose={onClose} publishableKey={CHECKOUT} />,
    );

    await type(user, /^Label/, 'checkout page');
    await user.click(await screen.findByRole('button', { name: 'Save' }));

    expect(await screen.findByText('expected length <= 255')).toBeVisible();
    expect(screen.getByLabelText(/^Turnstile site key/)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.queryByText('validation failed')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not move the focus to the secret when a key with one is opened, and puts it on Replace’s field once asked', async () => {
    const user = userEvent.setup();
    renderScreen(
      <StrictMode>
        <PublishableKeyFormDialog onClose={onClose} publishableKey={CHECKOUT} />
      </StrictMode>,
    );

    const replace = await screen.findByRole('button', { name: 'Replace' });
    await waitFor(() => expect(screen.getByLabelText(/^Label/)).toHaveFocus());
    expect(replace).not.toHaveFocus();

    await user.click(replace);

    await waitFor(() =>
      expect(screen.getByLabelText(/^Turnstile secret/)).toHaveFocus(),
    );
  });

  it('marks the site key as required while the checkout is on', async () => {
    const user = userEvent.setup();
    renderScreen(
      <PublishableKeyFormDialog onClose={onClose} publishableKey={CHECKOUT} />,
    );

    await user.clear(await screen.findByLabelText(/^Turnstile site key/));

    expect(screen.getByLabelText(/^Turnstile site key/)).toBeRequired();
    await user.click(await anonymousSwitch());
    expect(screen.getByLabelText(/^Turnstile site key/)).not.toBeRequired();
  });

  it('keeps no copy of a secret it sent', async () => {
    const user = userEvent.setup();
    serveUpdate(CHECKOUT);
    const { client, unmount } = renderScreen(
      <PublishableKeyFormDialog onClose={onClose} publishableKey={CHECKOUT} />,
    );

    await user.click(await screen.findByRole('button', { name: 'Replace' }));
    await user.type(
      await screen.findByLabelText(/^Turnstile secret/),
      TURNSTILE_SECRET,
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    // The route closes the dialog; nothing observes the mutation then, and it is dropped.
    unmount();
    await waitFor(() =>
      expect(client.getMutationCache().getAll()).toHaveLength(0),
    );
  });
});
