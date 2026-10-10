import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
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
import type { PublishableKeyDraft, PublishableKeyPatch } from '@/api-client';
import {
  handleCreatePublishableKey,
  handleListPublishableKeys,
  handleUpdatePublishableKey,
} from '@/api-client/msw.gen';
import { refusal, useBillingTexts } from '@/test-fixtures/billing-test-support';
import { PublishableKeyFormDialog } from '..';
import {
  PRICING,
  READ_ONLY_SCOPES,
  LEGACY,
  renderScreen,
  sessionWith,
} from './publishable-key-test-support';

const getAuthToken = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast }));

useBillingTexts();

// The i18n instance of the unit tests answers a missing key with itself, whatever the
// punctuation in it. The console answers with the default a field gives it, which is how
// the words of the API reach the screen as they were written.
const missingKeyHandler = testI18n.options.parseMissingKeyHandler;
beforeAll(() => {
  testI18n.options.parseMissingKeyHandler = undefined;
});
afterAll(() => {
  testI18n.options.parseMissingKeyHandler = missingKeyHandler;
});

// A short, plain stand-in: the real key is 43 random characters behind the same prefix.
const SECRET = 'pk_test_key';

const onClose = vi.fn();

beforeEach(() => {
  onClose.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
  getAuthToken.mockResolvedValue(sessionWith());
  server.use(
    handleListPublishableKeys(() =>
      HttpResponse.json({ hasMore: false, items: [PRICING] }),
    ),
  );
});

const fill = async (
  user: ReturnType<typeof userEvent.setup>,
  { label, origins }: { label?: string; origins?: string },
) => {
  if (label !== undefined) {
    const field = await screen.findByLabelText(/^Label/);
    await user.clear(field);
    await user.type(field, label);
  }
  if (origins !== undefined) {
    const field = await screen.findByLabelText(/^Allowed origins/);
    await user.clear(field);
    if (origins) {
      await user.click(field);
      await user.paste(origins);
    }
  }
};

const serveCreate = (sent: PublishableKeyDraft[] = []) =>
  server.use(
    handleCreatePublishableKey(async ({ request }) => {
      const body = await request.json();
      sent.push(body);

      return HttpResponse.json(
        {
          allowedOrigins: body.allowedOrigins,
          createdAt: '2026-10-08T12:00:00Z',
          id: 'pk-new',
          key: SECRET,
          keyHint: 't_key'.slice(-4),
          label: body.label,
          updatedAt: '2026-10-08T12:00:00Z',
        },
        { status: 201 },
      );
    }),
  );

describe('issuing a publishable key', () => {
  it('sends the label and the origins, then shows the key once with a way to copy it', async () => {
    const user = userEvent.setup();
    const sent: PublishableKeyDraft[] = [];
    serveCreate(sent);
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: write },
    });
    const { client, unmount } = renderScreen(
      <PublishableKeyFormDialog onClose={onClose} />,
    );

    await fill(user, {
      label: 'pricing',
      origins:
        'http://localhost:5173\nhttps://shop.acme.test',
    });
    await user.click(await screen.findByRole('button', { name: 'Create key' }));

    const key = await screen.findByTestId('created-key');
    expect(sent).toEqual([
      {
        allowedOrigins: ['http://localhost:5173', 'https://shop.acme.test'],
        label: 'pricing',
      },
    ]);
    expect(key).toHaveValue(SECRET);
    // The button that issued the key is gone, and the focus does not fall to the page behind.
    expect(key).toHaveFocus();
    expect(screen.getByRole('dialog')).toHaveTextContent(
      /You will not see this key again/,
    );

    await user.click(screen.getByRole('button', { name: 'Copy the key' }));
    expect(write).toHaveBeenCalledWith(SECRET);
    expect(toast.success).toHaveBeenCalledWith('Key copied');

    // It lives in the memory of the dialog and nowhere else.
    expect(window.location.href).not.toContain(SECRET);
    expect(JSON.stringify({ ...window.localStorage })).not.toContain(SECRET);
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain(SECRET);
    expect(
      JSON.stringify(
        client.getQueryCache().getAll().map(({ queryKey }) => queryKey),
      ),
    ).not.toContain(SECRET);

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    await waitFor(() =>
      expect(client.getMutationCache().getAll()).toHaveLength(0),
    );
  });

  describe('dismissing the dialog of a key that was just issued', () => {
    const issueKey = async (user: ReturnType<typeof userEvent.setup>) => {
      serveCreate();
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
      });
      renderScreen(<PublishableKeyFormDialog onClose={onClose} />);
      await fill(user, { label: 'pricing' });
      await user.click(
        await screen.findByRole('button', { name: 'Create key' }),
      );
      await screen.findByTestId('created-key');
    };

    it('asks before Escape discards a key that was not copied, and can go back to it', async () => {
      const user = userEvent.setup();
      await issueKey(user);

      await user.keyboard('{Escape}');

      expect(
        await screen.findByRole('alertdialog', {
          name: 'Close without the key?',
        }),
      ).toBeVisible();
      expect(onClose).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Back to the key' }));
      await waitFor(() =>
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
      );
      expect(screen.getByTestId('created-key')).toHaveValue(SECRET);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('closes once the person confirms they leave without the key', async () => {
      const user = userEvent.setup();
      await issueKey(user);

      await user.click(screen.getByRole('button', { name: 'Close' }));
      await user.click(
        await screen.findByRole('button', { name: 'Close without copying' }),
      );

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes at once when the key was copied', async () => {
      const user = userEvent.setup();
      await issueKey(user);

      await user.click(screen.getByRole('button', { name: 'Copy the key' }));
      await user.keyboard('{Escape}');

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('lets the Done button close a key that was not copied without asking', async () => {
      const user = userEvent.setup();
      await issueKey(user);

      await user.click(screen.getByRole('button', { name: 'Done' }));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });

  it('refuses a label of blanks and an origin the API would refuse, naming it, and sends nothing', async () => {
    const user = userEvent.setup();
    const sent: PublishableKeyDraft[] = [];
    serveCreate(sent);
    renderScreen(<PublishableKeyFormDialog onClose={onClose} />);

    await fill(user, {
      label: '   ',
      origins:
        'http://shop.acme.test\nhttps://shop.acme.test/\nhttp://localhost:5173',
    });
    await user.tab();

    expect(await screen.findByTestId('rejected-origins')).toHaveTextContent(
      'Not an origin: http://shop.acme.test, https://shop.acme.test/',
    );
    expect(
      await screen.findByText(/Each origin is https:\/\/host/),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create key' })).toBeDisabled();
    expect(sent).toEqual([]);
  });

  it('refuses a fifty-first origin inline', async () => {
    const user = userEvent.setup();
    renderScreen(<PublishableKeyFormDialog onClose={onClose} />);
    const origins = Array.from(
      { length: 51 },
      (_, index) => `https://s${index}.acme.test`,
    ).join('\n');

    await fill(user, { label: 'pricing', origins });
    await user.tab();

    expect(
      await screen.findByText('That is too many origins for one key'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create key' })).toBeDisabled();
  });

  it('shows what the API refused on the field it is about, and keeps the form as it was typed', async () => {
    const user = userEvent.setup();
    server.use(
      handleCreatePublishableKey(() =>
        refusal(422, {
          code: 'CreatePublishableKey.InvalidOrigin',
          detail:
            '"https://exa.mple" is not an origin: expected https://host[:port], or http://localhost[:port]',
        }),
      ),
    );
    renderScreen(<PublishableKeyFormDialog onClose={onClose} />);

    await fill(user, { label: 'pricing', origins: 'https://exa.mple' });
    await user.click(await screen.findByRole('button', { name: 'Create key' }));

    expect(
      await screen.findByText(/"https:\/\/exa.mple" is not an origin/),
    ).toBeVisible();
    expect(screen.getByLabelText(/^Label/)).toHaveValue('pricing');
    expect(screen.queryByTestId('created-key')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('says which scope is missing when the API refuses the session', async () => {
    const user = userEvent.setup();
    server.use(
      handleCreatePublishableKey(() =>
        refusal(403, {
          code: 'Auth.MissingScope',
          detail: 'missing required scope: write:publishable_keys',
        }),
      ),
    );
    renderScreen(<PublishableKeyFormDialog onClose={onClose} />);

    await fill(user, { label: 'pricing' });
    await user.click(await screen.findByRole('button', { name: 'Create key' }));

    expect(
      await screen.findByText(/write:publishable_keys/),
    ).toBeVisible();
  });

  it('opens nothing for a session that may not write the keys', async () => {
    getAuthToken.mockResolvedValue(sessionWith(READ_ONLY_SCOPES));
    renderScreen(<PublishableKeyFormDialog onClose={onClose} />);

    await waitFor(() => expect(getAuthToken).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('changing a publishable key', () => {
  it('opens on the label and the origins of the key and sends both', async () => {
    const user = userEvent.setup();
    const sent: Array<{ body: PublishableKeyPatch; keyId: string }> = [];
    server.use(
      handleUpdatePublishableKey(async ({ params, request }) => {
        const body = await request.json();
        sent.push({ body, keyId: params.keyId });

        return HttpResponse.json({
          ...PRICING,
          allowedOrigins: body.allowedOrigins ?? [],
          label: body.label ?? PRICING.label,
        });
      }),
    );
    renderScreen(
      <PublishableKeyFormDialog onClose={onClose} publishableKey={PRICING} />,
    );

    expect(await screen.findByLabelText(/^Label/)).toHaveValue('pricing');
    expect(screen.getByLabelText(/^Allowed origins/)).toHaveValue(
      'https://shop.acme.test',
    );

    await fill(user, {
      label: 'pricing page',
      origins: 'https://shop.acme.test\nhttps://portal.acme.test',
    });
    await user.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(sent).toEqual([
      {
        body: {
          allowedOrigins: ['https://shop.acme.test', 'https://portal.acme.test'],
          label: 'pricing page',
        },
        keyId: 'pk-1',
      },
    ]);
    expect(toast.success).toHaveBeenCalledWith('pricing page saved');
  });

  it('explains a key that was revoked while its form was open, and keeps the form open', async () => {
    const user = userEvent.setup();
    server.use(
      handleUpdatePublishableKey(() =>
        refusal(409, {
          code: 'UpdatePublishableKey.Revoked',
          detail: 'a revoked publishable key cannot be changed',
        }),
      ),
    );
    renderScreen(
      <PublishableKeyFormDialog onClose={onClose} publishableKey={PRICING} />,
    );

    await fill(user, { label: 'pricing page' });
    await user.click(await screen.findByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('a revoked publishable key cannot be changed'),
    ).toBeVisible();
    expect(screen.getByTestId('revoked-hint')).toHaveTextContent(
      /create a new key instead/,
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the API its words when it refuses an origin the console let through', async () => {
    const user = userEvent.setup();
    server.use(
      handleUpdatePublishableKey(() =>
        refusal(422, {
          code: 'UpdatePublishableKey.InvalidOrigin',
          detail: '"https://exa.mple" is not an origin',
        }),
      ),
    );
    renderScreen(
      <PublishableKeyFormDialog onClose={onClose} publishableKey={PRICING} />,
    );

    await fill(user, { origins: 'https://exa.mple' });
    await user.click(await screen.findByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('"https://exa.mple" is not an origin'),
    ).toBeVisible();
  });

  it('opens nothing for a key that is revoked', async () => {
    renderScreen(
      <PublishableKeyFormDialog onClose={onClose} publishableKey={LEGACY} />,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
