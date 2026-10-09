import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { QueuedInvoice } from '@/api-client';
import {
  queuedRow,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { HandoffList } from '../handoff/handoff-list';

const getAuthToken = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('@tanstack/react-router', async () =>
  (await import('@/test-fixtures/billing-test-support')).createRouterModule(
    vi.fn(),
  ),
);

useBillingTexts();

// The popovers of the Filter menu ask the DOM for what jsdom does not have.
for (const method of [
  'hasPointerCapture',
  'releasePointerCapture',
  'scrollIntoView',
  'setPointerCapture',
] as const) {
  Object.defineProperty(HTMLElement.prototype, method, {
    configurable: true,
    value: () => false,
  });
}

beforeEach(() => {
  // A session that may write billing, as an administrator does.
  getAuthToken.mockResolvedValue(sessionToken(['write:billing']));
});

const PAST = '2020-01-01T00:00:00.000Z';
const FUTURE = '2099-01-01T00:00:00.000Z';

/** Four invoices of the queue, issued a day apart, in every state the filters tell apart. */
const WAITING: QueuedInvoice[] = [
  queuedRow('inv-1', 'Initech', {
    dueAt: PAST,
    issuedAt: '2027-03-01T00:00:00.000Z',
    kind: 'ACTIVATION',
  }),
  queuedRow('inv-2', 'Globex', {
    dueAt: FUTURE,
    issuedAt: '2027-03-02T00:00:00.000Z',
  }),
  queuedRow('inv-3', 'Hooli', {
    issuedAt: '2027-03-03T00:00:00.000Z',
    status: 'VOID',
  }),
  queuedRow('inv-4', 'Initech', {
    dueAt: FUTURE,
    issuedAt: '2027-03-04T00:00:00.000Z',
    status: 'UNCOLLECTIBLE',
  }),
];

type Props = Partial<Parameters<typeof HandoffList>[0]>;

const renderList = (props: Props = {}) =>
  renderWithClient(
    <HandoffList invoices={WAITING} status="PENDING" {...props} />,
  );

/** The ids of the invoices the rows lead to, in the order of the rows. */
const rowIds = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole('link')[0]
        .getAttribute('href')
        ?.replace('/invoices/', ''),
    );

const searchBox = () =>
  screen.getByPlaceholderText('Customer, instance or invoice');

async function openFilterMenu() {
  await userEvent.click(screen.getByRole('button', { name: 'Filter' }));
  await screen.findByRole('option', { name: 'Status' });
}

describe('the list of the queue', () => {
  it('lists the invoices it is given, oldest issue first, under a search and a Filter button', () => {
    renderList({ invoices: [...WAITING].reverse() });

    expect(rowIds()).toEqual(['inv-1', 'inv-2', 'inv-3', 'inv-4']);
    expect(searchBox()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
  });

  it('says no count of the invoices and has no "Load more": the console holds them all', () => {
    renderList();

    expect(screen.queryByText(/invoices? shown/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('has no export, which the queue never had', () => {
    renderList();

    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
  });

  it('offers only the filters that tell one waiting invoice from another', async () => {
    renderList();

    await openFilterMenu();

    // What every invoice of the queue has in common is not a filter.
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['Status', 'Kind', 'Overdue']);
  });

  it('pages them in the browser, ten to a page', async () => {
    renderList({
      invoices: Array.from({ length: 12 }, (_, index) =>
        queuedRow(`inv-${index + 1}`, 'Initech', {
          issuedAt: new Date(Date.UTC(2027, 2, index + 1)).toISOString(),
        }),
      ),
    });

    expect(rowIds()).toHaveLength(10);
    expect(screen.getByText('Showing 1-10 of 12 records')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(rowIds()).toEqual(['inv-11', 'inv-12']);
  });
});

describe('the search of the queue', () => {
  it.each([
    ['the name of a customer, in any case', 'GLOBEX', ['inv-2']],
    ['the slug of an instance', 'hooli-production', ['inv-3']],
    ['the identifier of an invoice', 'inv-4', ['inv-4']],
  ])('matches %s', async (_, typed, expected) => {
    renderList();

    await userEvent.type(searchBox(), typed);

    await waitFor(() => expect(rowIds()).toEqual(expected));
  });

  it('matches the number the accounting system booked an invoice under', async () => {
    renderList({
      invoices: [
        queuedRow('inv-1', 'Initech', {
          handoff: {
            acknowledgedAt: '2027-03-05T09:00:00.000Z',
            claimCount: 1,
            externalReference: 'ERP-1042',
            status: 'ACKNOWLEDGED',
          },
          handoffStatus: 'ACKNOWLEDGED',
        }),
        queuedRow('inv-2', 'Globex', {
          handoff: {
            acknowledgedAt: '2027-03-05T10:00:00.000Z',
            claimCount: 0,
            status: 'ACKNOWLEDGED',
          },
          handoffStatus: 'ACKNOWLEDGED',
        }),
      ],
      status: 'ACKNOWLEDGED',
    });

    await userEvent.type(searchBox(), 'erp-10');

    await waitFor(() => expect(rowIds()).toEqual(['inv-1']));
  });

  it('says no invoice matches, and clears the search from the message', async () => {
    renderList();

    await userEvent.type(searchBox(), 'nobody');

    expect(await screen.findByTestId('handoff-empty')).toHaveTextContent(
      'No invoice matches these filters',
    );
    await userEvent.click(
      within(screen.getByTestId('handoff-empty')).getByRole('button', {
        name: 'Clear filters',
      }),
    );

    await waitFor(() => expect(rowIds()).toHaveLength(4));
    expect(searchBox()).toHaveValue('');
  });

  it('is kept when the queue is read again, as acknowledging an invoice does', async () => {
    const { rerender } = renderList();
    await userEvent.type(searchBox(), 'initech');
    await waitFor(() => expect(rowIds()).toEqual(['inv-1', 'inv-4']));

    // inv-1 was acknowledged: the queue is read again without it.
    rerender(
      <HandoffList invoices={WAITING.slice(1)} status="PENDING" />,
    );

    expect(searchBox()).toHaveValue('initech');
    await waitFor(() => expect(rowIds()).toEqual(['inv-4']));
  });
});

describe('the filters of the queue', () => {
  it('pick the statuses together, and say each one in a chip', async () => {
    renderList();

    await openFilterMenu();
    await userEvent.click(screen.getByRole('option', { name: 'Status' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Void' }));
    await userEvent.click(screen.getByRole('option', { name: 'Written off' }));

    await waitFor(() => expect(rowIds()).toEqual(['inv-3', 'inv-4']));
    expect(screen.getByText('Status: Written off, Void')).toBeInTheDocument();
  });

  it('select the invoices past their due date as the badge says them', async () => {
    renderList();

    await openFilterMenu();
    await userEvent.click(screen.getByRole('option', { name: 'Overdue' }));
    await userEvent.click(await screen.findByRole('option', { name: 'True' }));

    await waitFor(() => expect(rowIds()).toEqual(['inv-1']));
  });

  it('select a kind of invoice', async () => {
    renderList();

    await openFilterMenu();
    await userEvent.click(screen.getByRole('option', { name: 'Kind' }));
    await userEvent.click(
      await screen.findByRole('option', { name: 'Activation' }),
    );

    await waitFor(() => expect(rowIds()).toEqual(['inv-1']));
  });
});

describe('what a person does with the queue', () => {
  it('opens the dialog that acknowledges an invoice that waits, to a session that may', async () => {
    renderList({ invoices: [WAITING[1]] });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Acknowledge' }),
    );

    expect(
      await screen.findByRole('dialog', { name: 'Acknowledge the invoice' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId('acknowledge-handoff-invoice'),
    ).toHaveTextContent('Globex');
  });

  it('offers nothing to a session that may only read', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:billing']));
    renderList();

    await screen.findByText('Hooli');
    // The scopes of the session are read from its token: wait for them.
    await waitFor(() => expect(getAuthToken).toHaveBeenCalled());
    await act(() => Promise.resolve());

    expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
  });

  it('offers no acknowledgement for what was booked already', async () => {
    renderList({ status: 'ACKNOWLEDGED' });

    await screen.findByText('Hooli');

    expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull();
  });
});

describe('the empty queue', () => {
  it('teaches the command that takes what waits when nothing does', () => {
    renderList({ invoices: [] });

    expect(screen.getByTestId('handoff-empty')).toHaveTextContent(
      'kaiten billing handoff claim',
    );
  });

  it('says nothing was acknowledged yet, with no command to run', () => {
    renderList({ invoices: [], status: 'ACKNOWLEDGED' });

    expect(screen.getByTestId('handoff-empty')).toHaveTextContent(
      'Nothing acknowledged yet',
    );
  });
});
