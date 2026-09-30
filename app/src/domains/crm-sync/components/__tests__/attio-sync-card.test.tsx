import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vite-plus/test';
// Initializes the shared i18next instance used by the components.
import '@/lib/i18n/config';
import { ATTIO_CONNECTOR_NAME, ATTIO_LOGO_ASSETS } from '../../constants';
import { crmSyncStateQueryKey } from '../../queries/attio-sync-state';
import { AttioSyncCard } from '../attio-sync-card';

const attio = (fields: Record<string, unknown>) => ({
  [ATTIO_CONNECTOR_NAME]: fields,
});

function renderCard(
  node: ReactNode,
  state?: {
    entityKind: 'customer' | 'instance';
    entitySlug: string;
    status: 'pending' | 'delayed';
  },
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (state) {
    queryClient.setQueryData(
      crmSyncStateQueryKey({
        entityKind: state.entityKind,
        entitySlug: state.entitySlug,
      }),
      { status: state.status },
    );
  }

  return render(
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>,
  );
}

describe('AttioSyncCard', () => {
  it('renders nothing when the entity is not linked to Attio', () => {
    const { container } = renderCard(
      <AttioSyncCard entityKind="customer" integrations={{}} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the customer wording with domain and sync details', () => {
    renderCard(
      <AttioSyncCard
        entityKind="customer"
        integrations={attio({
          external_id: 'rec_company_1',
          synced_at: '2026-06-05T10:00:00Z',
        })}
        domain="tesla.com"
      />,
    );

    expect(screen.getByText('Attio Synchronization')).toBeInTheDocument();
    expect(
      screen.getByText('This customer is linked to a CRM company'),
    ).toBeInTheDocument();
    expect(screen.getByText('tesla.com')).toBeInTheDocument();
    expect(screen.getByText('Synced')).toBeInTheDocument();
    expect(screen.queryByText('View in CRM')).not.toBeInTheDocument();
    expect(
      document.querySelector(`img[src="${ATTIO_LOGO_ASSETS.light}"]`),
    ).toBeInTheDocument();
    expect(
      document.querySelector(`img[src="${ATTIO_LOGO_ASSETS.dark}"]`),
    ).toBeInTheDocument();
    expect(
      document.querySelector(`img[src="${ATTIO_LOGO_ASSETS.light}"]`)
        ?.parentElement,
    ).toHaveClass('bg-white', 'dark:bg-black');
  });

  it('opens the synchronization error details from the error badge', async () => {
    const user = userEvent.setup();
    const error =
      'attio companies uniqueness conflict: domain already exists on another record';

    renderCard(
      <AttioSyncCard
        entityKind="instance"
        integrations={attio({
          external_id: 'rec_ws_1',
          synced_at: '2026-06-05T10:00:00Z',
          last_error: error,
        })}
      />,
    );

    expect(
      screen.getByText('This instance is linked to a CRM workspace'),
    ).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.queryByText('Domain')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('dialog', { name: 'Attio synchronization error' }),
    ).not.toBeInTheDocument();

    const trigger = screen.getByRole('button', {
      name: 'View Attio synchronization error details',
    });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');

    await user.click(trigger);

    const dialog = screen.getByRole('dialog', {
      name: 'Attio synchronization error',
    });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveClass('max-h-[calc(100dvh-2rem)]', 'overflow-y-auto');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('dialog', { name: 'Attio synchronization error' }),
    ).toBeInTheDocument();
    expect(screen.getByText('rec_ws_1')).toBeInTheDocument();
    expect(screen.getByText(error)).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(
      screen.queryByRole('dialog', { name: 'Attio synchronization error' }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('shows the CRM link only when the integration exposes a web url', () => {
    renderCard(
      <AttioSyncCard
        entityKind="instance"
        integrations={attio({
          external_id: 'rec_ws_1',
          web_url: 'https://app.attio.com/w/acme',
        })}
      />,
    );

    expect(screen.getByText('View in CRM')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in Attio' })).toHaveAttribute(
      'href',
      'https://app.attio.com/w/acme',
    );
  });

  it('renders the pending synchronization state', () => {
    renderCard(
      <AttioSyncCard
        entityKind="customer"
        entitySlug="pending-customer"
        integrations={{}}
      />,
      {
        entityKind: 'customer',
        entitySlug: 'pending-customer',
        status: 'pending',
      },
    );

    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(
      screen.getByText('Kaiten is creating the corresponding record in Attio.'),
    ).toBeInTheDocument();
  });

  it('shows the pending loader over an existing error during a retry', () => {
    const { container } = renderCard(
      <AttioSyncCard
        entityKind="customer"
        entitySlug="retrying-customer"
        integrations={attio({
          external_id: 'rec_company_1',
          synced_at: '2026-06-05T10:00:00Z',
          last_error: 'domain already exists',
        })}
        domain="unique.com"
      />,
      {
        entityKind: 'customer',
        entitySlug: 'retrying-customer',
        status: 'pending',
      },
    );

    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText('Error')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'View Attio synchronization error details',
      }),
    ).not.toBeInTheDocument();
  });

  it('renders the delayed synchronization state', () => {
    renderCard(
      <AttioSyncCard
        entityKind="instance"
        entitySlug="delayed-instance"
        integrations={{}}
      />,
      {
        entityKind: 'instance',
        entitySlug: 'delayed-instance',
        status: 'delayed',
      },
    );

    expect(
      screen.getByText('Attio synchronization is taking longer than expected'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'The synchronization is still running or will be retried in the background.',
      ),
    ).toBeInTheDocument();
  });
});
