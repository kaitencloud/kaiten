import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import type { License } from '@/api-client';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import { PriceStateNote } from '../prices/price-state-note';

// A link is only an anchor here: where it leads is what the tests read.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    search,
    to,
    ...props
  }: {
    children: ReactNode;
    params: { licenseSlug: string };
    search: Record<string, unknown>;
    to: string;
  }) => (
    <a
      {...props}
      href={`${to.replace('$licenseSlug', params.licenseSlug)}?${new URLSearchParams(
        Object.entries(search).map(([key, value]) => [key, String(value)]),
      )}`}
    >
      {children}
    </a>
  ),
}));

beforeAll(async () => {
  testI18n.addResourceBundle('en', 'translation', en, true, true);
  testI18n.addResourceBundle('fr', 'translation', fr, true, true);
  await testI18n.changeLanguage('en');
});

afterAll(async () => {
  await testI18n.changeLanguage('en');
});

type RenderOptions = {
  /** `null`: the token says nothing of scopes, so every action is offered. */
  scopes?: string[] | null;
  state: NonNullable<License['lifecycleState']>;
};

const renderNote = ({ scopes = null, state }: RenderOptions) => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(grantedScopesQueryKey, scopes);

  return render(
    <QueryClientProvider client={queryClient}>
      <PriceStateNote licenseSlug="pro-v2" state={state} />
    </QueryClientProvider>,
  );
};

const newVersion = () => screen.queryByRole('link', { name: 'New Version' });

describe('PriceStateNote', () => {
  it.each(['PUBLISHED', 'ARCHIVED'] as const)(
    'offers a new version on a %s one, started from it as a draft',
    (state) => {
      renderNote({ state });

      expect(newVersion()).toHaveAttribute(
        'href',
        '/catalog/licenses/versions/pro-v2?draft=true',
      );
    },
  );

  it('says what the state means, and offers a new version beside it', () => {
    renderNote({ state: 'ARCHIVED' });

    // The way out is in the note that says why there is need of one.
    expect(screen.getByRole('alert')).toHaveTextContent(
      /withdrawn from sale.*New Version/,
    );
  });

  it('offers none on a draft, which is changed in place', () => {
    renderNote({ state: 'DRAFT' });

    expect(screen.getByRole('alert')).toHaveTextContent(
      /prices of a draft can be edited/,
    );
    expect(newVersion()).toBeNull();
  });

  it('offers it to a session that may write licenses, and to none that may not', () => {
    const { unmount } = renderNote({
      scopes: ['read:licenses', 'write:licenses'],
      state: 'PUBLISHED',
    });
    expect(newVersion()).not.toBeNull();
    unmount();

    renderNote({ scopes: ['read:licenses'], state: 'PUBLISHED' });
    expect(newVersion()).toBeNull();
    // The note itself stays: it says why the prices cannot be changed.
    expect(screen.getByRole('alert')).toHaveTextContent(/immutable/);
  });
});
