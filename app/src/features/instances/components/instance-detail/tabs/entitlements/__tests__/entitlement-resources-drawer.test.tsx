import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type {
  EntitlementResource,
  PageEntitlementResource,
} from '@/api-client';
import { handleListEntitlementResources } from '@/api-client/msw.gen';
import {
  refusal,
  renderWithClient,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { EntitlementResourcesDrawer } from '../resources';

// The links of a table are anchors that say where they lead.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    search,
    to,
    ...props
  }: {
    children?: ReactNode;
    params: Record<string, string>;
    search: Record<string, string>;
    to: string;
  }) => (
    <a
      {...props}
      data-params={JSON.stringify(params)}
      data-search={JSON.stringify(search)}
      href={to}
    >
      {children}
    </a>
  ),
}));

useBillingTexts();

const resource = (
  resourceKey: string,
  value: number,
  eventCount = value,
): EntitlementResource => ({
  resourceKey,
  value: { event_count: eventCount, type: 'number', value },
});

/** Answers each read with the next of `pages`, and records the query of each. */
function serveResources(...pages: PageEntitlementResource[]) {
  const asked: URLSearchParams[] = [];
  server.use(
    handleListEntitlementResources(({ request }) => {
      asked.push(new URL(request.url).searchParams);

      return HttpResponse.json(pages[Math.min(asked.length, pages.length) - 1]);
    }),
  );

  return asked;
}

const LIMIT = { limitCapExceededOveragePercent: 0, threshold: 4 };

const renderDrawer = (
  options: {
    canViewHistory?: boolean;
    limit?: Parameters<typeof EntitlementResourcesDrawer>[0]['limit'];
    onClose?: () => void;
  } = {},
) => {
  const onClose = options.onClose ?? vi.fn();
  renderWithClient(
    <EntitlementResourcesDrawer
      canViewHistory={options.canViewHistory ?? true}
      entitlementName="Sources per competitor"
      entitlementSlug="sources-per-competitor"
      instanceName="Nagare Production"
      instanceSlug="nagare-production"
      limit={options.limit ?? LIMIT}
      locale="en-US"
      onClose={onClose}
    />,
  );

  return { onClose };
};

describe('the resources of an entitlement that counts per resource', () => {
  it('names the entitlement, the instance and the limit every resource is measured against, and is busy while the first page is on the way', () => {
    server.use(
      handleListEntitlementResources(async () => {
        await delay('infinite');

        return HttpResponse.json({ hasMore: false, items: [] });
      }),
    );
    renderDrawer();

    expect(screen.getByRole('dialog', { name: 'Resources' })).toHaveTextContent(
      'Sources per competitor on Nagare Production: one counter for each resource, each measured against the same limit (4).',
    );
    expect(
      screen.getByRole('status', { name: 'Loading the resources' }),
    ).toHaveAttribute('aria-busy', 'true');
  });

  it('lists the resources in the order the API gives, each with its counter, where it stands and how many reports made it', async () => {
    serveResources({
      hasMore: false,
      items: [resource('paid', 3), resource('schematic', 4, 5), resource('stigg', 1)],
    });
    renderDrawer();

    const table = await screen.findByRole('table');

    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Resource', 'Usage', 'Status', 'Reports', 'History']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual([
      'paid',
      'schematic',
      'stigg',
    ]);
    // Paid is at three quarters of the limit, Schematic is on it, and Stigg is far from it.
    expect(rows[0]).toHaveTextContent('Watch');
    expect(rows[1]).toHaveTextContent('Limit reached');
    expect(rows[1]).toHaveTextContent('5');
    expect(rows[2]).toHaveTextContent('Healthy');
    expect(screen.getByTestId('entitlement-resources-list')).toBeInTheDocument();
  });

  it('asks the API for the pair, a page of fifty and no cursor', async () => {
    const asked = serveResources({ hasMore: false, items: [resource('stigg', 1)] });
    renderDrawer();

    await screen.findByRole('table');

    expect(asked).toHaveLength(1);
    expect(asked[0].get('limit')).toBe('50');
    expect(asked[0].has('cursor')).toBe(false);
  });

  it('reads the next page after the cursor the API gave, and keeps the rows it has', async () => {
    const asked = serveResources(
      { hasMore: true, items: [resource('a', 1), resource('b', 1)], nextCursor: 'after-b' },
      { hasMore: false, items: [resource('c', 1)] },
    );
    renderDrawer();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Load more resources' }),
    );

    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(4));
    expect(asked[1].get('cursor')).toBe('after-b');
    expect(screen.queryByRole('button', { name: 'Load more resources' })).toBeNull();
    // It never says how many were read: the API does not say how many there are.
    expect(screen.queryByText(/resources? shown/)).toBeNull();
  });

  it('links each resource to the usage history narrowed to it, for a session that may read the history', async () => {
    serveResources({
      hasMore: false,
      items: [resource('comp:123', 2)],
    });
    renderDrawer();

    const link = await screen.findByRole('link', {
      name: 'Usage history of Sources per competitor for comp:123',
    });

    expect(link).toHaveAttribute(
      'href',
      '/customers/instances/$instanceSlug/entitlements',
    );
    expect(link).toHaveAttribute(
      'data-search',
      '{"history":"sources-per-competitor","resource":"comp:123"}',
    );
    expect(link).toHaveAttribute(
      'data-params',
      '{"instanceSlug":"nagare-production"}',
    );
  });

  it('offers no history to a session that may not read it, and does not drop the column header of the others', async () => {
    serveResources({ hasMore: false, items: [resource('stigg', 2)] });
    renderDrawer({ canViewHistory: false });

    const table = await screen.findByRole('table');

    expect(within(table).queryByRole('link')).toBeNull();
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Resource', 'Usage', 'Status', 'Reports']);
  });

  it('says the limit as the entitlement has it: no limit, or none known', async () => {
    serveResources({ hasMore: false, items: [resource('stigg', 2)] });
    const unlimited = renderWithClient(
      <EntitlementResourcesDrawer
        canViewHistory
        entitlementName="Sources"
        entitlementSlug="sources"
        instanceName="Nagare Production"
        instanceSlug="nagare-production"
        limit={{ limitCapExceededOveragePercent: -1, threshold: -1 }}
        locale="en-US"
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByRole('dialog')).toHaveTextContent('(Unlimited)');
    unlimited.unmount();
    renderWithClient(
      <EntitlementResourcesDrawer
        canViewHistory
        entitlementName="Sources"
        entitlementSlug="sources"
        instanceName="Nagare Production"
        instanceSlug="nagare-production"
        limit={{ limitCapExceededOveragePercent: null, threshold: null }}
        locale="en-US"
        onClose={vi.fn()}
      />,
    );
    expect((await screen.findAllByRole('dialog')).at(-1)).toHaveTextContent('(-)');
  });

  it('says there is none yet, and what creates one', async () => {
    serveResources({ hasMore: false, items: [] });
    renderDrawer();

    const empty = await screen.findByTestId('entitlement-resources-empty');

    expect(within(empty).getByText('No resources')).toBeInTheDocument();
    expect(
      within(empty).getByText(/The first accepted report for a resource creates it/),
    ).toBeInTheDocument();
  });

  it('shows a refusal in the API’s own words with a way to ask again, and reads again when asked', async () => {
    let calls = 0;
    server.use(
      handleListEntitlementResources(() => {
        calls += 1;

        return calls === 1
          ? refusal(422, {
              code: 'ListEntitlementResources.NotPerResource',
              detail: 'entitlement "api-calls" counts per instance: it has no resources',
            })
          : HttpResponse.json({ hasMore: false, items: [resource('stigg', 2)] });
      }),
    );
    renderDrawer();

    const problem = await screen.findByTestId('entitlement-resources-error');
    expect(problem).toHaveTextContent('counts per instance');
    await userEvent.click(within(problem).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it('closes when asked', async () => {
    serveResources({ hasMore: false, items: [] });
    const { onClose } = renderDrawer();
    await screen.findByTestId('entitlement-resources-empty');

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalled();
  });
});
