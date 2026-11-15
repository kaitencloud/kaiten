import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18n from 'i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import { AiNavigationProvider, modelsQueryOptions } from '@/domains/ai-credits';
import en from '@/lib/i18n/locales/en';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import { setAiAccessInputsForTest } from '@/test-fixtures/ai-access';
import { ModelImportPage } from '../model-import-page';
import {
  fetchOpenRouterCatalogue,
  OpenRouterError,
} from '../openrouter-catalogue';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

beforeEach(async () => {
  i18n.addResourceBundle('en', 'translation', en, true, true);
  await i18n.changeLanguage('en');
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it('reports a fetch the browser refuses (CSP, offline) as unreachable', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }),
  );
  await expect(fetchOpenRouterCatalogue()).rejects.toMatchObject({
    code: 'unreachable',
  });
});

it('keeps a cancellation by the caller a cancellation', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError');
    }),
  );
  const caller = new AbortController();
  caller.abort();
  await expect(fetchOpenRouterCatalogue(caller.signal)).rejects.not.toBeInstanceOf(
    OpenRouterError,
  );
});

it('explains an unreachable catalogue inline and offers manual creation', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  setAiAccessInputsForTest(client, { capability: true, flag: true });
  client.setQueryData(grantedScopesQueryKey, ['read:models', 'write:models']);
  client.setQueryData(modelsQueryOptions.queryKey, { items: [], hasMore: false });
  render(
    <QueryClientProvider client={client}>
      <AiNavigationProvider context={{}}>
        <ModelImportPage />
      </AiNavigationProvider>
    </QueryClientProvider>,
  );

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(en.AI.Models.openRouterUnreachable);
  expect(alert).toHaveTextContent(/openrouter\.ai/);
  const manual = screen.getAllByRole('link', { name: 'Create manually' });
  expect(manual.map((link) => link.getAttribute('href'))).toContain(
    '/ai/models/new',
  );

  // Retrying keeps the soft state while the browser still cannot reach it.
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
});
