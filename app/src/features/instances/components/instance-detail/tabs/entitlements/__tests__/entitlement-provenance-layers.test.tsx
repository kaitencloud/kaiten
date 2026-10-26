import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import type { Provenance } from '@/api-client';
import { DataTable } from '@/functionals/table';
import { renderWithClient, useBillingTexts } from '@/test-fixtures/billing-test-support';
import { buildUsageOnlyRow } from '../../../../../utils/usage-only-entitlement-row';
import { EntitlementProvenanceLayers } from '../entitlement-provenance-layers';

useBillingTexts();

describe('public entitlement provenance', () => {
  it('opens provenance without triggering the enclosing row action', async () => {
    const openEntitlement = vi.fn();
    const provenance: Provenance = {
      license: null,
      addons: [],
      boosts: [],
      number: null,
      exception: {
        instanceEntitlementExceptionId: 'exception-1',
        kind: 'SET',
        value: { type: 'boolean', value: false },
        startsAt: '2026-10-01T00:00:00Z',
        endsAt: null,
      },
    };
    function renderProvenance() {
      return <EntitlementProvenanceLayers name="SSO" provenance={provenance} />;
    }
    renderWithClient(<DataTable
      columns={[
        { accessorKey: 'name', header: 'Entitlement' },
        { id: 'provenance', header: 'Provenance', cell: renderProvenance },
      ]}
      data={[{ name: 'SSO' }]}
      onClickRow={openEntitlement}
    />);
    await userEvent.click(screen.getByRole('button', { name: 'Provenance of SSO' }));
    expect(await screen.findByTestId('entitlement-provenance-layers')).toHaveTextContent('Exception');
    expect(openEntitlement).not.toHaveBeenCalled();
  });

  it.each([
    { type: 'boolean' as const, value: false },
    { type: 'object' as const, value: { region: 'eu' } },
  ])('reads a typed $type boost and exception without private fields', async (value) => {
    const exception = { instanceEntitlementExceptionId: 'exception-1', kind: 'SET' as const, value, startsAt: '2026-10-01T00:00:00Z', endsAt: null };
    Object.defineProperty(exception, 'reason', { get: () => { throw new Error('Private reason read'); } });
    const provenance: Provenance = { license: null, addons: [], number: null, exception, boosts: [{ instanceVoucherId: 'private-code', voucherId: 'private-code', voucherEntitlementGrantId: 'grant-1', modifierType: 'SET', modifierValue: null, value, redeemedAt: '2026-10-01T00:00:00Z', effectiveStartsAt: '2026-10-01T00:00:00Z', effectiveExpiresAt: null }] };
    renderWithClient(<EntitlementProvenanceLayers name="SSO" provenance={provenance} />);
    await userEvent.click(screen.getByRole('button', { name: 'Provenance of SSO' }));
    const layers = await screen.findByTestId('entitlement-provenance-layers');
    expect(layers).toHaveTextContent('Voucher boost');
    expect(layers).toHaveTextContent('Exception');
    expect(layers).toHaveTextContent(value.type === 'boolean' ? 'Disabled' : '{"region":"eu"}');
    expect(layers).not.toHaveTextContent('private-code');
  });

  it('builds an exception-only BOOLEAN row from the effective limit', () => {
    const row = buildUsageOnlyRow({ entitlementId: 'sso-id', entitlementSlug: 'sso', licenseId: 'license-1', licenseSlug: 'pro', source: 'exception', value: { type: 'boolean', value: true }, limit: { type: 'boolean', value: false } }, { iconBySlug: new Map(), nameBySlug: new Map([['sso', 'SSO']]), typeBySlug: new Map([['sso', 'BOOLEAN']]) });
    expect(row).toMatchObject({ entitlementName: 'SSO', entitlementType: 'BOOLEAN', enabled: false, source: 'exception' });
  });
});
