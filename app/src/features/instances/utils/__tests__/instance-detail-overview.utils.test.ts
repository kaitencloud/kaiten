import { afterEach, describe, expect, it } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import {
  formatDate,
  formatDateTime,
  formatDateTimeShort,
} from '../instance-detail-overview.utils';

afterEach(async () => {
  await testI18n.changeLanguage('en');
});

// Midday in UTC: the same day wherever the test runs.
const VALUE = '2027-10-13T12:00:00.000Z';

describe('the dates of the overview of an instance', () => {
  it('are written in the language of the app when the caller gives none', async () => {
    await testI18n.changeLanguage('fr');

    expect(formatDate(VALUE)).toBe('13 oct. 2027');
    expect(formatDateTime(VALUE)).toContain('13 oct. 2027');
    expect(formatDateTimeShort(VALUE)).toContain('13 oct.');
  });

  it('are written in English in an English app, and in the language a caller gives', () => {
    expect(formatDate(VALUE)).toBe('Oct 13, 2027');
    expect(formatDate(VALUE, 'fr')).toBe('13 oct. 2027');
  });
});
