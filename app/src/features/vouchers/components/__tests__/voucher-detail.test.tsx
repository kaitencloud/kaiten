import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Redemption, Voucher, VoucherDraft } from '@/api-client';
import {
  handleArchiveVoucher,
  handleGetVoucher,
  handleListVoucherRedemptions,
  handlePublishVoucher,
  handleRevokeInstanceVoucher,
  handleUpdateVoucher,
} from '@/api-client/msw.gen';
import { refusal, useBillingTexts } from '@/test-fixtures/billing-test-support';
import {
  buildRedemption,
  buildVoucher,
} from '../../../../../e2e/app/_support/fixtures';
import { VoucherDetailPage, VoucherEditDialog } from '../index';
import { renderScreen, serveReferences, sessionWith } from './voucher-test-support';

const getAuthToken = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@tanstack/react-router', async () =>
  (await import('./voucher-test-support')).createVoucherRouterModule(navigate),
);

useBillingTexts();

const WELCOME = buildVoucher({
  code: 'WELCOME-SPRING-2027',
  createdAt: '2026-02-20T09:00:00.000Z',
  description: 'Twenty percent off the base price',
  duration: 'REPEATING',
  durationInPeriods: 3,
  expiresAt: '2999-06-30T23:59:59.000Z',
  id: 'voucher-welcome',
  maxRedemptions: 100,
  name: 'Welcome spring',
  redemptionsCount: 2,
  restrictedCustomerSlug: 'hooli',
});
const FIRST = buildRedemption({
  applicationsCount: 1,
  applicationsMax: 3,
  id: 'r-1',
  instanceSlug: 'initech-annual',
  redeemedAt: '2026-03-01T10:00:00.000Z',
  voucher: WELCOME,
});
const SECOND = buildRedemption({
  applicationsMax: 3,
  id: 'r-2',
  instanceSlug: 'hooli-starter',
  redeemedAt: '2026-10-05T09:30:00.000Z',
  voucher: WELCOME,
});

function serveVoucher(
  voucher: Voucher,
  { redemptions = [FIRST, SECOND] }: { redemptions?: Redemption[] } = {},
) {
  server.use(
    handleGetVoucher(() => HttpResponse.json(voucher)),
    handleListVoucherRedemptions(() => HttpResponse.json(redemptions)),
  );
}

beforeEach(() => {
  navigate.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
  getAuthToken.mockResolvedValue(sessionWith());
  serveReferences();
  serveVoucher(WELCOME);
});

const renderPage = (id = 'voucher-welcome') =>
  renderScreen(<VoucherDetailPage voucherId={id} />);
const title = () => screen.findByRole('heading', { level: 1 });

describe('the page of a voucher', () => {
  it('gives its code in the header, under the name, with a copy button', async () => {
    renderPage();

    const heading = await title();
    expect(heading).toHaveTextContent('Welcome spring');
    const code = screen.getByTestId('voucher-code');
    expect(code).toHaveTextContent('WELCOME-SPRING-2027');
    // The header holds it, the title above it and the actions beside it; no card of its own.
    expect(code.closest('section')).toContainElement(heading);
    expect(screen.getByRole('group', { name: 'Voucher code' })).toContainElement(code);
    expect(screen.getByRole('button', { name: 'Copy the code' })).toBeInTheDocument();
    expect(screen.queryByText('Code ending in 2027')).not.toBeInTheDocument();
    expect(screen.queryByText('Give this code to the customer.', { exact: false })).not.toBeInTheDocument();
  });

  it('puts what it does and its details side by side, each in a card of its own', async () => {
    renderPage();

    await title();
    const offer = (await screen.findByText('What it does')).closest(
      '[data-slot="card"]',
    ) as HTMLElement;
    const details = screen.getByText('Details').closest('[data-slot="card"]') as HTMLElement;
    expect(offer).not.toBe(details);
    expect(offer.parentElement).toBe(details.parentElement);
    expect(within(offer).getByTestId('voucher-summary')).toBeInTheDocument();
    expect(within(details).queryByTestId('voucher-summary')).not.toBeInTheDocument();
    for (const label of ['Kind', 'Status', 'Redeemed', 'Created', 'Last changed']) {
      expect(within(details).getByText(label)).toBeInTheDocument();
    }
  });

  it('copies the code, and says it did', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Copy the code' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('WELCOME-SPRING-2027'));
    expect(toast.success).toHaveBeenCalledWith('Code copied');
  });

  it('says so when the clipboard refuses, and does not say the code was copied', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Copy the code' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('The code could not be copied'));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows only the end of the code, as plain text, to an answer that carries no code', async () => {
    serveVoucher({ ...WELCOME, code: undefined });
    renderPage();

    await title();
    expect(screen.queryByTestId('voucher-code')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy the code' })).not.toBeInTheDocument();
    expect(screen.getByText('Code ending in 2027')).toBeInTheDocument();
  });

  it('keeps the code out of the address, the storage and the cache of the page', async () => {
    const { client } = renderPage();

    await title();

    expect(window.location.href).not.toMatch(/WELCOME/);
    expect(JSON.stringify({ ...window.localStorage })).not.toMatch(/WELCOME/);
    expect(
      JSON.stringify(client.getQueryCache().getAll().map(({ queryKey }) => queryKey)),
    ).not.toMatch(/WELCOME/);
  });

  it('says what it does in plain language, naming the customer it is reserved for', async () => {
    renderPage();

    const summary = await screen.findByTestId('voucher-summary');
    await waitFor(() => expect(summary).toHaveTextContent('It is reserved for Hooli.'));
    expect(summary).toHaveTextContent('20% off the base price, on the next 3 invoices.');
    expect(summary).toHaveTextContent('It can be redeemed 100 times.');
    expect(summary).toHaveTextContent('It can be redeemed until Jun 30, 2999 (UTC).');
  });

  it('lists what was redeemed of it, by instance, with the invoices used and the state', async () => {
    renderPage();

    const first = await screen.findByRole('row', { name: /initech-annual/ });
    expect(first).toHaveTextContent('Mar 1, 2026 (UTC)');
    expect(first).toHaveTextContent('1/3 invoices');
    expect(screen.getByRole('row', { name: /hooli-starter/ })).toHaveTextContent('0/3 invoices');
  });

  it('says so when nothing was redeemed yet, and why the redemptions could not be read when they could not', async () => {
    serveVoucher(WELCOME, { redemptions: [] });
    const { unmount } = renderPage();
    expect(await screen.findByTestId('voucher-redemptions-empty')).toHaveTextContent(
      'No instance has redeemed this voucher yet.',
    );
    unmount();

    server.use(
      handleListVoucherRedemptions(() =>
        refusal(503, { code: 'Billing.Down', detail: 'Billing is being moved.' }),
      ),
    );
    renderPage();

    expect(await screen.findByText('Billing is being moved.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('what a state allows', () => {
  // The scopes of the session are read first: until they are, nothing is offered, and an
  // action that is not there would be one that was not yet.
  const loaded = async () => {
    await title();
    await screen.findByRole('row', { name: /initech-annual/ });
  };
  const actions = () => ({
    addBoost: screen.queryByRole('link', { name: /Add a boost/ }),
    archive: screen.queryByRole('button', { name: 'Archive' }),
    edit: screen.queryByRole('link', { name: 'Edit' }),
    publish: screen.queryByRole('button', { name: 'Publish' }),
  });

  it('lets a published voucher be edited in a dialog, given a boost and archived, and not published again', async () => {
    renderPage();
    await loaded();

    const { addBoost, archive, edit, publish } = actions();
    // The dialog is the page's own: the link stays on the page and says which dialog.
    expect(edit).toHaveAttribute('href', '.?mode=configure');
    expect(addBoost).toHaveAttribute('href', '/vouchers/new?boostFor=voucher-welcome');
    expect(archive).toBeInTheDocument();
    expect(publish).not.toBeInTheDocument();
  });

  it('lets a draft be finished in the wizard, published and archived, and offers no boost for it yet', async () => {
    serveVoucher({ ...WELCOME, status: 'DRAFT' });
    renderPage();
    await loaded();

    const { addBoost, archive, edit, publish } = actions();
    expect(edit).toHaveAttribute('href', '/vouchers/voucher-welcome/edit');
    expect(publish).toBeInTheDocument();
    expect(archive).toBeInTheDocument();
    expect(addBoost).not.toBeInTheDocument();
  });

  it.each(['EXHAUSTED', 'EXPIRED'] as const)(
    'lets a voucher the API closed (%s) be archived and read, and not edited',
    async (status) => {
      serveVoucher({ ...WELCOME, status });
      renderPage();
      await loaded();

      const { archive, edit, publish } = actions();
      expect(archive).toBeInTheDocument();
      expect(edit).not.toBeInTheDocument();
      expect(publish).not.toBeInTheDocument();
    },
  );

  it('lets an archived voucher be read only', async () => {
    serveVoucher({ ...WELCOME, status: 'ARCHIVED' });
    renderPage();
    await loaded();

    const { archive, edit, publish } = actions();
    expect(archive).not.toBeInTheDocument();
    expect(edit).not.toBeInTheDocument();
    expect(publish).not.toBeInTheDocument();
  });

  it('offers no boost for a boost', async () => {
    serveVoucher({ ...WELCOME, grants: [{ entitlementSlug: 'tokens', modifierType: 'ADD', modifierValue: '5' }], voucherType: 'ENTITLEMENT_BOOST' });
    renderPage();
    await loaded();

    expect(actions().addBoost).not.toBeInTheDocument();
  });

  it('offers nothing to a session that may only read vouchers', async () => {
    getAuthToken.mockResolvedValue(sessionWith(['read:vouchers', 'read:customers']));
    renderPage();
    await loaded();

    const { addBoost, archive, edit, publish } = actions();
    expect(edit).not.toBeInTheDocument();
    expect(addBoost).not.toBeInTheDocument();
    expect(archive).not.toBeInTheDocument();
    expect(publish).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Revoke/ })).not.toBeInTheDocument();
  });
});

describe('publishing and archiving', () => {
  it('asks first, then publishes the draft and says so', async () => {
    serveVoucher({ ...WELCOME, status: 'DRAFT' });
    const published: string[] = [];
    server.use(
      handlePublishVoucher(({ params }) => {
        published.push(String(params.voucherId));

        return HttpResponse.json({ ...WELCOME, status: 'ACTIVE' });
      }),
    );
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Publish' }));
    expect(published).toEqual([]);
    expect(await screen.findByText('Publish Welcome spring?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Publish', hidden: false }));

    await waitFor(() => expect(published).toEqual(['voucher-welcome']));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Voucher published'));
  });

  it('archives after a confirmation, and shows what the API says when it refuses', async () => {
    let calls = 0;
    server.use(
      handleArchiveVoucher(() => {
        calls += 1;

        return refusal(409, { code: 'ArchiveVoucher.AlreadyArchived', detail: 'the voucher is already archived' });
      }),
    );
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Archive' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Archive', hidden: false }));

    await waitFor(() => expect(calls).toBe(1));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('the voucher is already archived'));
  });
});

describe('revoking a redemption from the page of a voucher', () => {
  it('needs a reason, sends it for the redemption of the instance, and says it was revoked', async () => {
    const asked: Array<{ body: unknown; path: string }> = [];
    server.use(
      handleRevokeInstanceVoucher(async ({ params, request }) => {
        asked.push({
          body: await request.json(),
          path: `${String(params.instanceSlug)}/${String(params.instanceVoucherId)}`,
        });

        return HttpResponse.json({ ...FIRST, status: 'REVOKED' });
      }),
    );
    renderPage();

    const row = await screen.findByRole('row', { name: /initech-annual/ });
    await userEvent.click(within(row).getByRole('button', { name: 'Revoke Welcome spring' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = await within(dialog).findByRole('button', { name: 'Revoke' });
    expect(confirm).toBeDisabled();
    await userEvent.type(await within(dialog).findByLabelText(/Reason/), 'sales error');
    await userEvent.click(confirm);

    await waitFor(() => expect(asked).toEqual([{ body: { reason: 'sales error' }, path: 'initech-annual/r-1' }]));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Welcome spring revoked'));
  });
});

describe('changing a published voucher', () => {
  const renderDialog = (voucher: Voucher = WELCOME) => {
    const onClose = vi.fn();
    renderScreen(<VoucherEditDialog onClose={onClose} voucher={voucher} />);

    return { onClose };
  };

  it('starts from what the voucher holds, and cannot be saved until something changes', async () => {
    renderDialog();

    expect(await screen.findByLabelText(/^Name/)).toHaveValue('Welcome spring');
    expect(screen.getByLabelText(/^Description/)).toHaveValue('Twenty percent off the base price');
    expect(screen.getByLabelText(/^Maximum number of redemptions/)).toHaveValue('100');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('sends the voucher as stored with the four members the person changed, since the API compares the rest', async () => {
    const bodies: VoucherDraft[] = [];
    server.use(
      handleUpdateVoucher(async ({ request }) => {
        bodies.push((await request.json()) as VoucherDraft);

        return HttpResponse.json(WELCOME);
      }),
    );
    const { onClose } = renderDialog();

    const name = await screen.findByLabelText(/^Name/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Welcome spring 2027');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      code: 'WELCOME-SPRING-2027',
      duration: 'REPEATING',
      durationInPeriods: 3,
      expiresAt: '2999-06-30T23:59:00.000Z',
      maxRedemptions: 100,
      name: 'Welcome spring 2027',
      priceAppliesTo: 'LICENSE_BASE',
      priceDiscountType: 'PERCENTAGE',
      priceDiscountValue: '20',
      restrictedCustomerSlug: 'hooli',
      voucherType: 'PRICE',
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith('Voucher saved');
  });

  it('refuses before it is asked a maximum under the redemptions already made', async () => {
    renderDialog();

    const max = await screen.findByLabelText(/^Maximum number of redemptions/);
    await userEvent.clear(max);
    await userEvent.type(max, '1');

    expect(
      await screen.findByText('The voucher has already been redeemed more times than that'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('shows what the API refused on the field it is about, and stays open with what was typed', async () => {
    server.use(
      handleUpdateVoucher(() =>
        refusal(409, {
          code: 'UpdateVoucher.MaxRedemptionsBelowCount',
          detail: 'maxRedemptions is below the redemptions already made',
        }),
      ),
    );
    const { onClose } = renderDialog({ ...WELCOME, redemptionsCount: 0 });

    const max = await screen.findByLabelText(/^Maximum number of redemptions/);
    await userEvent.clear(max);
    await userEvent.type(max, '5');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('maxRedemptions is below the redemptions already made'),
    ).toBeInTheDocument();
    expect(max).toHaveValue('5');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('is not there for a voucher that is not published, nor for a session that may not write', async () => {
    const { unmount } = renderScreen(
      <VoucherEditDialog onClose={vi.fn()} voucher={{ ...WELCOME, status: 'ARCHIVED' }} />,
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    unmount();

    getAuthToken.mockResolvedValue(sessionWith(['read:vouchers']));
    renderScreen(<VoucherEditDialog onClose={vi.fn()} voucher={WELCOME} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
