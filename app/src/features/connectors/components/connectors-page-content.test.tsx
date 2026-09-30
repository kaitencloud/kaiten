import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vite-plus/test';
// Initializes the shared i18next instance used by the components.
import '@/lib/i18n/config';
import { ATTIO_LOGO_ASSETS } from '@/domains/crm-sync';
import { ConnectorsPageContent } from './connectors-page-content';

function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function expectAttioLogo() {
  expect(
    document.querySelector(`img[src="${ATTIO_LOGO_ASSETS.light}"]`),
  ).toBeInTheDocument();
  expect(
    document.querySelector(`img[src="${ATTIO_LOGO_ASSETS.dark}"]`),
  ).toBeInTheDocument();
}

describe('ConnectorsPageContent', () => {
  it('renders the connectors index when Attio is not connected', () => {
    renderWithProviders(
      <ConnectorsPageContent attioSettings={null} onOpenDetail={() => {}} />,
    );

    expect(screen.getByRole('heading', { name: 'CRM' })).toBeInTheDocument();
    expect(screen.getByText('Attio')).toBeInTheDocument();
    expectAttioLogo();
  });

  it('opens the setup wizard from the Attio connect button', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ConnectorsPageContent attioSettings={null} onOpenDetail={() => {}} />,
    );

    const connectButtons = screen.getAllByRole('button', { name: 'Connect' });
    const attioConnect = connectButtons.find(
      (button) => !button.hasAttribute('disabled'),
    );
    expect(attioConnect).toBeDefined();

    await user.click(attioConnect as HTMLElement);

    expect(screen.getByText('Connect Attio')).toBeInTheDocument();
    expect(
      screen.getByText('Connect to your Attio workspace'),
    ).toBeInTheDocument();
    expectAttioLogo();
  });
});
