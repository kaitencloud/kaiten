import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse } from 'msw/http';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Price } from '@/api-client';
import {
  handleDeleteLicense,
  handleDeleteLicenseEntitlement,
  handleDeprecateLicensePrice,
  handleGetBillingCapabilities,
  handleGetLicenseEntitlements,
  handleListLicensePrices,
} from '@/api-client/msw.gen';
import { billingCapabilitiesQueryOptions } from '@/domains/billing';
// For its side effect: the REST client then throws an `ApiError`, the status
// and the problem of a refusal, whose detail is what the hook reports.
import '@/lib/api/bootstrap';
import {
  buildEntitlement,
  buildGrant,
  buildLicense,
  buildPrice,
} from '../../../../../e2e/app/_support/fixtures';
import { billingCapabilitiesProfiles } from '../../../../../e2e/app/_support/model/billing-capabilities';
import { useDeleteLicenseDraft } from '../use-delete-license-draft';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const draft = buildLicense({
  description: 'Pro',
  id: 'license-pro-v4',
  lifecycleState: 'DRAFT',
  name: 'Pro',
  slug: 'pro-v4',
  type: 'PAID',
});
const traces = buildEntitlement({
  aggregationMethod: 'SUM',
  name: 'Traces',
  resetPeriod: 'MONTH',
  slug: 'traces',
});
const requests = buildEntitlement({
  aggregationMethod: 'COUNT',
  name: 'Requests',
  resetPeriod: 'DAY',
  slug: 'requests',
});
const grants = [
  buildGrant({ entitlement: traces, license: draft, value: 100_000 }),
  buildGrant({ entitlement: requests, license: draft, value: 1_000 }),
];

const metered = (slug: string): Price['metered'] => ({
  entitlementSlug: slug,
  saleUnitFactor: '1',
});
const prices = [
  buildPrice({ id: 'price-flat', unitAmountDecimal: '3900' }),
  buildPrice({
    billingModel: 'USAGE_BASED',
    id: 'price-requests',
    metered: metered('requests'),
    unitAmountDecimal: '150',
  }),
  buildPrice({
    billingModel: 'OVERAGE',
    deprecatedAt: '2026-03-02T09:00:00.000Z',
    id: 'price-traces-retired',
    metered: metered('traces'),
    status: 'DEPRECATED',
    unitAmountDecimal: '800',
  }),
];

// What reached the API, in the order it did.
let calls: string[];

function arm(billing: boolean) {
  calls = [];
  server.use(
    handleGetBillingCapabilities({
      body: billing
        ? billingCapabilitiesProfiles.stack()
        : billingCapabilitiesProfiles.disabled(),
    }),
    handleListLicensePrices(() => {
      calls.push('read prices');

      return HttpResponse.json(prices);
    }),
    handleGetLicenseEntitlements(() => {
      calls.push('read grants');

      return HttpResponse.json({ hasMore: false, items: grants });
    }),
    handleDeprecateLicensePrice(({ params }) => {
      calls.push(`deprecate ${params.priceId}`);

      return HttpResponse.json(prices[1]);
    }),
    handleDeleteLicenseEntitlement(({ params }) => {
      calls.push(`remove ${params.entitlementSlug}`);

      return new HttpResponse(null, { status: 204 });
    }),
    handleDeleteLicense(({ params }) => {
      calls.push(`delete ${params.licenseSlug}`);

      return new HttpResponse(null, { status: 204 });
    }),
  );
}

async function renderDeletion(onDeleted = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  // The capabilities are what tell whether the draft has prices to deal with: they
  // are read before the person asks for the deletion.
  await client.prefetchQuery(billingCapabilitiesQueryOptions);

  return {
    onDeleted,
    ...renderHook(() => useDeleteLicenseDraft(onDeleted), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }),
  };
}

beforeEach(() => {
  toast.error.mockClear();
  toast.success.mockClear();
});

describe('useDeleteLicenseDraft', () => {
  it('deprecates the active prices that meter a grant before it removes the grants, then the version', async () => {
    arm(true);
    const { onDeleted, result } = await renderDeletion();

    result.current.deleteDraft({ licenseSlug: 'pro-v4' });
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());

    // The flat fee blocks nothing and goes with the version, and the price that
    // was retired already needs nothing: only an active price that meters is
    // deprecated, and before any grant goes.
    expect(calls).toEqual([
      'read prices',
      'deprecate price-requests',
      'read grants',
      'remove traces',
      'remove requests',
      'delete pro-v4',
    ]);
    expect(toast.success).toHaveBeenCalledWith('Pages.Licenses.DeleteDraft.success');
  });

  it('leaves the grants and the version in place when a price cannot be deprecated, and says why', async () => {
    arm(true);
    server.use(
      handleDeprecateLicensePrice(({ params }) => {
        calls.push(`deprecate ${params.priceId}`);

        return HttpResponse.json(
          {
            code: 'DeprecateLicensePrice.PlanChangeTarget',
            detail: 'a scheduled plan change targets this price',
            status: 409,
            title: 'Conflict',
          },
          { status: 409 },
        );
      }),
    );
    const { onDeleted, result } = await renderDeletion();

    result.current.deleteDraft({ licenseSlug: 'pro-v4' });
    await waitFor(() => expect(toast.error).toHaveBeenCalled());

    // Nothing was removed: a refusal on the price comes before the first grant.
    expect(calls).toEqual(['read prices', 'deprecate price-requests']);
    expect(toast.error).toHaveBeenCalledWith(
      'a scheduled plan change targets this price',
    );
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('asks for no price where billing is not there, and removes the grants and the version', async () => {
    arm(false);
    const { onDeleted, result } = await renderDeletion();

    result.current.deleteDraft({ licenseSlug: 'pro-v4' });
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());

    expect(calls).toEqual([
      'read grants',
      'remove traces',
      'remove requests',
      'delete pro-v4',
    ]);
  });
});
