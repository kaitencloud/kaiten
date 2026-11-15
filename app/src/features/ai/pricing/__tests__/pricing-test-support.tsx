import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import i18n from 'i18next';
import { useEffect, useState } from 'react';
import { server } from '@/__tests__/msw-server';
import { pricingSettingsCollection } from '@/domains/ai-credits';
import { createDevMockConfig } from '@/e2e/msw/dev-world';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import en from '@/lib/i18n/locales/en';
import { setAiAccessInputsForTest } from '@/test-fixtures/ai-access';
import { PricingPage } from '../pricing-page';
import {
  type PricingSearch,
  readPricingSearch,
} from '../pricing-search.schema';
import { blocker, router } from './router-mock';

/** English copy, and nothing kept in the browser from the test before. */
export async function resetPricingTest() {
  i18n.addResourceBundle('en', 'translation', en, true, true);
  await i18n.changeLanguage('en');
  router.navigations.length = 0;
  router.listener = undefined;
  blocker.options = undefined;
  blocker.status = 'idle';
  blocker.proceeded = 0;
  blocker.resets = 0;
  const settings = pricingSettingsCollection();
  const stored = Array.from(settings.keys());
  if (stored.length > 0) {
    settings.delete(stored);
  }
}

function Harness({ initial }: { initial: PricingSearch }) {
  const [search, setSearch] = useState(initial);
  useEffect(() => {
    router.listener = (navigation) =>
      setSearch((previous) =>
        readPricingSearch(navigation.search?.(previous) ?? previous),
      );

    return () => {
      router.listener = undefined;
    };
  }, []);

  return <PricingPage search={search} />;
}

/**
 * The rate card over the world of `pnpm run dev:mock`, answered by the same
 * handlers, with a search the harness holds as the URL would. `scopes` null is a
 * session whose scopes are unknown: the API decides, the console shows all.
 */
export function renderPricing(
  initial: PricingSearch = {},
  scopes: readonly string[] | null = null,
) {
  server.use(
    ...createMockHandlers(createDevMockConfig(), 'off', undefined, true),
    undeclaredApiRequest,
  );
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
  setAiAccessInputsForTest(client, { capability: true, flag: true });
  client.setQueryData(grantedScopesQueryKey, scopes);
  render(
    <QueryClientProvider client={client}>
      <Harness initial={initial} />
    </QueryClientProvider>,
  );

  return client;
}

/** The button of a cell, by what the URL calls it: `<licence>~<model|any>`. */
export async function findCell(cell: string): Promise<HTMLElement> {
  await screen.findByRole('table', {
    name: i18n.t('AI.Pricing.grid.region'),
  });
  const button = document.querySelector<HTMLElement>(`[data-cell="${cell}"]`);
  if (!button) {
    throw new Error(`No cell ${cell} in the rate card`);
  }

  return button;
}
