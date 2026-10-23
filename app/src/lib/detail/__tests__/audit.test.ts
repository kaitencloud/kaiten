import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import { getAuditDisplayName } from '../audit';

beforeAll(async () => {
  testI18n.addResourceBundle('en', 'translation', en, true, true);
  testI18n.addResourceBundle('fr', 'translation', fr, true, true);
  await testI18n.changeLanguage('en');
});

afterAll(async () => {
  await testI18n.changeLanguage('en');
});

describe('getAuditDisplayName', () => {
  it('shows the name of a person, or their id when they have none', () => {
    expect(getAuditDisplayName({ actor: { id: 'user-1', name: 'Ada' } })).toBe(
      'Ada',
    );
    expect(getAuditDisplayName({ actor: { id: 'user-1' } })).toBe('user-1');
    expect(getAuditDisplayName({ actor: 'Ada' })).toBe('Ada');
  });

  it('shows nothing, or what it is told to, when no one is named', () => {
    expect(getAuditDisplayName({ actor: null })).toBe('');
    expect(getAuditDisplayName({ actor: undefined, fallbackId: 'u-9' })).toBe(
      'u-9',
    );
    expect(getAuditDisplayName({ actor: {}, unknownLabel: 'Unknown' })).toBe(
      'Unknown',
    );
  });

  describe('the system actor, which no person of the organization is', () => {
    // What the API serves for the platform user: its row is pinned to this id and named Kaiten.
    const platformUser = {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Kaiten',
    };

    it('reads as Kaiten (system), whether the API names it or only gives its id', () => {
      expect(getAuditDisplayName({ actor: platformUser })).toBe(
        'Kaiten (system)',
      );
      expect(getAuditDisplayName({ actor: { id: platformUser.id } })).toBe(
        'Kaiten (system)',
      );
      expect(getAuditDisplayName({ actor: { id: 'system:kaiten' } })).toBe(
        'Kaiten (system)',
      );
      expect(getAuditDisplayName({ actor: 'system:kaiten' })).toBe(
        'Kaiten (system)',
      );
    });

    it('reads as Kaiten (system) by the kind the API gives it, whatever its id', () => {
      expect(
        getAuditDisplayName({
          actor: { id: 'other-id', kind: 'SYSTEM', name: 'Kaiten (system)' },
        }),
      ).toBe('Kaiten (system)');
      expect(
        getAuditDisplayName({
          actor: { id: 'user-7', kind: 'USER', name: 'Kaiten' },
        }),
      ).toBe('Kaiten');
    });

    it('reads in the language of the console', async () => {
      await testI18n.changeLanguage('fr');

      expect(getAuditDisplayName({ actor: platformUser })).toBe(
        'Kaiten (système)',
      );

      await testI18n.changeLanguage('en');
    });

    it('does not take a person named Kaiten for it', () => {
      expect(
        getAuditDisplayName({ actor: { id: 'user-7', name: 'Kaiten' } }),
      ).toBe('Kaiten');
    });
  });
});
