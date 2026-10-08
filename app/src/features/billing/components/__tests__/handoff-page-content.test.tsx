import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { Suspense } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { PageQueuedInvoice } from '@/api-client';
import { handleListHandoff } from '@/api-client/msw.gen';
import {
  createLoadedPageClient,
  pageOf,
  queuedRow,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { HandoffPageContent } from '../handoff/handoff-page-content';

const getAuthToken = vi.hoisted(() => vi.fn());
// Where the page is, which the tabs follow: a test moves it to the other part.
const location = vi.hoisted(() => ({
  pathname: '/billing/handoff',
  search: {} as Record<string, unknown>,
}));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('@tanstack/react-router', async () =>
  (await import('@/test-fixtures/billing-test-support')).createRouterModule(
    vi.fn(),
    location,
  ),
);

useBillingTexts();

beforeEach(() => {
  location.search = {};
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

const renderPage = (status: 'ACKNOWLEDGED' | 'PENDING' = 'PENDING') =>
  renderWithClient(
    <Suspense fallback={<p>Loading</p>}>
      <HandoffPageContent status={status} />
    </Suspense>,
    createLoadedPageClient(),
  );

describe('the page of the handoff queue', () => {
  it('titles the queue, and says how it is read', async () => {
    serveQueue(pageOf([queuedRow('inv-1', 'Initech')]));
    renderPage();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Handoff' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The invoices waiting for your ERP, oldest first/),
    ).toBeInTheDocument();
  });

  it('waits for the queue before it shows the page', async () => {
    let asked = false;
    server.use(
      handleListHandoff(async () => {
        asked = true;
        await delay('infinite');

        return HttpResponse.json(pageOf([]));
      }),
    );
    renderPage();
    // The request is the handler of this test's, and not the next one's.
    await waitFor(() => expect(asked).toBe(true));

    expect(screen.getByText('Loading')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('reads every page of the part of the queue it shows, 200 at a time, and lists them all', async () => {
    const asked = serveQueue(
      pageOf([queuedRow('inv-1', 'Initech')], 'cursor-2'),
      pageOf([queuedRow('inv-2', 'Globex')]),
    );
    renderPage();

    expect(await screen.findByText('Initech')).toBeInTheDocument();
    expect(screen.getByText('Globex')).toBeInTheDocument();
    expect(asked).toHaveLength(2);
    expect(asked[0].get('status')).toBe('PENDING');
    expect(asked[0].get('limit')).toBe('200');
    expect(asked[0].has('cursor')).toBe(false);
    expect(asked[1].get('cursor')).toBe('cursor-2');
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('asks for the other part of the queue when the URL does', async () => {
    const asked = serveQueue(pageOf([queuedRow('inv-1', 'Initech')]));
    renderPage('ACKNOWLEDGED');

    await screen.findByText('Initech');

    expect(asked[0].get('status')).toBe('ACKNOWLEDGED');
  });

  it('has a tab for each part of the queue, and what waits is the bare path', async () => {
    serveQueue(pageOf([queuedRow('inv-1', 'Initech')]));
    renderPage();

    expect(await screen.findByRole('link', { name: 'Waiting' })).toHaveAttribute(
      'href',
      '/billing/handoff',
    );
    expect(screen.getByRole('link', { name: 'Acknowledged' })).toHaveAttribute(
      'href',
      '/billing/handoff?status=ACKNOWLEDGED',
    );
  });

  it('draws as active the tab of the part of the queue the URL asks for', async () => {
    serveQueue(pageOf([queuedRow('inv-1', 'Initech')]));
    location.search = { status: 'ACKNOWLEDGED' };
    renderPage('ACKNOWLEDGED');

    const acknowledged = await screen.findByRole('link', {
      name: 'Acknowledged',
    });

    expect(acknowledged).toHaveClass('bg-background');
    expect(screen.getByRole('link', { name: 'Waiting' })).not.toHaveClass(
      'bg-background',
    );
  });

  it('starts each part of the queue with a search of its own', async () => {
    server.use(
      handleListHandoff(({ request }) =>
        HttpResponse.json(
          pageOf([
            new URL(request.url).searchParams.get('status') === 'ACKNOWLEDGED'
              ? queuedRow('inv-2', 'Globex')
              : queuedRow('inv-1', 'Initech'),
          ]),
        ),
      ),
    );
    const { rerender } = renderPage();
    await userEvent.type(
      await screen.findByPlaceholderText('Customer, instance or invoice'),
      'initech',
    );

    rerender(
      <Suspense fallback={<p>Loading</p>}>
        <HandoffPageContent status="ACKNOWLEDGED" />
      </Suspense>,
    );

    // The other part of the queue is read, and drawn with nothing typed in it.
    expect(await screen.findByText('Globex')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Customer, instance or invoice'),
    ).toHaveValue('');
  });
});
