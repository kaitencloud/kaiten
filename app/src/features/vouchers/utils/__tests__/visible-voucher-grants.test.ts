import { expect, it } from 'vite-plus/test';
import { visibleVoucherGrants } from '../visible-voucher-grants';
const names = { addons: {}, customers: {}, entitlements: {}, licenses: {}, prices: {}, entitlementTypes: { seats: 'NUMBER', credits: 'NUMBER_AI_CREDIT', calls: 'NUMBER' } };
it('filters display without reindexing or deleting canonical grants', () => {
  const grants = [{ entitlementSlug: 'seats' }, { entitlementSlug: 'credits' }, { entitlementSlug: 'calls' }, { entitlementSlug: 'unknown' }];
  expect(visibleVoucherGrants(grants, names, false)).toEqual([{ grant: grants[0], index: 0 }, { grant: grants[2], index: 2 }]);
  expect(grants).toHaveLength(4); expect(visibleVoucherGrants(grants, names, true)).toHaveLength(4);
});
