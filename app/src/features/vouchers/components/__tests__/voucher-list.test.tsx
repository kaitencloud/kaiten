import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Voucher } from '@/api-client';
import { handleListVouchers } from '@/api-client/msw.gen';
import { useBillingTexts } from '@/test-fixtures/billing-test-support';
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

  it('has the search as its only text field: a code is found by searching, not by a field of its own', async () => {
    renderScreen(<VouchersPageContent />);

    await screen.findByText('Welcome spring');
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByPlaceholderText('Name, code or customer')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Find' })).not.toBeInTheDocument();
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
