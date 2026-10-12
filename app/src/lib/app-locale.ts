import i18n from 'i18next';

/**
 * The language the app is shown in: the one numbers, money and dates are
 * written in. Use this rather than the locale of the browser, which is not the
 * one the person picked in the settings.
 */
export function getAppLocale(): string {
  return i18n.language || 'en';
}
