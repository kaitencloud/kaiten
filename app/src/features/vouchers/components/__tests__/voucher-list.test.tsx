import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Voucher } from '@/api-client';
import { handleListVouchers, handleLookupVoucher } from '@/api-client/msw.gen';
import { refusal, useBillingTexts } from '@/test-fixtures/billing-test-support';
import { buildVoucher } from '../../../../../e2e/app/_support/fixtures';
import { VouchersPageContent } from '../index';
import { renderScreen, serveReferences, sessionWith } from './voucher-test-support';

const getAuthToken = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('@tanstack/react-router', async () =>
  (await import('./voucher-test-support')).createVoucherRouterModule(navigate),
);

useBillingTexts();

const WELCOME = buildVoucher({
  code: 'WELCOME-SPRING-2027',
  createdAt: '2026-02-20T09:00:00.000Z',
  expiresAt: '2999-06-30T23:59:59.000Z',
  id: 'voucher-welcome',
  maxRedemptions: 100,
  name: 'Welcome spring',
  redemptionsCount: 2,
});
const HOOLI = buildVoucher({
  code: 'HOOLI-AGREEMENT-2026',
  createdAt: '2026-04-10T09:00:00.000Z',
  id: 'voucher-hooli',
  maxRedemptions: 1,
  name: 'Hooli agreement',
  redemptionsCount: 1,
  restrictedCustomerSlug: 'hooli',
});
const LAPSED = buildVoucher({
  code: 'SPRING-2026-PROMO',
  createdAt: '2026-03-01T09:00:00.000Z',
  expiresAt: '2020-06-30T23:59:59.000Z',
  id: 'voucher-lapsed',
  name: 'Spring promotion',
});
const DRAFT = buildVoucher({
  code: 'SUMMER-SALE-2027',
  id: 'voucher-draft',
  name: 'Summer sale',
  status: 'DRAFT',
});
const SCHEDULED = buildVoucher({
  code: 'NEW-YEAR-2999',
  id: 'voucher-scheduled',
  name: 'New year',
  startsAt: '2999-01-01T00:00:00.000Z',
});
const BOOST = buildVoucher({
  code: 'TOKENS-DOUBLE-Q4',
  grants: [{ entitlementSlug: 'tokens', modifierType: 'MULTIPLY', modifierValue: '2' }],
  id: 'voucher-boost',
  name: 'Tokens times two',
  voucherType: 'ENTITLEMENT_BOOST',
});

const VOUCHERS = [WELCOME, HOOLI, LAPSED, DRAFT, SCHEDULED, BOOST];

const serveList = (vouchers: Voucher[] = VOUCHERS) =>
  server.use(handleListVouchers(() => HttpResponse.json(vouchers)));

beforeEach(() => {
  navigate.mockReset();
  getAuthToken.mockResolvedValue(sessionWith());
  serveReferences();
  serveList();
});

const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) });

describe('the list of vouchers', () => {
  it('lists each voucher with its code, its kind, its state, how often it was redeemed, until when and for whom', async () => {
    renderScreen(<VouchersPageContent />);

    await screen.findByText('Welcome spring');
    expect(row('Welcome spring')).toHaveTextContent('WELCOME-SPRING-2027');
    expect(row('Welcome spring')).toHaveTextContent('Discount');
    expect(row('Welcome spring')).toHaveTextContent('Active');
    expect(row('Welcome spring')).toHaveTextContent('2 of 100');
    expect(row('Welcome spring')).toHaveTextContent('Jun 30, 2999 (UTC)');
    expect(row('Welcome spring')).toHaveTextContent('Any customer');
    expect(row('Tokens times two')).toHaveTextContent('Boost');
    expect(row('Tokens times two')).toHaveTextContent('0 (no limit)');
    expect(row('Tokens times two')).toHaveTextContent('No end date');
  });

  it('shows the state a person reads, which the console derives from the window and the count', async () => {
    renderScreen(<VouchersPageContent />);

    await screen.findByText('Welcome spring');
    expect(row('Hooli agreement')).toHaveTextContent('Fully redeemed');
    expect(row('Spring promotion')).toHaveTextContent('Expired');
    expect(row('Summer sale')).toHaveTextContent('Draft');
    expect(row('New year')).toHaveTextContent('Starts Jan 1, 2999 (UTC)');
  });

  it('names the customer a voucher is reserved for, when the session may list customers', async () => {
    renderScreen(<VouchersPageContent />);

    await screen.findByText('Welcome spring');
    await waitFor(() => expect(row('Hooli agreement')).toHaveTextContent('Hooli'));
    expect(row('Hooli agreement')).not.toHaveTextContent('Any customer');
  });

  it('leads each row to its voucher by its id', async () => {
    renderScreen(<VouchersPageContent />);

    expect(await screen.findByRole('link', { name: /Welcome spring/ })).toHaveAttribute(
      'href',
      '/vouchers/voucher-welcome',
    );
  });

  it('offers a new voucher to a session that may write them only', async () => {
    const { unmount } = renderScreen(<VouchersPageContent />);
    expect(await screen.findByRole('link', { name: /New voucher/ })).toHaveAttribute(
      'href',
      '/vouchers/new',
    );
    unmount();

    getAuthToken.mockResolvedValue(sessionWith(['read:vouchers', 'read:customers']));
    renderScreen(<VouchersPageContent />);

    await screen.findByText('Welcome spring');
    expect(screen.queryByRole('link', { name: /New voucher/ })).not.toBeInTheDocument();
  });

  it('says where a voucher comes from when there is none, and offers to make one', async () => {
    serveList([]);
    renderScreen(<VouchersPageContent />);

    const empty = await screen.findByTestId('vouchers-empty');
    expect(empty).toHaveTextContent('No voucher yet');
    expect(await within(empty).findByRole('link', { name: /New voucher/ })).toBeInTheDocument();
  });
});

describe('the search of the list', () => {
  it('matches the name, the code or the customer, in any case and in part', async () => {
    renderScreen(<VouchersPageContent />);
    await screen.findByText('Welcome spring');
    const search = screen.getByPlaceholderText('Name, code or customer');

    await userEvent.type(search, 'spring-2027');
    await waitFor(() => expect(screen.queryByText('Hooli agreement')).not.toBeInTheDocument());
    expect(screen.getByText('Welcome spring')).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, 'HOOLI');
    await waitFor(() => expect(screen.queryByText('Welcome spring')).not.toBeInTheDocument());
    expect(screen.getByText('Hooli agreement')).toBeInTheDocument();
  });

  it('says no voucher matches, and takes the filters off', async () => {
    renderScreen(<VouchersPageContent />);
    await screen.findByText('Welcome spring');

    await userEvent.type(screen.getByPlaceholderText('Name, code or customer'), 'zzz');

    expect(await screen.findByTestId('vouchers-filtered-empty')).toHaveTextContent(
      'No voucher matches',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Clear the filters' }));
    expect(await screen.findByText('Welcome spring')).toBeInTheDocument();
  });

  it('keeps what is typed in the memory of the page: the code is in no address and no storage', async () => {
    renderScreen(<VouchersPageContent />);
    await screen.findByText('Welcome spring');

    await userEvent.type(screen.getByPlaceholderText('Name, code or customer'), 'WELCOME-SPRING');

    expect(window.location.href).not.toMatch(/WELCOME/);
    expect(JSON.stringify({ ...window.localStorage })).not.toMatch(/WELCOME/);
    expect(JSON.stringify({ ...window.sessionStorage })).not.toMatch(/WELCOME/);
  });
});

describe('opening a voucher by its code', () => {
  function serveLookup(answer: (code: string) => Response) {
    const bodies: unknown[] = [];
    server.use(
      handleLookupVoucher(async ({ request }) => {
        const body = (await request.json()) as { code: string };
        bodies.push(body);

        return answer(body.code);
      }),
    );

    return bodies;
  }

  it('asks the API with the code in the body, goes to the voucher by its id and forgets the code', async () => {
    const bodies = serveLookup(() => HttpResponse.json(WELCOME));
    const { client } = renderScreen(<VouchersPageContent />);
    await screen.findByText('Welcome spring');

    await userEvent.type(screen.getByRole('textbox', { name: 'Voucher code' }), ' welcome-spring-2027 ');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        params: { voucherId: 'voucher-welcome' },
        to: '/vouchers/$voucherId',
      }),
    );
    expect(bodies).toEqual([{ code: 'welcome-spring-2027' }]);
    expect(screen.getByRole('textbox', { name: 'Voucher code' })).toHaveValue('');
    // The code is in no key of the cache.
    expect(JSON.stringify(client.getQueryCache().getAll().map(({ queryKey }) => queryKey))).not.toMatch(
      /welcome-spring/i,
    );
  });

  it('says no voucher has the code when the API says there is none, and says nothing more', async () => {
    serveLookup(() => refusal(404, { code: 'LookupVoucher.NotFound', detail: 'no voucher has this code' }));
    renderScreen(<VouchersPageContent />);
    await screen.findByText('Welcome spring');

    await userEvent.type(screen.getByRole('textbox', { name: 'Voucher code' }), 'NOPE-NOPE-NOPE');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));

    expect(await screen.findByText('No voucher has this code.')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    // Whoever comes back to the field hears it again.
    expect(screen.getByRole('textbox', { name: 'Voucher code' })).toHaveAccessibleDescription(
      /No voucher has this code\./,
    );
  });

  it('does not ask again while the first question is on its way, whether it is sent by the button or by Enter', async () => {
    let release: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      release = resolve;
    });
    const bodies: unknown[] = [];
    server.use(
      handleLookupVoucher(async ({ request }) => {
        bodies.push(await request.json());
        await answered;

        return HttpResponse.json(WELCOME);
      }),
    );
    renderScreen(<VouchersPageContent />);
    await screen.findByText('Welcome spring');
    const field = screen.getByRole('textbox', { name: 'Voucher code' });

    await userEvent.type(field, 'WELCOME-SPRING-2027');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    await userEvent.type(field, '{Enter}{Enter}');
    release();

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect(bodies).toHaveLength(1);
  });

  it('says why in the API words when the lookup is refused for another reason', async () => {
    serveLookup(() => refusal(503, { code: 'Billing.Down', detail: 'Billing is being moved.' }));
    renderScreen(<VouchersPageContent />);
    await screen.findByText('Welcome spring');

    await userEvent.type(screen.getByRole('textbox', { name: 'Voucher code' }), 'WELCOME-SPRING-2027');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));

    expect(await screen.findByText('Billing is being moved.')).toBeInTheDocument();
  });

  it('cannot be sent empty, and is a text field that no browser fills in', async () => {
    renderScreen(<VouchersPageContent />);
    await screen.findByText('Welcome spring');

    const field = screen.getByRole('textbox', { name: 'Voucher code' });
    expect(screen.getByRole('button', { name: 'Find' })).toBeDisabled();
    expect(field).toHaveAttribute('type', 'text');
    expect(field).toHaveAttribute('autocomplete', 'off');
  });
});
