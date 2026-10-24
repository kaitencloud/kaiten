import { expect, it } from 'vite-plus/test';
import { Route as legacyIndex } from '../models';
import { Route as legacyNew } from '../models/new';
import { Route as legacyEdit } from '../models/$modelSlug/edit';

it.each([
  [legacyIndex, '/catalog/models'],
  [legacyNew, '/catalog/models/new'],
  [legacyEdit, '/catalog/models/$modelSlug/edit'],
])('redirects legacy model entries without losing entitlement/version context (%s)', (route, to) => {
  const search = { entitlementSlug: 'credits', licenseSlug: 'pro-v2' };
  const params = { modelSlug: 'fixture' };
  try {
    const beforeLoad = route.options.beforeLoad as (context: unknown) => void;
    beforeLoad({ search, params });
    throw new Error('Expected a redirect');
  } catch (redirect) {
    expect(redirect).toMatchObject({ options: { to, search, params } });
  }
});
