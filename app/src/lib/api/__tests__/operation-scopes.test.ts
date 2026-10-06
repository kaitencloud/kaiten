import { describe, expect, it } from 'vite-plus/test';
import * as sdk from '@/api-client';
import { OPERATION_SCOPES } from '../operation-scopes.gen';
import { API_SCOPES } from '../scopes.gen';

// The table is generated from the contract's `security` blocks, and keyed by the
// name the SDK gives each operation. Both halves are what a screen relies on
// when it names an operation and reads the scope it needs.
describe('OPERATION_SCOPES', () => {
  it('names only operations the generated SDK exposes', () => {
    const sdkFunctions = new Set(
      Object.entries(sdk).flatMap(([name, value]) =>
        typeof value === 'function' ? [name] : [],
      ),
    );

    expect(
      Object.keys(OPERATION_SCOPES).filter((name) => !sdkFunctions.has(name)),
    ).toEqual([]);
  });

  it('requires only scopes a token can carry', () => {
    const carried = new Set<string>(API_SCOPES);

    expect(
      Object.entries(OPERATION_SCOPES).flatMap(([name, required]) =>
        required.filter((scope) => !carried.has(scope)).map((s) => `${name}: ${s}`),
      ),
    ).toEqual([]);
  });

  it('reads the scope of the billing operations off the contract', () => {
    expect(OPERATION_SCOPES.getBillingCapabilities).toEqual(['read:billing']);
    expect(OPERATION_SCOPES.markInvoicePaid).toEqual(['write:billing']);
    expect(OPERATION_SCOPES.previewLicenseInvoice).toEqual(['read:licenses']);
    expect(OPERATION_SCOPES.createLicensePrice).toEqual(['write:licenses']);
  });
});
