import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import { TooltipProvider } from '@/components/ui/tooltip';
import '@/lib/i18n/config';
import { ATTIO_CONNECTOR_NAME } from '../../constants';
import { crmSyncStateQueryKey } from '../../queries/attio-sync-state';
import { IntegrationSyncBadge } from '../integration-sync-badge';

function renderBadge(status: 'idle' | 'pending' | 'delayed') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(
    crmSyncStateQueryKey({
      entityKind: 'customer',
      entitySlug: 'acme',
    }),
    { status },
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <IntegrationSyncBadge
          entityKind="customer"
          entitySlug="acme"
          integrations={{}}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('IntegrationSyncBadge', () => {
  it('renders a dash in the idle unlinked state', () => {
    renderBadge('idle');

    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('renders an animated pending indicator', () => {
    renderBadge('pending');

    expect(
      screen.getByLabelText('Attio synchronization in progress'),
    ).toHaveClass('animate-spin');
  });

  it('renders a delayed warning', () => {
    renderBadge('delayed');

    expect(
      screen.getByLabelText(
        'Attio synchronization is taking longer than expected',
      ),
    ).toBeInTheDocument();
  });

  it('shows the pending state over an existing integration during sync', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      crmSyncStateQueryKey({
        entityKind: 'customer',
        entitySlug: 'acme',
      }),
      { status: 'pending' },
    );

    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <IntegrationSyncBadge
            entityKind="customer"
            entitySlug="acme"
            integrations={{
              [ATTIO_CONNECTOR_NAME]: { external_id: 'attio-company-1' },
            }}
          />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    expect(
      screen.getByLabelText('Attio synchronization in progress'),
    ).toHaveClass('animate-spin');
    expect(
      screen.queryByLabelText('Synced with Attio'),
    ).not.toBeInTheDocument();
  });

  it('keeps the error tooltip short and opens accessible details', async () => {
    const user = userEvent.setup();
    const error =
      'attio companies uniqueness conflict: a value provided for the domains attribute conflicts with an existing record';
    const queryClient = new QueryClient();
    const onRowClick = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <div onClick={onRowClick}>
            <IntegrationSyncBadge
              entityKind="customer"
              entitySlug="acme"
              integrations={{
                [ATTIO_CONNECTOR_NAME]: {
                  external_id: 'attio-company-1',
                  synced_at: '2026-06-05T10:00:00Z',
                  last_error: error,
                },
              }}
            />
          </div>
        </TooltipProvider>
      </QueryClientProvider>,
    );

    const trigger = screen.getByRole('button', {
      name: 'View Attio synchronization error details',
    });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await user.hover(trigger);

    await screen.findByRole('tooltip');
    const tooltipContent = document.querySelector(
      '[data-slot="tooltip-content"]',
    );
    expect(tooltipContent).toHaveClass(
      'max-h-[min(16rem,calc(100dvh-2rem))]',
      'max-w-[min(28rem,calc(100vw-2rem))]',
      'overflow-hidden',
      'whitespace-normal',
    );
    const tooltipError = tooltipContent?.querySelector(
      '.line-clamp-4',
    ) as HTMLElement;
    expect(tooltipError).toHaveTextContent(error);
    expect(tooltipError).toHaveClass(
      'line-clamp-4',
      'break-words',
      '[overflow-wrap:anywhere]',
    );

    trigger.focus();
    await user.keyboard('{Enter}');

    const dialog = screen.getByRole('dialog', {
      name: 'Attio synchronization error',
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(within(dialog).getByText(error)).toBeInTheDocument();
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
