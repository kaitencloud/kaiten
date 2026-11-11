import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import i18n from 'i18next';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Entitlement } from '@/api-client';
import { createDevMockConfig } from '@/e2e/msw/dev-world';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import en from '@/lib/i18n/locales/en';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import { setAiAccessInputsForTest } from '@/test-fixtures/ai-access';
import { EntitlementDetailPricingTab } from '../entitlement-detail-pricing-tab';

// The tab over the world of `pnpm run dev:mock`: the AI pools, their grants and
// rules as the mocked GraphQL `AiRateCard` and REST `listModels` serve them.

const { pool } = vi.hoisted(() => ({
  pool: { current: { slug: 'ai-credits', name: 'AI credits' } },
}));
vi.mock('../entitlement-detail-context', () => ({
  useEntitlementDetailContext: () => ({
    entitlement: { ...pool.current, type: 'NUMBER_AI_CREDIT' } as Entitlement,
  }),
}));
// Links render through the house Button (`nativeButton={false}`), which gives
// them the button role; the href is what they open.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    search,
    ...props
  }: {
    children: ReactNode;
    to: string;
    search?: Record<string, string>;
  }) => (
    <a
      {...props}
      href={`${to}${search ? `?${new URLSearchParams(search)}` : ''}`}
    >
      {children}
    </a>
  ),
}));

beforeEach(async () => {
  server.use(
    ...createMockHandlers(createDevMockConfig(), 'off', undefined, true),
    undeclaredApiRequest,
  );
  i18n.addResourceBundle('en', 'translation', en, true, true);
  await i18n.changeLanguage('en');
});

function renderTab(
  slug: string,
  version?: string,
  scopes: readonly string[] | null = null,
) {
  pool.current = { slug, name: slug };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  setAiAccessInputsForTest(client, { capability: true, flag: true });
  client.setQueryData(grantedScopesQueryKey, scopes);
  render(
    <QueryClientProvider client={client}>
      <EntitlementDetailPricingTab version={version} />
    </QueryClientProvider>,
  );
}

async function rowOf(licenseSlug: string) {
  const cell = await screen.findByText(new RegExp(`^${licenseSlug} ·`));
  return cell.closest('tr')!;
}

it('summarises each granting version and links each row to its rate card cell', async () => {
  renderTab('ai-credits');
  const table = await screen.findByRole('region', {
    name: en.AI.Pool.tableLabel,
  });
  expect(within(table).getAllByRole('row').length).toBeGreaterThan(5);

  const enterprise = await rowOf('enterprise-v2');
  expect(
    within(enterprise).getByRole('button', { name: /^Open .+ in the rate card$/ }),
  ).toHaveAttribute('href', '/ai/pricing?pool=ai-credits&version=enterprise-v2');
  expect(enterprise).toHaveTextContent('250,000');
  expect(enterprise).toHaveTextContent('+10 % → 275,000');
  expect(enterprise).toHaveTextContent(/\$[\d.]+ – \$[\d.]+/);

  const header = screen.getAllByRole('button', { name: en.AI.Pool.openRateCard });
  expect(header[0]).toHaveAttribute('href', '/ai/pricing?pool=ai-credits');
});

it('flags a version that grants the pool with no rule: its calls are refused', async () => {
  renderTab('ai-credits');
  const trial = await rowOf('trial');
  expect(within(trial).getByText(en.AI.Pool.noRule)).toBeInTheDocument();
  expect(trial).toHaveTextContent('hard limit');
});

it('dims archived versions, which still price the instances on them', async () => {
  renderTab('ai-credits');
  expect(await rowOf('starter')).toHaveClass('text-muted-foreground');
  expect(await rowOf('starter-v2')).not.toHaveClass('text-muted-foreground');
});

it('notes rules on a version that does not grant the pool and that no add-on grants it on', async () => {
  renderTab('partner-ai-credits');
  const row = await rowOf('enterprise');
  expect(within(row).getByText(en.AI.Pool.pricedNotGranted)).toBeInTheDocument();
  expect(row).toHaveTextContent(en.AI.Pool.grant.notGranted);
  expect(await rowOf('enterprise-v2')).not.toHaveTextContent(
    en.AI.Pool.pricedNotGranted,
  );
});

it('says "through add-on", not "not granted", where an add-on can grant the pool, and which one', async () => {
  renderTab('partner-ai-credits');
  const row = await rowOf('business');

  expect(row).not.toHaveTextContent(en.AI.Pool.grant.notGranted);
  expect(row).not.toHaveTextContent(en.AI.Pool.pricedNotGranted);
  const through = await within(row).findByRole('button', {
    name: 'Through add-on · Partner credit pack',
  });
  fireEvent.click(through);

  const details = await screen.findByRole('dialog');
  // True to what an add-on is: it can grant the pool, to an instance.
  expect(details).toHaveTextContent('It does not mean every instance holds it');
  expect(within(details).getAllByText('Partner credit pack')).toHaveLength(2);
  expect(details).toHaveTextContent('2,000 credits per unit');
  expect(details).toHaveTextContent(en.AI.Pool.addons.lifecycle.ARCHIVED);
  expect(details).toHaveTextContent(en.AI.Pool.addons.default);
});

it('keeps the boolean and says why the add-ons are not listed where billing is off', async () => {
  server.use(
    ...createMockHandlers(createDevMockConfig({ aiBilling: 'off' }), 'off', undefined, true),
  );
  renderTab('partner-ai-credits');
  const row = await rowOf('business');

  fireEvent.click(await within(row).findByRole('button', { name: en.AI.Pool.addons.through }));

  expect(await screen.findByRole('dialog')).toHaveTextContent(en.AI.Pool.addons.unreadable.BILLING_OFF);
});

it('does not ask for the add-ons of a session that may not read them', async () => {
  let asked = 0;
  server.events.on('request:start', ({ request }) => {
    void request.clone().text().then((body) => {
      if (body.includes('AiAddonGrants')) asked += 1;
    });
  });
  renderTab('partner-ai-credits', undefined, ['read:licenses', 'read:models', 'read:entitlements']);
  const row = await rowOf('business');

  fireEvent.click(await within(row).findByRole('button', { name: en.AI.Pool.addons.through }));

  expect(await screen.findByRole('dialog')).toHaveTextContent(en.AI.Pool.addons.unreadable.NO_SCOPE);
  expect(asked).toBe(0);
  server.events.removeAllListeners();
});

it('says what to do next for a pool neither granted nor priced', async () => {
  renderTab('agent-credits');
  const empty = (await screen.findByText(en.AI.Pool.emptyTitle)).closest(
    '[role="status"]',
  ) as HTMLElement;
  expect(
    within(empty).getByRole('button', { name: en.AI.Pool.openLicences }),
  ).toHaveAttribute('href', '/catalog/licenses');
  expect(
    within(empty).getByRole('button', { name: en.AI.Pool.openRateCard }),
  ).toHaveAttribute('href', '/ai/pricing?pool=agent-credits');
});

it('highlights the version named by ?version=', async () => {
  renderTab('ai-credits', 'business');
  expect(await rowOf('business')).toHaveClass('[&>td]:bg-accent');
});
