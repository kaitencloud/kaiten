import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import { buildAuditTrailCsv } from '../audit-trail-export';
import { toGlobalAuditEntries } from '../audit-trail-flatten';
import { DEFAULT_AUDIT_FILTERS, filterAuditEntries } from '../audit-trail.utils';

// Who an entry is recorded under: a member by name, a service account, or
// Kaiten itself, which the API serves as the platform user's pinned id.
const KAITEN = {
  id: '00000000-0000-0000-0000-000000000001',
  kind: 'SYSTEM',
  name: 'Kaiten (system)',
};
const ADA = { id: 'user-ada', kind: 'USER', name: 'Ada Lovelace' };

const raw = (id: string, actor: typeof KAITEN | null) => ({
  actor,
  customerName: 'Acme',
  eventName: 'CUSTOMER_CREATED',
  eventType: 'com.kaiten.customer.v1.created',
  id,
  instanceId: null,
  instanceName: null,
  instanceSlug: null,
  payload: null,
  timestamp: `2026-10-0${id}T10:00:00.000Z`,
});

const entries = toGlobalAuditEntries([
  raw('1', KAITEN),
  raw('2', ADA),
  raw('3', null),
]);

const search = (query: string) =>
  filterAuditEntries(
    entries,
    { ...DEFAULT_AUDIT_FILTERS, search: query },
    (name) => name,
  ).map((entry) => entry.id);

beforeAll(async () => {
  testI18n.addResourceBundle('en', 'translation', en, true, true);
  testI18n.addResourceBundle('fr', 'translation', fr, true, true);
  await testI18n.changeLanguage('en');
});

afterAll(async () => {
  await testI18n.changeLanguage('en');
});

describe('the actor of an audit entry', () => {
  it('keeps the actor the API returns, and none for an entry without one', () => {
    expect(entries.find((entry) => entry.id === '2')?.actor).toEqual(ADA);
    expect(entries.find((entry) => entry.id === '3')?.actor).toBeUndefined();
  });

  it('finds an entry by the name of its actor', () => {
    expect(search('lovelace')).toEqual(['2']);
    expect(search('kaiten (system)')).toEqual(['1']);
  });

  it('finds the entries of Kaiten by the name the console gives it', async () => {
    await testI18n.changeLanguage('fr');

    expect(search('système')).toEqual(['1']);

    await testI18n.changeLanguage('en');
  });

  it('exports the actor and its kind, empty when the entry has none', () => {
    const [header, ...rows] = buildAuditTrailCsv(entries, (name) => name).split(
      /\r?\n/,
    );
    const row = (id: string) => rows.find((line) => line.startsWith(`${id},`));

    expect(header).toContain('customer,actor,actor_kind,status');
    expect(row('1')).toContain('Acme,Kaiten (system),SYSTEM,');
    expect(row('2')).toContain('Acme,Ada Lovelace,USER,');
    expect(row('3')).toContain('Acme,,,');
  });
});
