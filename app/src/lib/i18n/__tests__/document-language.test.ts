import { afterEach, describe, expect, it } from 'vite-plus/test';
import i18n from '../config';

describe('the language of the page', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('follows the language of the console, for screen readers and spelling', async () => {
    await i18n.changeLanguage('fr');
    expect(document.documentElement.lang).toBe('fr');

    await i18n.changeLanguage('en');
    expect(document.documentElement.lang).toBe('en');
  });
});
