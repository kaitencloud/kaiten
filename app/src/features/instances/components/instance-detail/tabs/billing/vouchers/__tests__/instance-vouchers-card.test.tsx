import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Redemption } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleListInstanceVouchers,
  handleRevokeInstanceVoucher,
} from '@/api-client/msw.gen';
import {
  refusal,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { buildRedemption } from '../../../../../../../../../e2e/app/_support/fixtures';
import { billingCapabilitiesProfiles } from '../../../../../../../../../e2e/app/_support/model/billing-capabilities';
import { InstanceVouchersCard } from '../instance-vouchers-card';
import {
  BOOST_REDEMPTION,
  DISCOUNT_REDEMPTION,
  STORAGE_BOOST,
} from './vouchers-fixtures';

const getAuthToken = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { params?: Record<string, string>; to: string }) => (
    <a
      {...props}
      href={Object.entries(params ?? {}).reduce((path, [name, value]) => path.replace(`$${name}`, value), to)}
    >
      {children}
    </a>
  ),
  useRouter: () => ({
    buildLocation: ({ params, to }: { params: Record<string, string>; to: string }) => ({
      pathname: Object.entries(params).reduce((path, [name, value]) => path.replace(`$${name}`, value), to),
    }),
  }),
}));

useBillingTexts();

const SCOPES = ['read:billing', 'read:vouchers', 'read:voucher_redemptions', 'write:voucher_redemptions', 'write:vouchers'];
const REVOKED = buildRedemption({
  id: 'redemption-old',
  instanceSlug: 'globex-production',
  redeemedAt: '2026-05-01T09:00:00.000Z',
  revokedAt: '2026-05-02T09:00:00.000Z',
  revokedReason: 'Granted by mistake',
  status: 'REVOKED',
  voucher: STORAGE_BOOST,
});

const serve = (redemptions: Redemption[] = [BOOST_REDEMPTION, DISCOUNT_REDEMPTION, REVOKED]) =>
  server.use(handleListInstanceVouchers(() => HttpResponse.json(redemptions)));

beforeEach(() => {
  toast.error.mockReset();
  toast.success.mockReset();
  getAuthToken.mockResolvedValue(sessionToken(SCOPES));
  server.use(handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stackWithVouchers() }));
  serve();
});

const renderCard = () => renderWithClient(<InstanceVouchersCard instanceSlug="globex-production" />);

describe('what an instance redeemed', () => {
  it('lists the vouchers by name with the end of their code, when they were redeemed, the window they apply in and their state', async () => {
    renderCard();

    const boost = await screen.findByRole('row', { name: /Storage boost.*Active/ });
    expect(boost).toHaveTextContent('Code ending in ST50');
    expect(boost).toHaveTextContent('Oct 1, 2026 (UTC)');
    expect(screen.getByRole('row', { name: /Welcome spring/ })).toHaveTextContent('1/3 invoices');
    expect(screen.getByRole('row', { name: /Revoked: Granted by mistake/ })).toHaveTextContent('Revoked');
    // The code itself is never in the answer for a redemption.
    expect(screen.queryByText(/STORAGE-BOOST-50/)).not.toBeInTheDocument();
  });

  it('leads a row to its voucher for a session that may read vouchers, and to nothing for one that may not', async () => {
    const { unmount } = renderCard();
    expect((await screen.findAllByRole('link', { name: /Storage boost/ }))[0]).toHaveAttribute(
      'href',
      '/vouchers/voucher-storage',
    );
    unmount();

    getAuthToken.mockResolvedValue(sessionToken(['read:billing', 'read:voucher_redemptions']));
    renderCard();
    await screen.findByRole('row', { name: /Storage boost.*Active/ });
    expect(screen.queryAllByRole('link', { name: /Storage boost/ })).toHaveLength(0);
  });

  it('offers to apply a code to a session that may redeem, and leads to the dialog of the instance', async () => {
    renderCard();

    expect(await screen.findByRole('link', { name: 'Apply a code' })).toHaveAttribute(
      'href',
      '/customers/instances/globex-production/billing/redeem-voucher',
    );
  });

  it('does not offer to apply a code to a session that may only read what was redeemed', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:billing', 'read:voucher_redemptions']));
    renderCard();

    await screen.findByRole('row', { name: /Storage boost.*Active/ });
    expect(screen.queryByRole('link', { name: 'Apply a code' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Revoke/ })).not.toBeInTheDocument();
  });

  it('says why there is none, and still offers to apply a code', async () => {
    serve([]);
    renderCard();

    expect(await screen.findByTestId('instance-vouchers-empty')).toHaveTextContent(
      'This instance has not redeemed any voucher.',
    );
    expect(screen.getByRole('link', { name: 'Apply a code' })).toBeInTheDocument();
  });

  it('is not there where the release ships no vouchers, nor for a session that may not read them', async () => {
    server.use(handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stackWithAddons() }));
    const { unmount } = renderCard();
    await waitFor(() => expect(screen.queryByTestId('instance-vouchers')).not.toBeInTheDocument());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId('instance-vouchers')).not.toBeInTheDocument();
    unmount();

    server.use(handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stackWithVouchers() }));
    getAuthToken.mockResolvedValue(sessionToken(['read:billing']));
    renderCard();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId('instance-vouchers')).not.toBeInTheDocument();
  });

  it('says why they could not be read, in the API words, with a way to ask again', async () => {
    server.use(
      handleListInstanceVouchers(() => refusal(503, { code: 'Billing.Down', detail: 'Billing is being moved.' })),
    );
    renderCard();

    expect(await screen.findByText('Billing is being moved.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('taking a redemption back from the instance', () => {
  it('offers it for what still applies only, needs a reason and shows the redemption revoked once it is', async () => {
    const asked: unknown[] = [];
    server.use(
      handleRevokeInstanceVoucher(async ({ params, request }) => {
        asked.push({ body: await request.json(), path: `${String(params.instanceSlug)}/${String(params.instanceVoucherId)}` });

        return HttpResponse.json({ ...BOOST_REDEMPTION, status: 'REVOKED' });
      }),
    );
    renderCard();

    const revokable = await screen.findAllByRole('button', { name: /^Revoke/ });
    // The boost and the discount apply; the revoked one is left alone.
    expect(revokable).toHaveLength(2);
    const boost = screen.getByRole('row', { name: /Storage boost.*Active/ });
    await userEvent.click(within(boost).getByRole('button', { name: 'Revoke Storage boost' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = await within(dialog).findByRole('button', { name: 'Revoke' });
    expect(confirm).toBeDisabled();
    await userEvent.type(await within(dialog).findByLabelText(/Reason/), 'sales error');
    await userEvent.click(confirm);

    await waitFor(() =>
      expect(asked).toEqual([{ body: { reason: 'sales error' }, path: 'globex-production/redemption-storage' }]),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Storage boost revoked'));
  });
});
