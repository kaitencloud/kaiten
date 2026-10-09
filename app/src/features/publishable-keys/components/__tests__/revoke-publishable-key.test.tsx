import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import {
  handleListPublishableKeys,
  handleRevokePublishableKey,
} from '@/api-client/msw.gen';
import { refusal, useBillingTexts } from '@/test-fixtures/billing-test-support';
import { PublishableKeysPageContent } from '..';
import {
  LEGACY,
  PRICING,
  renderScreen,
  serveKeys,
  sessionWith,
} from './publishable-key-test-support';

const getAuthToken = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@tanstack/react-router', async () =>
  (await import('./publishable-key-test-support')).createRouterModule(navigate),
);

useBillingTexts();

beforeEach(() => {
  navigate.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
  getAuthToken.mockResolvedValue(sessionWith());
});

const openRevoke = async (user: ReturnType<typeof userEvent.setup>) => {
  serveKeys();
  renderScreen(
    <PublishableKeysPageContent
      includeRevoked={false}
      onIncludeRevokedChange={vi.fn()}
    />,
  );
  await user.click(
    await screen.findByRole('button', { name: 'Revoke pricing' }),
  );

  return screen.findByRole('alertdialog');
};

describe('revoking a publishable key', () => {
  it('asks first, and says what revoking does', async () => {
    const user = userEvent.setup();
    const revoked: string[] = [];
    const dialog = await openRevoke(user);
    server.use(
      handleRevokePublishableKey(({ params }) => {
        revoked.push(params.keyId);
        return HttpResponse.json({ ...PRICING, revokedAt: '2026-10-08T12:00:00Z' });
      }),
    );

    expect(dialog).toHaveTextContent('Revoke pricing?');
    expect(dialog).toHaveTextContent(/key ending in a1B2 stops working/);
    expect(dialog).toHaveTextContent(/cannot be restored/);
    expect(revoked).toEqual([]);

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
    expect(revoked).toEqual([]);
  });

  it('revokes the key once confirmed, reads the list again and says so', async () => {
    const user = userEvent.setup();
    const revoked: string[] = [];
    const dialog = await openRevoke(user);
    let listed = 0;
    server.use(
      handleRevokePublishableKey(({ params }) => {
        revoked.push(params.keyId);
        return HttpResponse.json({ ...PRICING, revokedAt: '2026-10-08T12:00:00Z' });
      }),
      handleListPublishableKeys(() => {
        listed += 1;
        return HttpResponse.json([]);
      }),
    );

    await user.click(within(dialog).getByRole('button', { name: 'Revoke key' }));

    await waitFor(() => expect(revoked).toEqual(['pk-1']));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('pricing revoked'),
    );
    expect(listed).toBeGreaterThan(0);
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
  });

  it('keeps the dialog open with the API’s words when it refuses', async () => {
    const user = userEvent.setup();
    const dialog = await openRevoke(user);
    server.use(
      handleRevokePublishableKey(() =>
        refusal(404, {
          code: 'RevokePublishableKey.NotFound',
          detail: 'publishable key pk-1 not found',
        }),
      ),
    );

    await user.click(within(dialog).getByRole('button', { name: 'Revoke key' }));

    expect(
      await within(dialog).findByText('publishable key pk-1 not found'),
    ).toBeVisible();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('offers no revocation of a key that is revoked already', async () => {
    serveKeys([LEGACY]);
    renderScreen(
      <PublishableKeysPageContent
        includeRevoked
        onIncludeRevokedChange={vi.fn()}
      />,
    );

    expect(await screen.findByText('Legacy checkout')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Revoke/ }),
    ).not.toBeInTheDocument();
  });
});
