import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { PageQueuedInvoice } from '@/api-client';
import { handleListHandoff } from '@/api-client/msw.gen';
import { HandoffList } from '../handoff/handoff-list';
import {
  pageOf,
  queuedRow,
  refusal,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';

const getAuthToken = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('@tanstack/react-router', async () =>
  (await import('@/test-fixtures/billing-test-support')).createRouterModule(vi.fn()),
);

useBillingTexts();

beforeEach(() => {
  // A session that may write billing, as an administrator does.
  getAuthToken.mockResolvedValue(sessionToken(['write:billing']));
});

/** Answers each read of the queue with the next of `pages`, and records what the API was asked. */
function serveQueue(...pages: PageQueuedInvoice[]) {
  const asked: URLSearchParams[] = [];
  server.use(
    handleListHandoff(({ request }) => {
      asked.push(new URL(request.url).searchParams);

      return HttpResponse.json(pages[Math.min(asked.length, pages.length) - 1]);
    }),
  );

  return asked;
}

const renderList = (status: 'ACKNOWLEDGED' | 'PENDING' = 'PENDING') =>
  renderWithClient(<HandoffList status={status} />);

describe('the queue of the handoff', () => {
  it('says it is busy while the first page is on the way', () => {
    server.use(
      handleListHandoff(async () => {
        await delay('infinite');

        return HttpResponse.json(pageOf([]));
      }),
    );
    renderList();

    expect(
      screen.getByRole('status', { name: 'Loading the queue' }),
    ).toHaveAttribute('aria-busy', 'true');
  });

  it('asks the API for the part of the queue it shows, a page of fifty at a time', async () => {
    const asked = serveQueue(pageOf([queuedRow('inv-1', 'Initech')]));
    renderList('ACKNOWLEDGED');

    await screen.findByText('Initech');

    expect(asked[0].get('status')).toBe('ACKNOWLEDGED');
    expect(asked[0].get('limit')).toBe('50');
  });

  it('lists what waits, and reads the next page when asked', async () => {
    const asked = serveQueue(
      pageOf([queuedRow('inv-1', 'Initech')], 'cursor-2'),
      pageOf([queuedRow('inv-2', 'Globex')]),
    );
    renderList();

    expect(await screen.findByText('Initech')).toBeInTheDocument();
    expect(screen.getByTestId('handoff-count')).toHaveTextContent(
      '1 invoice shown',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('Globex')).toBeInTheDocument();
    expect(screen.getByText('Initech')).toBeInTheDocument();
    expect(asked[1].get('cursor')).toBe('cursor-2');
  });

  it('teaches the command that takes what waits when nothing does', async () => {
    serveQueue(pageOf([]));
    renderList();

    expect(await screen.findByTestId('handoff-empty')).toHaveTextContent(
      'kaiten billing handoff claim',
    );
  });

  it('shows why the API refused, and reads again when asked', async () => {
    let reads = 0;
    server.use(
      handleListHandoff(() => {
        reads += 1;

        return reads === 1
          ? refusal(500, { detail: 'the queue is unavailable' })
          : HttpResponse.json(pageOf([queuedRow('inv-1', 'Initech')]));
      }),
    );
    renderList();

    expect(await screen.findByTestId('handoff-error')).toHaveTextContent(
      'the queue is unavailable',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Initech')).toBeInTheDocument();
  });

  it('offers to acknowledge an invoice that waits to a session that may, and opens its dialog', async () => {
    serveQueue(pageOf([queuedRow('inv-1', 'Initech')]));
    renderList();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Acknowledge' }),
    );

    expect(
      await screen.findByRole('dialog', { name: 'Acknowledge the invoice' }),
    ).toBeInTheDocument();
  });

  it('offers nothing to a session that may only read', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:billing']));
    serveQueue(pageOf([queuedRow('inv-1', 'Initech')]));
    renderList();

    await screen.findByText('Initech');

    expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull();
  });

  it('shows the status each invoice is in, so that a void one that still waits is told from the rest', async () => {
    serveQueue(
      pageOf([
        queuedRow('inv-1', 'Initech'),
        queuedRow('inv-2', 'Globex', { status: 'VOID' }),
        queuedRow('inv-3', 'Hooli', { status: 'UNCOLLECTIBLE' }),
      ]),
    );
    renderList();

    await screen.findByText('Initech');

    expect(
      screen.getByRole('columnheader', { name: 'Status' }),
    ).toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Ready to bill');
    expect(rows[1]).toHaveTextContent('Void');
    expect(rows[2]).toHaveTextContent('Written off');
  });
});
