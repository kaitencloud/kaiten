import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Validity } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleGetEntitlementsUsageMetrics,
  handleGetUpcomingInvoice,
  handleRedeemVoucher,
  handleValidateVoucher,
} from '@/api-client/msw.gen';
import {
  refusal,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { billingCapabilitiesProfiles } from '../../../../../../../../../e2e/app/_support/model/billing-capabilities';
import { INSTANCE, subscription } from '../../__tests__/lifecycle-fixtures';
import { RedeemVoucherDialog } from '../redeem-voucher-dialog';
import {
  BOOST_REDEMPTION,
  DISCOUNT_REDEMPTION,
  STORAGE_BOOST,
  usageOf,
  upcoming,
  WELCOME,
} from './vouchers-fixtures';

const getAuthToken = vi.hoisted(() => vi.fn());
const detail = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../../../instance-detail-context', () => ({
  useInstanceDetail: () => detail.current,
}));

useBillingTexts();

beforeEach(() => {
  getAuthToken.mockResolvedValue(
    sessionToken(['read:billing', 'read:instances', 'read:voucher_redemptions', 'write:voucher_redemptions']),
  );
  detail.current = {
    entitlements: [{ name: 'Storage', slug: 'storage-gb' }],
    instance: INSTANCE,
    license: { familyId: 'family-business', lifecycleState: 'PUBLISHED', name: 'Business' },
  };
  server.use(
    handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stackWithVouchers() }),
    handleGetEntitlementsUsageMetrics({ body: [usageOf('storage-gb', 50)] }),
    handleGetUpcomingInvoice({ body: upcoming(10_000) }),
  );
  void subscription;
});

/** What the API is asked to check and redeem, and what it answers each. */
function serveCode({
  redeem = () => HttpResponse.json(BOOST_REDEMPTION, { status: 201 }),
  validity = { valid: true, voucher: STORAGE_BOOST } as Validity,
}: {
  redeem?: () => Response;
  validity?: Validity;
} = {}) {
  const checked: unknown[] = [];
  const redeemed: unknown[] = [];
  server.use(
    handleValidateVoucher(async ({ request }) => {
      checked.push(await request.json());

      return HttpResponse.json(validity);
    }),
    handleRedeemVoucher(async ({ params, request }) => {
      redeemed.push({ body: await request.json(), instance: params.instanceSlug });

      return redeem();
    }),
  );

  return { checked, redeemed };
}

const renderDialog = (onClose = vi.fn()) => {
  const rendered = renderWithClient(<RedeemVoucherDialog onClose={onClose} />);

  return { ...rendered, onClose };
};
const codeField = () => screen.findByLabelText(/^Voucher code/);
const check = () => screen.findByRole('button', { name: 'Check the code' });

async function typeAndCheck(code = 'storage-boost-50') {
  await userEvent.type(await codeField(), code);
  await userEvent.click(await check());
}

describe('applying a code to an instance', () => {
  it('asks for the code, and does not offer to redeem anything before it was checked', async () => {
    renderDialog();

    expect(await screen.findByRole('dialog', { name: 'Apply a code to Globex Production' })).toBeInTheDocument();
    expect(await codeField()).toHaveAttribute('autocomplete', 'off');
    expect(screen.queryByRole('button', { name: 'Redeem the code' })).not.toBeInTheDocument();
  });

  it('checks the code against the instance, with the code in the body of the request', async () => {
    const { checked } = serveCode();
    renderDialog();

    await typeAndCheck('  storage-boost-50 ');

    await waitFor(() => expect(checked).toEqual([{ code: 'storage-boost-50', instanceSlug: 'globex-production' }]));
  });

  it('shows what a valid code offers, in plain language, and then offers to redeem it', async () => {
    serveCode();
    renderDialog();

    await typeAndCheck();

    const verdict = await screen.findByTestId('redeem-verdict-valid');
    expect(verdict).toHaveTextContent('Storage boost can be redeemed');
    expect(verdict).toHaveTextContent('Boost');
    expect(verdict).toHaveTextContent('Storage + 50, for 2 billing periods');
    expect(await screen.findByRole('button', { name: 'Redeem the code' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Check the code' })).not.toBeInTheDocument();
  });

  it.each([
    [{ reason: 'EXPIRED' }, 'This voucher has expired.'],
    [{ reason: 'ALREADY_REDEEMED' }, 'This instance has already redeemed this voucher.'],
    [{ reason: 'NOT_FOUND' }, 'No voucher has this code.'],
    [
      { reason: 'NOT_ELIGIBLE', rule: 'RESTRICTED_CUSTOMER' },
      'This voucher is reserved for another customer.',
    ],
    [{ reason: 'NOT_ELIGIBLE', rule: 'ANNUAL_ONLY' }, 'This voucher needs an annual subscription.'],
  ] as const)('says why a code cannot be redeemed (%j), and offers no redemption', async (answer, sentence) => {
    serveCode({ validity: { valid: false, ...answer } as Validity });
    renderDialog();

    await typeAndCheck();

    expect(await screen.findByTestId('redeem-verdict-invalid')).toHaveTextContent(sentence);
    expect(screen.queryByRole('button', { name: 'Redeem the code' })).not.toBeInTheDocument();
    expect(await check()).toBeInTheDocument();
  });

  it('forgets the verdict as soon as the code is changed: it was about the old one', async () => {
    serveCode();
    renderDialog();
    await typeAndCheck();
    await screen.findByTestId('redeem-verdict-valid');

    await userEvent.type(await codeField(), 'x');

    await waitFor(() => expect(screen.queryByTestId('redeem-verdict-valid')).not.toBeInTheDocument());
    expect(await check()).toBeInTheDocument();
  });

  it('needs a code before it checks anything', async () => {
    const { checked } = serveCode();
    renderDialog();

    await userEvent.click(await check());

    expect(await screen.findByText('Enter the code')).toBeInTheDocument();
    expect(checked).toEqual([]);
  });

  it('says why the check was refused, in the API words, with a way to ask again', async () => {
    server.use(handleValidateVoucher(() => refusal(503, { code: 'Billing.Down', detail: 'Billing is being moved.' })));
    renderDialog();

    await typeAndCheck();

    expect(await screen.findByText('Billing is being moved.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('redeeming a code', () => {
  it('sends the code for the instance, and shows what a boost did to the effective values, read from the API before and after', async () => {
    const { redeemed } = serveCode();
    let usage = 0;
    server.use(
      handleGetEntitlementsUsageMetrics(() =>
        HttpResponse.json([usageOf('storage-gb', redeemed.length === 0 ? 50 : 100 + usage++ * 0)]),
      ),
    );
    const { onClose } = renderDialog();
    await typeAndCheck();

    await userEvent.click(await screen.findByRole('button', { name: 'Redeem the code' }));

    const outcome = await screen.findByTestId('redeem-outcome');
    // The button that redeemed the code is gone with the form: the keyboard is not left on nothing.
    await waitFor(() => expect(outcome).toHaveFocus());
    expect(redeemed).toEqual([{ body: { code: 'storage-boost-50' }, instance: 'globex-production' }]);
    expect(outcome).toHaveTextContent('Storage boost');
    expect(outcome).toHaveTextContent('Storage: 50 → 100');
    expect(outcome).toHaveTextContent('Dec 1, 2026 (UTC)');
    expect(screen.getByRole('dialog', { name: 'Code applied to Globex Production' })).toBeInTheDocument();
    // The corner of the dialog closes it too: the one of the footer is the last.
    await userEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1) as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows what a discount did to the invoice the next boundary will issue, before and after', async () => {
    const { redeemed } = serveCode({
      redeem: () => HttpResponse.json(DISCOUNT_REDEMPTION, { status: 201 }),
      validity: { valid: true, voucher: WELCOME },
    });
    server.use(
      handleGetUpcomingInvoice(() =>
        HttpResponse.json(redeemed.length === 0 ? upcoming(10_000) : upcoming(8_000, 2_000)),
      ),
    );
    renderDialog();
    await typeAndCheck('welcome-spring-2027');

    await userEvent.click(await screen.findByRole('button', { name: 'Redeem the code' }));

    const invoice = await screen.findByTestId('redeem-outcome-invoice');
    expect(invoice).toHaveTextContent('Before$100.00');
    expect(invoice).toHaveTextContent('After$80.00');
    expect(invoice).toHaveTextContent('Discount$20.00');
    expect(screen.getByTestId('redeem-outcome')).toHaveTextContent('The next 3 invoices');
  });

  it('says only that the discount will show on the next invoice when there is no upcoming invoice to read', async () => {
    serveCode({
      redeem: () => HttpResponse.json(DISCOUNT_REDEMPTION, { status: 201 }),
      validity: { valid: true, voucher: WELCOME },
    });
    server.use(
      handleGetUpcomingInvoice(() =>
        refusal(404, { code: 'GetUpcomingInvoice.NotFound', detail: 'no subscription' }),
      ),
    );
    renderDialog();
    await typeAndCheck('welcome-spring-2027');

    await userEvent.click(await screen.findByRole('button', { name: 'Redeem the code' }));

    expect(await screen.findByTestId('redeem-outcome')).toHaveTextContent(
      'The discount will show on the next invoice this instance is issued.',
    );
    expect(screen.queryByTestId('redeem-outcome-invoice')).not.toBeInTheDocument();
  });

  it('shows the detail of a refusal, keeps the dialog on the code that was typed and redeems nothing', async () => {
    serveCode({
      redeem: () => refusal(422, { code: 'RedeemVoucher.Expired', detail: 'the voucher has expired' }),
    });
    renderDialog();
    await typeAndCheck();

    await userEvent.click(await screen.findByRole('button', { name: 'Redeem the code' }));

    expect(await screen.findByText('the voucher has expired')).toBeInTheDocument();
    expect(screen.queryByTestId('redeem-outcome')).not.toBeInTheDocument();
    expect(await codeField()).toHaveValue('storage-boost-50');
    // The code can still be redeemed once the person asks again.
    expect(screen.getByRole('button', { name: 'Redeem the code' })).toBeInTheDocument();
  });

  it('refreshes what the redemption changed once the API accepted it', async () => {
    serveCode();
    const { client } = renderDialog();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await typeAndCheck();

    await userEvent.click(await screen.findByRole('button', { name: 'Redeem the code' }));
    await screen.findByTestId('redeem-outcome');

    const keys = invalidate.mock.calls.map(
      ([filters]) => (filters?.queryKey?.[0] as { _id?: string } | undefined)?._id,
    );
    expect(keys).toEqual(
      expect.arrayContaining(['listInstanceVouchers', 'getEntitlementsUsageMetrics', 'getUpcomingInvoice', 'listVouchers']),
    );
  });

  it('keeps the code out of every address, storage and key of the cache of the page', async () => {
    serveCode();
    const { client } = renderDialog();
    await typeAndCheck();
    await userEvent.click(await screen.findByRole('button', { name: 'Redeem the code' }));
    await screen.findByTestId('redeem-outcome');

    expect(window.location.href).not.toMatch(/storage-boost/i);
    expect(JSON.stringify({ ...window.localStorage, ...window.sessionStorage })).not.toMatch(
      /storage-boost/i,
    );
    expect(
      JSON.stringify(client.getQueryCache().getAll().map(({ queryKey }) => queryKey)),
    ).not.toMatch(/storage-boost/i);
    // Nor is it written anywhere in the dialog once it is redeemed.
    expect(within(screen.getByRole('dialog')).queryByDisplayValue(/storage-boost/i)).not.toBeInTheDocument();
  });
});
