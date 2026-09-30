import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import type {
  DeploymentZoneRelatedRelease,
  ReleaseManagementOverviewRelease,
} from '@/domains/release-management';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import { DeploymentZoneReleasesDisplay } from '../deployment-zone-releases-display';

// A zone as the overview lists it under a release: the zones the release ever
// reached, each carrying the release it runs NOW.
const zone = (id: string, type: string, releaseId: string) => ({
  createdAt: '2026-03-01T10:00:00.000Z',
  description: `${id} zone`,
  id,
  name: id,
  releaseId,
  slug: id,
  type,
  updatedAt: '2026-03-01T10:00:00.000Z',
});

const overviewRelease = (
  version: string,
  deploymentZones: ReturnType<typeof zone>[],
) =>
  ({
    components: [],
    createdAt: '2026-03-01T10:00:00.000Z',
    createdBy: { id: 'user-1', name: 'Jane Doe' },
    deploymentZones,
    description: null,
    id: `release-${version}`,
    instances: [],
    slug: `release-${version}`,
    version,
  }) as ReleaseManagementOverviewRelease;

// The zone "production" ran v1, then v2 replaced it; "staging" runs v3. Every
// release the zone ever ran is in its dialog, v4 (never shipped) apart.
const overview = [
  overviewRelease('v1', [zone('production', 'production', 'release-v2')]),
  overviewRelease('v2', [zone('production', 'production', 'release-v2')]),
  overviewRelease('v3', [zone('staging', 'staging', 'release-v3')]),
  overviewRelease('v4', []),
];

const releaseById = new Map(overview.map((release) => [release.id, release]));

const zoneReleases: DeploymentZoneRelatedRelease[] = overview.map(
  ({ createdAt, description, id, slug, version }) => ({
    createdAt,
    description,
    id,
    slug,
    version,
  }),
);

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

describe('DeploymentZoneReleasesDisplay', () => {
  beforeAll(() => {
    testI18n.addResourceBundle('en', 'translation', en, true, true);
    testI18n.addResourceBundle('fr', 'translation', fr, true, true);
  });

  afterEach(async () => {
    await testI18n.changeLanguage('en');
  });

  describe.each(['en', 'fr'] as const)('in %s', (language) => {
    it('reads a superseded release as Superseded, and every other status, in the active language', async () => {
      await testI18n.changeLanguage(language);
      const user = userEvent.setup();

      render(
        <DeploymentZoneReleasesDisplay
          releaseById={releaseById}
          releases={zoneReleases}
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

  it('shows a dash for a release the overview does not hold', async () => {
    const user = userEvent.setup();

    render(
      <DeploymentZoneReleasesDisplay
        releaseById={new Map()}
        releases={[zoneReleases[0]]}
      />,
    );

    await user.click(screen.getByRole('button', { name: '1 release' }));

    const dialog = await screen.findByRole('dialog');
    const row = within(dialog).getByText('v1').closest('tr');

    expect(row).toHaveTextContent('-');
    expect(row).not.toHaveTextContent('Planned');
  });
});
