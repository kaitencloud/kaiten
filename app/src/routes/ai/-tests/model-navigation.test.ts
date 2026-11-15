import { expect, it } from 'vite-plus/test';
import { Route as catalogIndex } from '../../catalog/models';
import { Route as catalogNew } from '../../catalog/models/new';
import { Route as catalogImport } from '../../catalog/models/import';
import { Route as catalogEdit } from '../../catalog/models/$modelSlug/edit';
import { Route as catalogSource } from '../../catalog/models/$modelSlug/source';
import { Route as matrix } from '../matrix';
import { Route as aiIndex } from '../index';

function redirectOf(route: { options: { beforeLoad?: unknown } }, context: unknown) {
  const beforeLoad = route.options.beforeLoad as (context: unknown) => void;
  try {
    beforeLoad(context);
  } catch (redirect) {
    return redirect;
  }
  throw new Error('Expected a redirect');
}

const search = { entitlementSlug: 'credits', licenseSlug: 'pro-v2' };
const params = { modelSlug: 'fixture' };

it.each([
  [catalogIndex, '/ai/models'],
  [catalogNew, '/ai/models/new'],
  [catalogImport, '/ai/models/import'],
  [catalogEdit, '/ai/models/$modelSlug/edit'],
  [catalogSource, '/ai/models/$modelSlug/source'],
])('redirects an old Catalog model URL to the AI area, keeping its context (%#)', (route, to) => {
  expect(redirectOf(route, { search, params })).toMatchObject({
    options: { to, search },
  });
});

it('keeps the model of an old edit link', () => {
  expect(redirectOf(catalogEdit, { search, params })).toMatchObject({
    options: { params },
  });
});

it('opens the rate card on the pool and version an old matrix link named', () => {
  expect(redirectOf(matrix, { search })).toMatchObject({
    options: { to: '/ai/pricing', search: { pool: 'credits', version: 'pro-v2' } },
  });
});

it('opens the AI area on its rate card', () => {
  expect(redirectOf(aiIndex, {})).toMatchObject({
    options: { to: '/ai/pricing' },
  });
});
