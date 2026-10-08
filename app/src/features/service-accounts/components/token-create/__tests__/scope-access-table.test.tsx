import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import { webhooksServedQueryOptions } from '@/domains/webhooks';
// Initializes the shared i18next instance with the app's locales.
import '@/lib/i18n/config';
import { ScopeAccessTable } from '../scope-access-table';

function renderTableWith(webhooksServed: boolean | undefined) {
  const queryClient = new QueryClient({
    // No answer seeded stays unread: the table sees it being read.
    defaultOptions: { queries: { enabled: false } },
  });
  if (webhooksServed !== undefined) {
    queryClient.setQueryData(
      webhooksServedQueryOptions.queryKey,
      webhooksServed,
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
  it('offers the webhooks scope where webhooks are served', () => {
    renderTableWith(true);

    expect(rowFor('Webhooks')).toBeInTheDocument();
  });

  it.each<[string, boolean | undefined]>([
    ['a self-hosted deployment, or a licence without webhooks', false],
    ['an answer still being read', undefined],
  ])('leaves it out for %s, and keeps every other scope', (_, served) => {
    renderTableWith(served);

    expect(rowFor('Webhooks')).not.toBeInTheDocument();
    // Its group stays: the organization group holds more than webhooks.
    expect(rowFor('Metadata Fields')).toBeInTheDocument();
    expect(rowFor('Tokens')).toBeInTheDocument();
  });
});
