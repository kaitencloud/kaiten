import { render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import type { AuditTrail } from '@/api-client/types.gen';
import { testI18n } from '@/__tests__/test-i18n';
import { DataTable } from '@/functionals/table';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import { buildAuditTrailColumns } from '../audit-trail-columns';
import { filterAuditTrailEntries } from '../audit-trail.utils';

const entry = (id: string, actor: AuditTrail['actor']): AuditTrail => ({
  actor,
  eventName: 'INSTANCE_UPDATED',
  eventType: 'com.kaiten.instance.v1.updated',
  id,
  instanceId: 'instance-1',
  instanceSlug: 'acme-prod',
  payload: {},
  timestamp: '2026-10-22T10:00:00.000Z',
});

const entries: AuditTrail[] = [
  entry('1', {
    id: '00000000-0000-0000-0000-000000000001',
    kind: 'SYSTEM',
    name: 'Kaiten (system)',
  }),
  entry('2', { id: 'user-ada', kind: 'USER', name: 'Ada Lovelace' }),
  entry('3', null),
];

beforeAll(async () => {
  testI18n.addResourceBundle('en', 'translation', en, true, true);
  testI18n.addResourceBundle('fr', 'translation', fr, true, true);
  await testI18n.changeLanguage('en');
});

afterAll(async () => {
  await testI18n.changeLanguage('en');
});

function renderTable() {
  render(
    <DataTable
      columns={buildAuditTrailColumns(testI18n.t, 'en', [], 'Acme prod')}
      data={entries}
    />,
  );
}

describe('the actor in the instance audit tab', () => {
  it('names a member, and Kaiten itself as Kaiten (system)', () => {
    renderTable();

    expect(
      screen.getByRole('columnheader', { name: 'Actor' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Kaiten (system)')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });

  it('reads Kaiten (système) in French', async () => {
    await testI18n.changeLanguage('fr');
    renderTable();

    expect(screen.getByText('Kaiten (système)')).toBeInTheDocument();

    await testI18n.changeLanguage('en');
  });

  it('finds an entry by the name of its actor', () => {
    const ids = filterAuditTrailEntries(
      entries,
      {
        eventFilter: 'all',
        groupFilter: 'all',
        searchQuery: 'ada',
        statusFilter: 'all',
      },
      (eventName) => eventName,
      [],
    ).map((item) => item.id);

    expect(ids).toEqual(['2']);
  });
});
