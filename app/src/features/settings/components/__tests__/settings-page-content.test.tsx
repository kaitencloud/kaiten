import { screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import { renderWithClient } from '@/test-fixtures/billing-test-support';
import { SettingsPageContent } from '../settings-page-content';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('../application-settings-section', () => ({
  ApplicationSettingsSection: () => <div>Application settings content</div>,
}));

vi.mock('react-i18next', () => ({
  initReactI18next: {
    init: () => undefined,
    type: '3rdParty',
  },
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'Pages.Settings.App.description':
          'Manage local application settings stored in your browser.',
        'Pages.Settings.App.title': 'Application Settings',
        'Pages.Settings.Metadata.cardDescription':
          'Configure typed metadata fields for Deployment Zones and Instances.',
        'Pages.Settings.Metadata.configureFieldsButton':
          'Configure metadata fields',
        'Pages.Settings.Metadata.title': 'Metadata fields',
        'Pages.Settings.Notifications.configureButton':
          'Configure notifications',
        'Pages.Settings.subtitle':
          'Manage local application settings for this browser.',
        'Pages.Settings.title': 'Settings',
      };

      return translations[key] ?? key;
    },
  }),
}));

describe('SettingsPageContent', () => {
  it('renders settings sections', () => {
    // The billing entries read the capabilities, which the default network of the
    // unit tests answers as billing off: neither of them shows here.
    renderWithClient(<SettingsPageContent />);

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Metadata fields')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Configure metadata fields' }),
    ).toHaveAttribute('href', '/settings/metadata');
    expect(
      screen.getByRole('link', { name: 'Configure notifications' }),
    ).toHaveAttribute('href', '/settings/notifications');
    expect(screen.getByText('Application Settings')).toBeInTheDocument();
    expect(
      screen.getByText('Application settings content'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Authentication')).not.toBeInTheDocument();
    expect(screen.queryByText('Webhooks')).not.toBeInTheDocument();
    // The audit trail left Settings for its own entry in the side nav, and the
    // plan and appearance pages went with the React SDK they were built on.
    const hrefs = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href') ?? '');
    expect(hrefs.some((href) => href.includes('audit-trail'))).toBe(false);
    expect(hrefs).not.toContain('/settings/plan');
    expect(hrefs).not.toContain('/settings/appearance');
  });
});
