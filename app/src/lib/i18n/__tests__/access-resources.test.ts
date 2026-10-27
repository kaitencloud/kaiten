import { describe, expect, it } from 'vite-plus/test';

import { API_SCOPE_RESOURCES } from '@/lib/api/scopes.gen';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';

// The role editor and a user's effective access name each resource a scope opens.
// A resource the locale does not name shows its translation key instead.
describe('the resources of the access editors', () => {
  it.each([
    ['en', en.Pages.Access.resources],
    ['fr', fr.Pages.Access.resources],
  ])('all have a name in %s', (_, names) => {
    const unnamed = API_SCOPE_RESOURCES.filter((resource) => !(resource in names));
    expect(unnamed).toEqual([]);
  });
});
