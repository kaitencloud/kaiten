import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { handleGetBillingCapabilities } from '@/api-client/msw.gen';
import {
  billingCapabilities,
  billingCapabilitiesProfiles,
} from '../../../../../e2e/app/_support/model/billing-capabilities';
import {
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { SettingsPageContent } from '../settings-page-content';

const getAuthToken = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('@tanstack/react-router', async () =>
  (await import('@/test-fixtures/billing-test-support')).createRouterModule(
    vi.fn(),
  ),
);
vi.mock('../application-settings-section', () => ({
  ApplicationSettingsSection: () => <div>Application settings content</div>,
}));

useBillingTexts();

beforeEach(() => {
  getAuthToken.mockResolvedValue(
    sessionToken(['read:billing', 'read:instances', 'write:billing']),
  );
});

const billingOn = () =>
  server.use(
    handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }),
  );

describe('the billing entries of the settings page', () => {
  it('leads to the billing settings where billing is on', async () => {
    billingOn();
    renderWithClient(<SettingsPageContent />);

    expect(
      await screen.findByRole('link', { name: 'Open billing settings' }),
    ).toHaveAttribute('href', '/settings/billing');
  });

  it('has no card for billing where it is off: absent, not a way to an explanation', async () => {
    renderWithClient(<SettingsPageContent />);

    await screen.findByText('Application settings content');
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Open billing settings' })).toBeNull(),
    );
    expect(screen.queryByText('Billing')).toBeNull();
  });

  it('offers no way to the billing settings to a session that may not read them', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:instances']));
    billingOn();
    renderWithClient(<SettingsPageContent />);

    await screen.findByText('Export your data');
    expect(screen.queryByRole('link', { name: 'Open billing settings' })).toBeNull();
  });

  it('offers the export of the usage with or without billing, and the invoices only with it', async () => {
    const { unmount } = renderWithClient(<SettingsPageContent />);
    expect(await screen.findByTestId('usage-export')).toBeInTheDocument();
    expect(screen.queryByTestId('invoices-export')).toBeNull();
    unmount();

    billingOn();
    renderWithClient(<SettingsPageContent />);

    expect(await screen.findByTestId('invoices-export')).toBeInTheDocument();
    expect(screen.getByTestId('usage-export')).toBeInTheDocument();
  });

  it('has no export for a session that may export nothing', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:customers']));
    billingOn();
    renderWithClient(<SettingsPageContent />);

    await screen.findByText('Application settings content');
    await waitFor(() => expect(screen.queryByTestId('export-data')).toBeNull());
  });

  it('keeps the usage export where billing is off and says how long usage is kept', async () => {
    server.use(
      handleGetBillingCapabilities({
        body: billingCapabilities({
          disabledReason: 'DEPLOYMENT_DISABLED',
          enabled: false,
          usageHistoryRetentionMonths: 6,
        }),
      }),
    );
    renderWithClient(<SettingsPageContent />);

    // The retention is read from the capabilities, which arrive after the card.
    await waitFor(() =>
      expect(screen.getByTestId('usage-export')).toHaveTextContent(
        'Kaiten keeps 6 months of usage.',
      ),
    );
    // The month it is, and the six before.
    expect(
      within(screen.getByRole('list', { name: 'Months of usage' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(7);
  });
});
