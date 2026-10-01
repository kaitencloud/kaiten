import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import { webhooksFlagQueryOptions } from '@/lib/feature-flags';
// Initializes the shared i18next instance with the app's locales.
import '@/lib/i18n/config';
import { ScopeAccessTable } from '../scope-access-table';

function renderTableWith(webhooksEnabled: boolean | undefined) {
  const queryClient = new QueryClient({
    // No flag seeded stays unread: the table sees it being evaluated.
    defaultOptions: { queries: { enabled: false } },
  });
  if (webhooksEnabled !== undefined) {
    queryClient.setQueryData(
      webhooksFlagQueryOptions.queryKey,
      webhooksEnabled,
    );
  }
  render(
    <QueryClientProvider client={queryClient}>
      <ScopeAccessTable levels={{}} onLevelChange={() => {}} />
    </QueryClientProvider>,
  );
}

const rowFor = (resource: string) =>
  screen.queryByRole('group', { name: `Access to ${resource}` });

describe('ScopeAccessTable', () => {
  it('offers the webhooks scope where the webhooks flag is on', () => {
    renderTableWith(true);

    expect(rowFor('Webhooks')).toBeInTheDocument();
  });

  it.each<[string, boolean | undefined]>([
    ['a self-hosted deployment (flag off)', false],
    ['a flag still being evaluated', undefined],
  ])('leaves it out for %s, and keeps every other scope', (_, enabled) => {
    renderTableWith(enabled);

    expect(rowFor('Webhooks')).not.toBeInTheDocument();
    // Its group stays: the organization group holds more than webhooks.
    expect(rowFor('Metadata Fields')).toBeInTheDocument();
    expect(rowFor('Tokens')).toBeInTheDocument();
  });
});
