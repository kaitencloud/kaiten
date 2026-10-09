import type { UseQueryResult } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Redemption } from '@/api-client';
import { handleRevokeInstanceVoucher } from '@/api-client/msw.gen';
import {
  refusal,
  renderWithClient,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import {
  buildRedemption,
  buildVoucher,
} from '../../../../e2e/app/_support/fixtures';
import {
  RedemptionsCard,
  RedemptionsTable,
  RevokeRedemptionDialog,
} from '../components';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('sonner', () => ({ toast }));
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a {...props} href={to}>
      {children}
    </a>
  ),
  useRouter: () => ({
    buildLocation: ({
      params,
      to,
    }: {
      params: Record<string, string>;
      to: string;
    }) => ({
      pathname: Object.entries(params).reduce(
        (path, [name, value]) => path.replace(`$${name}`, value),
        to,
      ),
    }),
  }),
}));

useBillingTexts();

const NOW = Date.parse('2026-10-07T12:00:00.000Z');
const LAUNCH = buildVoucher({
  code: 'LAUNCH-20-OFF',
  duration: 'REPEATING',
  durationInPeriods: 3,
  id: 'voucher-launch',
  name: 'Launch discount',
});
const BOOST = buildVoucher({
  code: 'TOKENS-DOUBLE-Q4',
  id: 'voucher-boost',
  name: 'Tokens times two',
  voucherType: 'ENTITLEMENT_BOOST',
});

const DISCOUNT_ROW = buildRedemption({
  applicationsCount: 1,
  applicationsMax: 3,
  id: 'r-discount',
  instanceSlug: 'initech-annual',
  redeemedAt: '2026-03-01T10:00:00.000Z',
  voucher: LAUNCH,
});
const BOOST_ROW = buildRedemption({
  effectiveExpiresAt: '2026-12-01T09:00:00.000Z',
  id: 'r-boost',
  instanceSlug: 'initech-prod',
  redeemedAt: '2026-10-01T09:00:00.000Z',
  voucher: BOOST,
});
const LAPSED_ROW = buildRedemption({
  effectiveExpiresAt: '2026-09-01T09:00:00.000Z',
  id: 'r-lapsed',
  instanceSlug: 'hooli-starter',
  redeemedAt: '2026-08-01T09:00:00.000Z',
  voucher: BOOST,
});
const REVOKED_ROW = buildRedemption({
  id: 'r-revoked',
  instanceSlug: 'hooli-legacy',
  redeemedAt: '2026-05-01T09:00:00.000Z',
  revokedAt: '2026-05-02T09:00:00.000Z',
  revokedReason: 'Granted by mistake',
  status: 'REVOKED',
  voucher: LAUNCH,
});
const UNBOUNDED_ROW = buildRedemption({
  applicationsCount: 4,
  id: 'r-forever',
  instanceSlug: 'initech-fresh',
  voucher: LAUNCH,
});

const ROWS = [DISCOUNT_ROW, BOOST_ROW, LAPSED_ROW, REVOKED_ROW, UNBOUNDED_ROW];

const row = (name: RegExp | string) =>
  screen.getByRole('row', { name: new RegExp(`${name}`) });

beforeEach(() => {
  toast.error.mockReset();
  toast.success.mockReset();
});

describe('the redemptions of a voucher, led by the instance', () => {
  it('says for each when it was redeemed, the window it applies in, the invoices a discount used and its state', () => {
    renderWithClient(
      <RedemptionsTable now={NOW} redemptions={ROWS} subject="instance" />,
    );

    expect(row('initech-annual')).toHaveTextContent('Mar 1, 2026 (UTC)');
    expect(row('initech-annual')).toHaveTextContent('1/3 invoices');
    expect(row('initech-annual')).toHaveTextContent('Active');
    expect(row('initech-prod')).toHaveTextContent('Oct 1, 2026 (UTC)');
    expect(row('initech-prod')).toHaveTextContent('Dec 1, 2026');
    // A boost has no invoices to count.
    expect(row('initech-prod')).not.toHaveTextContent('invoices');
    expect(row('initech-fresh')).toHaveTextContent('4 invoices so far');
  });

  it('reads a boost whose window closed as expired, though the API keeps it active', () => {
    renderWithClient(
      <RedemptionsTable now={NOW} redemptions={ROWS} subject="instance" />,
    );

    expect(row('hooli-starter')).toHaveTextContent('Expired');
    expect(row('initech-prod')).toHaveTextContent('Active');
  });

  it('gives the reason a redemption was revoked for, and leaves a revoked one with no action', () => {
    renderWithClient(
      <RedemptionsTable
        now={NOW}
        onRevoke={vi.fn()}
        redemptions={ROWS}
        subject="instance"
      />,
    );

    expect(row('hooli-legacy')).toHaveTextContent('Revoked');
    expect(row('hooli-legacy')).toHaveTextContent('Revoked: Granted by mistake');
    expect(
      within(row('hooli-legacy')).queryByRole('button'),
    ).not.toBeInTheDocument();
  });

  it('offers to revoke only what still applies, and says which redemption it is', async () => {
    const onRevoke = vi.fn();
    renderWithClient(
      <RedemptionsTable
        now={NOW}
        onRevoke={onRevoke}
        redemptions={ROWS}
        subject="instance"
      />,
    );

    expect(
      within(row('hooli-starter')).queryByRole('button'),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(row('initech-prod')).getByRole('button', {
        name: 'Revoke Tokens times two',
      }),
    );

    expect(onRevoke).toHaveBeenCalledWith(BOOST_ROW);
  });

  it('has no action at all for a session that may not revoke', () => {
    renderWithClient(
      <RedemptionsTable now={NOW} redemptions={ROWS} subject="instance" />,
    );

    expect(screen.queryByRole('button', { name: /^Revoke/ })).not.toBeInTheDocument();
  });

  it('leads each row to the Billing tab of its instance', () => {
    renderWithClient(
      <RedemptionsTable now={NOW} redemptions={ROWS} subject="instance" />,
    );

    expect(
      screen.getByRole('link', { name: 'initech-annual' }),
    ).toHaveAttribute('href', '/customers/instances/initech-annual/billing');
  });
});

describe('the redemptions of an instance, led by the voucher', () => {
  it('names the voucher and the end of its code, and never the code', () => {
    renderWithClient(
      <RedemptionsTable
        now={NOW}
        redemptions={[DISCOUNT_ROW]}
        subject="voucher"
      />,
    );

    expect(row('Launch discount')).toHaveTextContent('Discount');
    expect(row('Launch discount')).toHaveTextContent('Code ending in 0OFF');
    expect(screen.queryByText(/LAUNCH-20-OFF/)).not.toBeInTheDocument();
  });

  it('leads to the voucher by its id only where the session may read vouchers', () => {
    const { unmount } = renderWithClient(
      <RedemptionsTable
        linksToVouchers
        now={NOW}
        redemptions={[BOOST_ROW]}
        subject="voucher"
      />,
    );

    expect(screen.getByRole('link', { name: /Tokens times two/ })).toHaveAttribute(
      'href',
      '/vouchers/voucher-boost',
    );
    unmount();

    renderWithClient(
      <RedemptionsTable now={NOW} redemptions={[BOOST_ROW]} subject="voucher" />,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

type Query = UseQueryResult<{ items: Redemption[] }, unknown>;

const query = (overrides: Partial<Query> = {}) =>
  ({
    data: undefined,
    error: null,
    isError: false,
    isPending: false,
    refetch: vi.fn(),
    ...overrides,
  }) as unknown as Query;

const card = (q: Query) => (
  <RedemptionsCard
    description="What was redeemed of this voucher."
    emptyDescription="No instance has redeemed it yet."
    query={q}
    subject="instance"
    testIdPrefix="things"
  />
);

describe('the redemptions of a subject, in a card', () => {
  it('shows a busy region named by what is being read while they load', () => {
    renderWithClient(card(query({ isPending: true })));

    expect(
      screen.getByRole('status', { name: 'Loading redemptions' }),
    ).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('What was redeemed of this voucher.')).toBeInTheDocument();
  });

  it('says why there is none, in the words of the screen it is on', () => {
    renderWithClient(card(query({ data: { items: [] } })));

    const empty = screen.getByTestId('things-empty');
    expect(empty).toHaveTextContent('No redemption yet');
    expect(empty).toHaveTextContent('No instance has redeemed it yet.');
  });

  it('says why they could not be read, in the API words, with a way to ask again', async () => {
    const refetch = vi.fn();
    const error = Object.assign(new Error('refused'), {
      data: { code: 'Billing.Down', detail: 'Billing is being moved.', status: 503 },
      status: 503,
    });
    renderWithClient(card(query({ error, isError: true, refetch })));

    expect(screen.getByTestId('things-error')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('lists the redemptions, with the actions the page gives it beside its title', () => {
    renderWithClient(
      <RedemptionsCard
        actions={<button type="button">Apply a code</button>}
        description="d"
        emptyDescription="e"
        query={query({ data: { items: [DISCOUNT_ROW] } })}
        subject="instance"
        testIdPrefix="things"
      />,
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply a code' })).toBeInTheDocument();
  });
});

describe('revoking a redemption', () => {
  const REDEMPTION = {
    id: 'r-boost',
    instanceSlug: 'initech-prod',
    voucherId: 'voucher-boost',
    voucherName: 'Tokens times two',
  };

  function serveRevoke(
    answer: () => Response = () => HttpResponse.json(BOOST_ROW),
  ) {
    const asked: Array<{ body: unknown; path: string }> = [];
    server.use(
      handleRevokeInstanceVoucher(async ({ params, request }) => {
        asked.push({
          body: await request.json(),
          path: `${String(params.instanceSlug)}/${String(params.instanceVoucherId)}`,
        });

        return answer();
      }),
    );

    return asked;
  }

  const confirm = () => screen.findByRole('button', { name: 'Revoke' });

  it('names what is taken back and where, and cannot be confirmed without a reason', async () => {
    renderWithClient(
      <RevokeRedemptionDialog onClose={vi.fn()} redemption={REDEMPTION} />,
    );

    expect(
      await screen.findByRole('dialog', {
        name: 'Revoke Tokens times two on initech-prod',
      }),
    ).toBeInTheDocument();
    expect(await confirm()).toBeDisabled();

    await userEvent.type(await screen.findByLabelText(/Reason/), '   ');
    expect(await confirm()).toBeDisabled();
  });

  it('sends the reason for the redemption of the instance, says it was revoked and closes', async () => {
    const asked = serveRevoke();
    const onClose = vi.fn();
    renderWithClient(
      <RevokeRedemptionDialog onClose={onClose} redemption={REDEMPTION} />,
    );

    await userEvent.type(await screen.findByLabelText(/Reason/), 'Sales error');
    await userEvent.click(await confirm());

    await waitFor(() => expect(asked).toHaveLength(1));
    expect(asked[0]).toEqual({
      body: { reason: 'Sales error' },
      path: 'initech-prod/r-boost',
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith('Tokens times two revoked');
  });

  it('refreshes what the redemption changed once the API accepted it', async () => {
    serveRevoke();
    const { client } = renderWithClient(
      <RevokeRedemptionDialog onClose={vi.fn()} redemption={REDEMPTION} />,
    );
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await userEvent.type(await screen.findByLabelText(/Reason/), 'Sales error');
    await userEvent.click(await confirm());

    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    const keys = invalidate.mock.calls.map(
      ([filters]) => (filters?.queryKey?.[0] as { _id?: string } | undefined)?._id,
    );
    expect(keys).toEqual(
      expect.arrayContaining([
        'listInstanceVouchers',
        'getEntitlementsUsageMetrics',
        'getUpcomingInvoice',
        'listVouchers',
        'getVoucher',
        'listVoucherRedemptions',
      ]),
    );
  });

  it('keeps the dialog open with the reason as typed when the API refuses, and says why', async () => {
    serveRevoke(() =>
      refusal(409, {
        code: 'RevokeInstanceVoucher.NotActive',
        detail: 'the redemption is not active',
      }),
    );
    const onClose = vi.fn();
    renderWithClient(
      <RevokeRedemptionDialog onClose={onClose} redemption={REDEMPTION} />,
    );

    await userEvent.type(await screen.findByLabelText(/Reason/), 'Sales error');
    await userEvent.click(await confirm());

    expect(
      await screen.findByText('the redemption is not active'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Reason/)).toHaveValue('Sales error');
    expect(onClose).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
