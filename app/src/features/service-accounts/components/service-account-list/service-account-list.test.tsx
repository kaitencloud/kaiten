import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { ServiceAccount } from '../../types';
import {
  hasActiveTokens,
  hasRevokedTokens,
  ServiceAccountList,
} from './service-account-list';

const mockNavigate = vi.fn();

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();

  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      if (typeof fallback === 'string') {
        return fallback;
      }

      const translations: Record<string, string> = {
        'Common.all': 'All',
        'Common.clearFilter': 'Clear filter',
        'Common.falseValue': 'False',
        'Common.filter': 'Filters',
        'Common.noResults': 'No results',
        'Common.trueValue': 'True',
        'Pages.Integrations.ServiceAccounts.Dialog.nameLabel': 'Name',
        'Pages.Integrations.ServiceAccounts.Filters.activeTokens': 'Active tokens',
        'Pages.Integrations.ServiceAccounts.Filters.revokedTokens':
          'Revoked tokens',
        'Pages.Integrations.ServiceAccounts.Token.filterActive': 'Active',
        'Pages.Integrations.ServiceAccounts.Token.filterAll': 'All',
        'Pages.Integrations.ServiceAccounts.Token.filterRevoked': 'Revoked',
        'Pages.Integrations.ServiceAccounts.createButton': 'Create Service Account',
        'Pages.Integrations.ServiceAccounts.createdAt': 'Created',
        'Pages.Integrations.ServiceAccounts.emptyState':
          'No service accounts yet. Create one to get started.',
        'Pages.Integrations.ServiceAccounts.generateToken': 'Generate Token',
        'Pages.Integrations.ServiceAccounts.noActiveTokens':
          'No active tokens. All tokens have been revoked.',
        'Pages.Integrations.ServiceAccounts.noRevokedTokens':
          'No revoked tokens.',
        'Pages.Integrations.ServiceAccounts.noTokens':
          'No tokens for this service account. Generate one to get started.',
        'Pages.Integrations.ServiceAccounts.tokensCount': '{{count}} token',
      };

      return translations[key] ?? key;
    },
  }),
}));

vi.mock('../../hooks/use-service-accounts-mutations', () => ({
  useServiceAccountsMutations: () => ({
    mutations: {
      createServiceAccount: { isPending: false },
      deleteToken: { isPending: false },
    },
    handlers: {
      handleCreateSA: vi.fn(),
      handleDeleteServiceAccount: vi.fn(),
      handleRevokeToken: vi.fn(),
    },
  }),
}));

const serviceAccounts: ServiceAccount[] = [
  {
    id: 'sa-1',
    slug: 'alpha',
    name: 'Alpha automation',
    createdAt: '2026-03-01T00:00:00.000Z',
    tokens: [
      {
        id: 'token-1',
        slug: 'alpha-active',
        name: 'Alpha Active Token',
        createdAt: '2026-03-01T00:00:00.000Z',
        createdBy: {
          id: 'user-1',
          name: 'Alice',
        },
        scopes: ['read:customers'],
        serviceAccountId: 'sa-1',
      },
    ],
  },
  {
    id: 'sa-2',
    slug: 'bravo',
    name: 'Bravo monitoring',
    createdAt: '2026-03-02T00:00:00.000Z',
    tokens: [
      {
        id: 'token-2',
        slug: 'bravo-revoked',
        name: 'Bravo Revoked Token',
        createdAt: '2026-03-02T00:00:00.000Z',
        createdBy: {
          id: 'user-2',
          name: 'Bob',
        },
        revokedAt: '2026-03-03T00:00:00.000Z',
        revokedBy: {
          id: 'user-3',
          name: 'Eve',
        },
        scopes: ['write:instances'],
        serviceAccountId: 'sa-2',
      },
    ],
  },
  {
    id: 'sa-3',
    slug: 'charlie',
    name: 'Charlie bridge',
    createdAt: '2026-03-03T00:00:00.000Z',
    tokens: [
      {
        id: 'token-3',
        slug: 'charlie-active',
        name: 'Charlie Active Token',
        createdAt: '2026-03-03T00:00:00.000Z',
        createdBy: {
          id: 'user-1',
          name: 'Alice',
        },
        scopes: ['read:feature_flags'],
        serviceAccountId: 'sa-3',
      },
      {
        id: 'token-4',
        slug: 'charlie-revoked',
        name: 'Charlie Revoked Token',
        createdAt: '2026-03-03T00:00:00.000Z',
        createdBy: {
          id: 'user-2',
          name: 'Bob',
        },
        revokedAt: '2026-03-04T00:00:00.000Z',
        revokedBy: {
          id: 'user-4',
          name: 'Mallory',
        },
        scopes: ['write:tokens'],
        serviceAccountId: 'sa-3',
      },
    ],
  },
];

const renderComponent = (
  props: Partial<ComponentProps<typeof ServiceAccountList>> = {},
) =>
  render(
    <ServiceAccountList
      serviceAccounts={props.serviceAccounts ?? serviceAccounts}
    />,
  );

describe('ServiceAccountList', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('removes the duplicated heading and navigates to the create route from the add button', () => {
    renderComponent();

    expect(
      screen.queryByRole('heading', { name: 'Service Accounts' }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Create Service Account' }),
    );

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/integrations/service-accounts/new',
    });
  });

  it('filters service accounts by name and shows no results when nothing matches', async () => {
    renderComponent();

    fireEvent.change(screen.getByPlaceholderText('Name'), {
      target: { value: 'Bravo' },
    });

    await waitFor(() => {
      expect(screen.getByText('Bravo monitoring')).toBeInTheDocument();
      expect(screen.queryByText('Alpha automation')).not.toBeInTheDocument();
      expect(screen.queryByText('Charlie bridge')).not.toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Name'), {
      target: { value: 'Missing account' },
    });

    await waitFor(() => {
      expect(screen.getByText('No results')).toBeInTheDocument();
    });
  });

  it('derives the active-token filter predicate from service-account data', () => {
    expect(hasActiveTokens(serviceAccounts[0])).toBe(true);
    expect(hasActiveTokens(serviceAccounts[1])).toBe(false);
    expect(hasActiveTokens(serviceAccounts[2])).toBe(true);
  });

  it('derives the revoked-token filter predicate from service-account data', () => {
    expect(hasRevokedTokens(serviceAccounts[0])).toBe(false);
    expect(hasRevokedTokens(serviceAccounts[1])).toBe(true);
    expect(hasRevokedTokens(serviceAccounts[2])).toBe(true);
  });

  it('renders the empty state when no service accounts exist', () => {
    renderComponent({ serviceAccounts: [] });

    expect(
      screen.getByText('No service accounts yet. Create one to get started.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('No results')).not.toBeInTheDocument();
  });

  it('opens the new-token page of the service account it was asked from', () => {
    renderComponent();

    const bravoRow = screen
      .getByText('Bravo monitoring')
      .closest('[data-slot="accordion-item"]');

    if (!(bravoRow instanceof HTMLElement)) {
      throw new Error('Expected Bravo service account row to be rendered');
    }

    fireEvent.click(
      within(bravoRow).getByRole('button', { name: 'Generate Token' }),
    );

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/integrations/service-accounts/$serviceAccountSlug/tokens/new',
      params: { serviceAccountSlug: 'bravo' },
    });
  });
});
