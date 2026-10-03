import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import type { ReleaseStatus } from '@/domains/release-management';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import { InstanceReleaseCard } from '../release-card';

const renderCard = (releaseStatus: ReleaseStatus | null) =>
  render(
    <InstanceReleaseCard
      deployedAt="2026-03-01T10:00:00.000Z"
      deployedByName="Jane Doe"
      deploymentZone="Production"
      isDeployed
      releaseSlug={null}
      releaseStatus={releaseStatus}
      releaseVersion="v1.4.0"
      zoneSlug={null}
    />,
  );

// The Status row: its label, then the badge that holds the status.
const statusRow = (label: string) => {
  const row = screen.getByText(label).parentElement;

  if (!row) {
    throw new Error(`Expected the "${label}" row`);
  }

  return row;
};

const cases: [ReleaseStatus, string, string][] = [
  ['Deployed', 'Deployed', 'Déployée'],
  ['Staging', 'Staging', 'En staging'],
  ['Superseded', 'Superseded', 'Remplacée'],
  ['Planned', 'Planned', 'Planifiée'],
];

describe('InstanceReleaseCard release status', () => {
  beforeAll(() => {
    testI18n.addResourceBundle('en', 'translation', en, true, true);
    testI18n.addResourceBundle('fr', 'translation', fr, true, true);
  });

  afterEach(async () => {
    cleanup();
    await testI18n.changeLanguage('en');
  });

  it.each(cases)('reads %s in English', (status, english) => {
    renderCard(status);

    expect(within(statusRow('Status')).getByText(english)).toBeInTheDocument();
  });

  it.each(cases)(
    'reads %s in French, not as the English word',
    async (status, english, french) => {
      await act(() => testI18n.changeLanguage('fr'));
      renderCard(status);

      const row = statusRow('Statut');

      expect(within(row).getByText(french)).toBeInTheDocument();
      expect(within(row).queryByText(english)).not.toBeInTheDocument();
    },
  );

  it('reads Unknown when the release cannot be resolved', () => {
    renderCard(null);

    expect(
      within(statusRow('Status')).getByText('Unknown'),
    ).toBeInTheDocument();
  });
});
