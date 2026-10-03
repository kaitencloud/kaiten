import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import type { ComponentCatalogRelease } from '../../types';
import { ComponentReleasesDisplay } from '../component-releases-display';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const release = (
  version: string,
  status: ComponentCatalogRelease['status'],
): ComponentCatalogRelease => ({
  createdAt: '2026-03-01T10:00:00.000Z',
  id: `release-${version}`,
  slug: `release-${version}`,
  status,
  version,
});

const releases = [
  release('v1', 'Superseded'),
  release('v2', 'Deployed'),
  release('v3', 'Staging'),
  release('v4', 'Planned'),
];

// The label each status reads in each language, straight from the locale
// bundles the console ships: a raw status word in a French console fails here.
const labels = {
  en: {
    v1: 'Superseded',
    v2: 'Deployed',
    v3: 'Staging',
    v4: 'Planned',
  },
  fr: {
    v1: 'Remplacée',
    v2: 'Déployée',
    v3: 'En staging',
    v4: 'Planifiée',
  },
} as const;

describe('ComponentReleasesDisplay', () => {
  beforeAll(() => {
    testI18n.addResourceBundle('en', 'translation', en, true, true);
    testI18n.addResourceBundle('fr', 'translation', fr, true, true);
  });

  afterEach(async () => {
    cleanup();
    await testI18n.changeLanguage('en');
  });

  describe.each(['en', 'fr'] as const)('in %s', (language) => {
    it('reads the status of each release in the active language', async () => {
      await act(() => testI18n.changeLanguage(language));
      const user = userEvent.setup();

      render(
        <ComponentReleasesDisplay
          componentName="Billing API"
          releases={releases}
        />,
      );

      await user.click(screen.getByRole('button', { name: '4 releases' }));

      const dialog = await screen.findByRole('dialog');

      for (const [version, label] of Object.entries(labels[language])) {
        const row = within(dialog).getByText(version).closest('tr');

        if (!row) {
          throw new Error(`Expected the row of ${version}`);
        }

        expect(row, version).toHaveTextContent(label);
      }

      if (language === 'fr') {
        // None of the four raw English words is left.
        for (const word of Object.values(labels.en)) {
          expect(within(dialog).queryByText(word)).not.toBeInTheDocument();
        }
      }
    });
  });
});
