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
import {
  type LicenseVersionRecovery,
  useLicenseVersionForm,
} from '../forms/use-license-version-form';
import { useLicenseVersionFormOptions } from '../forms/use-license-version-form-options';

const queryClient = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock('@tanstack/react-router', () => ({
  useRouteContext: () => ({ queryClient: queryClient.current }),
  useRouter: () => ({ navigate: vi.fn() }),
}));

// The recovery is a stub that holds what a resume restores: what the recovery does
// is tested with the functional, and on the page by the e2e.
vi.mock('@/functionals/form-recovery', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/functionals/form-recovery')>()),
  useFormRecoveryForm: () => ({ focusRef: () => {} }),
}));

function useVersionForm(
  availableLicenses: License[],
  restored: Partial<LicenseVersionRecovery['restored']> | null = null,
) {
  const formOptions = useLicenseVersionFormOptions({
    availableFamilies: families,
    availableLicenses,
    selectedLicenseSlug: 'business',
  });
  const recovery = {
    discard: () => {},
    pristine: formOptions.initialValues,
    restored: restored && {
      furthestIndex: 0,
      stepIndex: 0,
      values: formOptions.initialValues,
      ...restored,
    },
    send: <T,>(request: () => Promise<T>) => request(),
  } as unknown as LicenseVersionRecovery;

  return useLicenseVersionForm({
    availableLicenses,
    formOptions,
    recovery,
    selectedLicenseSlug: 'business',
  });
}

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
      () => useVersionForm([business] as License[]),
      { wrapper },
    );
  const renderResumed = (restored: Parameters<typeof useVersionForm>[1]) =>
    renderHook(() => useVersionForm([business] as License[], restored), {
      wrapper,
    });

  return { client, render, renderResumed };
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

  // A resume starts from the grants it kept, not from the base: asking the base again
  // would replace them. A grant whose entitlement was deleted since is dropped, as it
  // would leave the version a draft.
  it('starts a resumed draft with the grants it kept, without asking the base again', async () => {
    const { renderResumed } = setup();
    let asked = 0;
    server.use(
      handleGetLicenseEntitlements(() => {
        asked += 1;

        return HttpResponse.json(pageOf(grants));
      }),
    );
    const kept = {
      enabled: null,
      entitlementName: 'Seats',
      entitlementType: 'NUMBER' as const,
      limitCapExceededOveragePercent: 0,
      threshold: 40,
    };

    const { result } = renderResumed({
      extra: [
        { ...kept, entitlementId: seats.id },
        { ...kept, entitlementId: 'deleted-since', entitlementName: 'Gone' },
      ],
    });

    expect(result.current.draftEntitlements).toEqual([
      expect.objectContaining({ entitlementName: 'Seats', threshold: 40 }),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(asked).toBe(0);
  });
});
