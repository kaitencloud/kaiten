import { expect, it } from 'vite-plus/test';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import { ApiError } from '../api-error';
import { mapApiError } from '../api-error-handler';
import { AI_API_ERROR_KEYS } from '../ai-error-messages';
function lookup(locale: unknown, key: string): unknown { return key.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, locale); }
it.each([en, fr])('provides every specific AI error key', (locale) => {
  for (const key of Object.values(AI_API_ERROR_KEYS)) expect(typeof lookup(locale, key)).toBe('string');
});
it('localizes known AI codes instead of server English without changing older errors', () => {
  const error = new ApiError({ status: 409, data: { code: 'DeleteModel.InUse', title: 'Conflict', detail: 'English server detail' } });
  expect(mapApiError(error, (key) => String(lookup(fr, key))).message).toContain('Une règle');
});
