import { expect, it } from 'vite-plus/test';
import { assertCopiableGrants } from '../ai-grant-preflight';
import { resolveLicenseEntitlements } from '../license-entitlements.utils';
const catalogue = [{ id: 'ordinary', name: 'Seats', slug: 'seats', type: 'NUMBER' }, { id: 'ai', name: 'Credits', slug: 'credits', type: 'NUMBER_AI_CREDIT' }] as never;
const rows = resolveLicenseEntitlements([{ entitlementName: 'Seats', entitlementType: 'NUMBER', value: { type: 'number', value: 5 } }, { entitlementName: 'Credits', entitlementType: 'NUMBER_AI_CREDIT', value: { type: 'number', value: 100 } }] as never, catalogue);
it('retains original AI identity despite numeric normalization', () => {
  expect(rows[1]).toMatchObject({ entitlementType: 'NUMBER', catalogueEntitlementType: 'NUMBER_AI_CREDIT' });
  expect(() => assertCopiableGrants(rows, catalogue, false)).toThrow('AIUsage.Disabled'); expect(rows).toHaveLength(2);
  expect(() => assertCopiableGrants(rows, catalogue, true)).not.toThrow(); expect(() => assertCopiableGrants([rows[0]], catalogue, false)).not.toThrow();
});
it('refuses unresolved grants instead of publishing a visible-only copy', () => { expect(() => assertCopiableGrants(rows, [], true)).toThrow(); });
