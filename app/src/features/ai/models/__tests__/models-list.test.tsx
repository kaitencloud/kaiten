import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import type { ComponentProps, ReactNode } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { ModelWritable } from '@/api-client';
import { createDevMockConfig } from '@/e2e/msw/dev-world';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import { configureApiClient } from '@/lib/api/configure-api-client';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import { setAiAccessInputsForTest } from '@/test-fixtures/ai-access';
import { ModelsPage } from '../models-page';

// The list over the world of `pnpm run dev:mock`: thirteen models, the rules
// that name them read from the rate card, and the API's refusals.

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    search,
    params: _params,
    ...props
  }: { children: ReactNode; to: string; search?: Record<string, unknown>; params?: unknown } & ComponentProps<'a'>) => (
    <a
      {...props}
      href={`${to}${search ? `?${new URLSearchParams(Object.entries(search).filter(([, value]) => value != null) as [string, string][])}` : ''}`}
    >
      {children}
    </a>
  ),
}));

beforeAll(() => configureApiClient());
beforeEach(async () => {
  configure({ asyncUtilTimeout: 8000 });
  i18n.addResourceBundle('en', 'translation', en, true, true);
  await i18n.changeLanguage('en');
});

function renderList(scopes: readonly string[] | null = null) {
  server.use(...createMockHandlers(createDevMockConfig(), 'off', undefined, true), undeclaredApiRequest);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY }, mutations: { retry: false } },
  });
  setAiAccessInputsForTest(client, { capability: true, flag: true });
  client.setQueryData(grantedScopesQueryKey, scopes);
  render(
    <QueryClientProvider client={client}>
      <ModelsPage />
    </QueryClientProvider>,
  );
}

/** The table row of a model, by its slug: searched for, since the list is paged by ten. */
async function rowOf(slug: string) {
  const table = await screen.findByRole('table');
  fireEvent.change(screen.getByLabelText(en.AI.Models.search), { target: { value: slug } });
  await waitFor(() => expect(within(table).getByText(slug)).toBeInTheDocument());

  return within(table).getByText(slug).closest('tr') as HTMLElement;
}

const clearSearch = () =>
  fireEvent.change(screen.getByLabelText(en.AI.Models.search), { target: { value: '' } });

const T = en.AI.Models;

describe('the columns of the model list', () => {
  it('shows the vendor cost per million tokens, or per unit', async () => {
    renderList();

    expect(await rowOf('claude-sonnet-4-5')).toHaveTextContent('$3 in · $15 out / 1M tokens');
    expect(await rowOf('text-embedding-3-small')).toHaveTextContent('$0.02 / 1M input tokens');
    expect(await rowOf('gpt-image-1')).toHaveTextContent('$0.04 / unit');
  });

  it('writes the cost as the language writes a number', async () => {
    i18n.addResourceBundle('fr', 'translation', fr, true, true);
    await i18n.changeLanguage('fr');
    renderList();
    const table = await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText(fr.AI.Models.search), { target: { value: 'gemini-2-5-flash-lite' } });

    await waitFor(() =>
      expect(within(table).getByText('0,1 $ en entrée · 0,4 $ en sortie / 1 M de jetons')).toBeInTheDocument(),
    );
  });

  it('counts the rules that name each model, and links to the rate card filtered on it', async () => {
    renderList();
    const sonnet = await rowOf('claude-sonnet-4-5');

    // Sonnet has its own rule on five versions, and one for the partner pool on two.
    const link = await within(sonnet).findByRole('button', { name: /^Open the rate card on Claude Sonnet 4\.5: \d+ rules name it$/ });
    expect(link).toHaveTextContent('6 rules');
    expect(link).toHaveAttribute('href', '/ai/pricing?q=claude-sonnet-4-5');
    expect(await within(await rowOf('voyage-3')).findByText('No rule')).toBeInTheDocument();
    // An archived model is hidden from the rate card unless asked for.
    expect(
      await within(await rowOf('whisper-large-v3')).findByRole('button', { name: /Open the rate card on Whisper/ }),
    ).toHaveAttribute('href', '/ai/pricing?q=whisper-large-v3&status=all');
  });

  it('shows a dash, not a zero, to a session that may not read the rules', async () => {
    renderList(['read:models']);
    const sonnet = await rowOf('claude-sonnet-4-5');

    expect(within(sonnet).queryByRole('button', { name: /Open the rate card/ })).toBeNull();
    expect(sonnet).not.toHaveTextContent('No rule');
  });

  it('filters by status, together with the search', async () => {
    renderList();
    await rowOf('voyage-3');
    clearSearch();

    await userEvent.click(screen.getByRole('combobox', { name: en.AI.status }));
    await userEvent.click(await screen.findByRole('option', { name: en.AI.enums.ARCHIVED }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 of 13 models'));
    expect(within(screen.getByRole('table')).getByText('whisper-large-v3')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).queryByText('voyage-3')).toBeNull();
  });
});

describe('deleting a model', () => {
  const press = async (slug: string, name: string) =>
    fireEvent.click(await within(await rowOf(slug)).findByRole('button', { name }));

  it('deletes a model no rule names, after the usual confirmation', async () => {
    renderList();
    await within(await rowOf('voyage-3')).findByText('No rule');
    await press('voyage-3', 'Delete Voyage 3');
    const dialog = await screen.findByRole('alertdialog');

    expect(dialog).toHaveTextContent(en.Common.confirmDeleteTitle);
    expect(within(dialog).queryByRole('button', { name: T.removal.archive })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: en.Common.delete }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(within(screen.getByRole('table')).queryByText('voyage-3')).toBeNull());
  });

  it('offers to archive a model that rules name, says what that does, and archives it', async () => {
    const sent: ModelWritable[] = [];
    renderList();
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'PUT') void request.clone().json().then((body) => sent.push(body as ModelWritable));
    });
    await within(await rowOf('gpt-5-mini')).findByRole('button', { name: /Open the rate card/ });
    await press('gpt-5-mini', 'Delete GPT-5 mini');
    const dialog = await screen.findByRole('alertdialog');

    expect(dialog).toHaveTextContent('GPT-5 mini cannot be deleted');
    expect(dialog).toHaveTextContent('2 rules name this model.');
    expect(dialog).toHaveTextContent('an archived model authorizes no usage');
    expect(within(dialog).queryByRole('button', { name: en.Common.delete })).toBeNull();
    expect(within(dialog).getByText(T.removal.openRules).closest('a')).toHaveAttribute(
      'href',
      '/ai/pricing?q=gpt-5-mini&status=all',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: T.removal.archive }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(async () => expect(await rowOf('gpt-5-mini')).toHaveTextContent(en.AI.enums.ARCHIVED));
    expect(sent).toEqual([expect.objectContaining({ slug: 'gpt-5-mini', status: 'ARCHIVED' })]);
    server.events.removeAllListeners();
  });

  it('turns a refusal of the API into the same offer: a rule the rate card does not list', async () => {
    renderList();
    // Opus is named by one rule, archived: the rate card counts none.
    await within(await rowOf('claude-opus-4-1')).findByText('No rule');
    await press('claude-opus-4-1', 'Delete Claude Opus 4.1');
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: en.Common.delete }));

    const dialog = await screen.findByRole('alertdialog');
    await waitFor(() => expect(dialog).toHaveTextContent('Claude Opus 4.1 cannot be deleted'));
    expect(dialog).toHaveTextContent(T.removal.refused);
    expect(within(dialog).getByRole('button', { name: T.removal.archive })).toBeEnabled();
    // Nothing was deleted: the model is still in the list behind the dialog.
    expect(within(screen.getByRole('table', { hidden: true })).getByText('claude-opus-4-1')).toBeInTheDocument();
  });

  it('says a model already archived is as far as it goes while a rule references it', async () => {
    renderList();
    // Archived in the catalogue, and named by no active rule: the API still refuses (mocked below).
    await within(await rowOf('whisper-large-v3')).findByText('No rule');
    const { handleDeleteModel } = await import('@/api-client/msw.gen');
    const { HttpResponse } = await import('msw/http');
    server.use(
      handleDeleteModel(() =>
        HttpResponse.json(
          { code: 'DeleteModel.InUse', detail: 'in use', status: 409, title: 'Conflict', type: 'about:blank' },
          { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    );
    await press('whisper-large-v3', 'Delete Whisper large v3');
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: en.Common.delete }));

    const dialog = await screen.findByRole('alertdialog');
    await waitFor(() => expect(dialog).toHaveTextContent(T.removal.alreadyArchived));
    expect(within(dialog).queryByRole('button', { name: T.removal.archive })).toBeNull();
  });

  it('shows another refusal of the API in the dialog, in the console’s words', async () => {
    renderList();
    await within(await rowOf('voyage-3')).findByText('No rule');
    const { handleDeleteModel } = await import('@/api-client/msw.gen');
    const { HttpResponse } = await import('msw/http');
    server.use(
      handleDeleteModel(() =>
        HttpResponse.json(
          { code: 'GetModel.NotFound', detail: 'gone', status: 404, title: 'Not Found', type: 'about:blank' },
          { status: 404, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    );
    await press('voyage-3', 'Delete Voyage 3');
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: en.Common.delete }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(en.AI.Errors.modelNotFound);
  });
});
