import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { License, LicenseFamilyView } from '@/api-client';
import { handleGetLicenseEntitlements } from '@/api-client/msw.gen';
import { pageOf } from '@/test-fixtures/billing-test-support';
import {
  buildEntitlement,
  buildGrant,
  buildLicense,
} from '../../../../../e2e/app/_support/fixtures';
import {
  entitlementsQueryOptions,
  licenseEntitlementsQueryOptions,
} from '../../queries';
import { useLicenseVersionForm } from '../forms/use-license-version-form';

const queryClient = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock('@tanstack/react-router', () => ({
  useRouteContext: () => ({ queryClient: queryClient.current }),
  useRouter: () => ({ navigate: vi.fn() }),
}));

const seats = buildEntitlement({ name: 'Seats', slug: 'seats' });
const business = buildLicense({
  description: 'The business plan',
  familyId: 'family-business',
  id: 'license-business',
  isDefault: true,
  name: 'Business',
  slug: 'business',
  type: 'PAID',
  versionName: 'Business v1',
});
const families = [
  { id: 'family-business', currentVersion: business, slug: 'business' },
] as unknown as LicenseFamilyView[];
const grants = [
  buildGrant({
    entitlement: seats,
    license: business,
    value: 25,
  }),
];

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.current = client;
  client.setQueryData(entitlementsQueryOptions.queryKey, pageOf([seats]));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const render = () =>
    renderHook(
      () =>
        useLicenseVersionForm({
          availableFamilies: families,
          availableLicenses: [business] as License[],
          selectedLicenseSlug: 'business',
        }),
      { wrapper },
    );

  return { client, render };
}

beforeEach(() => {
  queryClient.current = undefined;
});

describe('useLicenseVersionForm', () => {
  // The route's loader reads the grants of the version the form starts from. The
  // draft starts with them, so that the table is not drawn empty and filled in a
  // moment later, and the form does not ask for them again.
  it('starts the draft with the grants of the base version the loader read', () => {
    const { client, render } = setup();
    client.setQueryData(
      licenseEntitlementsQueryOptions('business').queryKey,
      pageOf(grants),
    );
    let asked = 0;
    server.use(
      handleGetLicenseEntitlements(() => {
        asked += 1;

        return HttpResponse.json(pageOf(grants));
      }),
    );

    const { result } = render();

    expect(result.current.draftEntitlements).toEqual([
      expect.objectContaining({ entitlementName: 'Seats', threshold: 25 }),
    ]);
    expect(asked).toBe(0);
  });

  it('asks for the grants of the base version when nothing has read them', async () => {
    const { render } = setup();
    server.use(
      handleGetLicenseEntitlements(() => HttpResponse.json(pageOf(grants))),
    );

    const { result } = render();

    expect(result.current.draftEntitlements).toEqual([]);
    await waitFor(() =>
      expect(result.current.draftEntitlements).toEqual([
        expect.objectContaining({ entitlementName: 'Seats', threshold: 25 }),
      ]),
    );
  });
});
