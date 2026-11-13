import { setAiAccessInputsForTest } from '@/test-fixtures/ai-access';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import type { ComponentProps, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import i18n from 'i18next';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import type { Model } from '@/api-client';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import { ModelsPage } from '../models-page';
import { modelsQueryOptions } from '../../queries/ai-query-options';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: ReactNode } & ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));
beforeEach(async () => {
  i18n.addResourceBundle('en', 'translation', en, true, true);
  i18n.addResourceBundle('fr', 'translation', fr, true, true);
  await i18n.changeLanguage('en');
});
const models = [
  { id: 'one', name: 'Workshop model', slug: 'workshop-model', vendor: 'Fixture supplier', modality: 'TEXT', status: 'ACTIVE' },
  { id: 'two', name: 'Image model', slug: 'image-model', vendor: 'Other supplier', modality: 'IMAGE', status: 'ARCHIVED' },
] as Model[];
function renderCatalogue() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  setAiAccessInputsForTest(client, { capability: true, flag: true });
  client.setQueryData(grantedScopesQueryKey, null);
  client.setQueryData(modelsQueryOptions.queryKey, { items: models, hasMore: false });
  render(<QueryClientProvider client={client}><ModelsPage /></QueryClientProvider>);
}
it('keeps all model identity/provider/status fields and Edit in compact cards, with one primary catalogue action', async () => {
  renderCatalogue();
  const list = screen.getByRole('list', { name: 'Models' });
  expect(list).toHaveClass('sm:hidden');
  const card = within(list).getAllByRole('listitem')[0];
  for (const text of ['Workshop model', 'workshop-model', 'Fixture supplier', 'Text', 'Active']) expect(within(card).getByText(text)).toBeInTheDocument();
  expect(within(card).getByText('Edit')).toBeInTheDocument();
  expect(within(card).getByRole('button', { name: 'Delete' })).toHaveAttribute('data-variant', 'ghost');
  expect(screen.getByText('Create model')).toHaveAttribute('data-variant', 'outline');
  expect(screen.getByText('Import from OpenRouter')).toHaveAttribute('data-variant', 'default');
  expect(screen.getByText('Conversion matrix')).toHaveAttribute('data-variant', 'outline');
  fireEvent.change(screen.getByLabelText('Search models'), { target: { value: 'Fixture supplier' } });
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  expect(screen.getByRole('status')).toHaveTextContent('1 of 2 models');
  fireEvent.change(screen.getByLabelText('Search models'), { target: { value: 'absent' } });
  expect(within(list).getByText(/No models match/)).toBeInTheDocument();
});
it('searches localized status and modality labels while retaining raw model identifiers', async () => {
  await i18n.changeLanguage('fr');
  renderCatalogue();
  fireEvent.change(screen.getByLabelText('Rechercher des modèles'), { target: { value: 'archivé' } });
  const list = screen.getByRole('list', { name: 'Modèles' });
  expect(within(list).getByText('image-model')).toBeInTheDocument();
  expect(within(list).getByText('Archivé')).toBeInTheDocument();
  expect(within(list).queryByText('workshop-model')).not.toBeInTheDocument();
});
