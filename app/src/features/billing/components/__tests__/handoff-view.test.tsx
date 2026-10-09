import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { Suspense } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { PageQueuedInvoice } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleListHandoff,
} from '@/api-client/msw.gen';
import {
  createLoadedPageClient,
  pageOf,
  queuedRow,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { billingCapabilitiesProfiles } from '../../../../../e2e/app/_support/model/billing-capabilities';
import { InvoicesPageContent } from '../invoices/invoices-page-content';

const getAuthToken = vi.hoisted(() => vi.fn());
// Where the page is, which the tabs follow: a test moves it to the other part.
const location = vi.hoisted(() => ({
  pathname: '/invoices',
  search: { view: 'handoff' } as Record<string, unknown>,
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
  location.search = { view: 'handoff' };
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

const renderPage = (queue?: 'ACKNOWLEDGED' | 'PENDING') =>
  renderWithClient(
    <Suspense fallback={<p>Loading</p>}>
      <InvoicesPageContent
        onScopeChange={vi.fn()}
        search={{ queue, view: 'handoff' }}
      />
    </Suspense>,
    createLoadedPageClient(),
  );

describe('the handoff view of the invoices', () => {
  it('is a view of the page of the invoices, and says how the queue is read', async () => {
    serveQueue(pageOf([queuedRow('inv-1', 'Initech')]));
    renderPage();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Invoices' }),
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

  it('has a tab for each part of the queue, and what waits is the bare view', async () => {
    serveQueue(pageOf([queuedRow('inv-1', 'Initech')]));
    renderPage();

    expect(await screen.findByRole('link', { name: 'Waiting' })).toHaveAttribute(
      'href',
      '/invoices?view=handoff',
    );
    expect(screen.getByRole('link', { name: 'Acknowledged' })).toHaveAttribute(
      'href',
      '/invoices?view=handoff&queue=ACKNOWLEDGED',
    );
  });

  it('draws as active the tab of the part of the queue the URL asks for', async () => {
    serveQueue(pageOf([queuedRow('inv-1', 'Initech')]));
    location.search = { queue: 'ACKNOWLEDGED', view: 'handoff' };
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
        <InvoicesPageContent
          onScopeChange={vi.fn()}
          search={{ queue: 'ACKNOWLEDGED', view: 'handoff' }}
        />
      </Suspense>,
    );

    // The other part of the queue is read, and drawn with nothing typed in it.
    expect(await screen.findByText('Globex')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Customer, instance or invoice'),
    ).toHaveValue('');
  });

  it('has the way back to every invoice in its toolbar, where the queue matters', async () => {
    server.use(
      handleGetBillingCapabilities({
        body: billingCapabilitiesProfiles.stack(),
      }),
    );
    serveQueue(pageOf([queuedRow('inv-1', 'Initech')]));
    renderPage();

    await screen.findByText('Initech');

    expect(await screen.findByRole('link', { name: 'All' })).toHaveAttribute(
      'href',
      '/invoices',
    );
    expect(screen.getByRole('link', { name: 'Handoff' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
