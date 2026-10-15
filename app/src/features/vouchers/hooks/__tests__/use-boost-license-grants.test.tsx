import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { License, LicenseFamilyView } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleGetLicenseEntitlements,
  handleGetLicenses,
  handleListAddons,
  handleListCustomers,
  handleListEntitlements,
  handleListLicenseFamilies,
} from '@/api-client/msw.gen';
import {
  createLoadedPageClient,
  pageOf,
  sessionToken,
} from '@/test-fixtures/billing-test-support';
import { buildGrant } from '../../../../../e2e/app/_support/fixtures/build-pricing';
import { billingCapabilitiesProfiles } from '../../../../../e2e/app/_support/model/billing-capabilities';
import {
  ALL_SCOPES,
  TOKENS,
} from '../../components/__tests__/voucher-test-support';
import { useBoostLicenseGrants } from '../use-boost-license-grants';
import { useVoucherReferences } from '../use-voucher-references';

const getAuthToken = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));

const PRO = { id: 'license-pro', name: 'Pro', slug: 'pro-v2' };
const STARTER = { id: 'license-starter', name: 'Starter', slug: 'starter-v1' };
const requested: string[] = [];

const family = (slug: string, head: typeof PRO): LicenseFamilyView => ({
  createdAt: '2026-01-01T00:00:00.000Z',
  currentVersion: head as LicenseFamilyView['currentVersion'],
  id: `family-${slug}`,
  isPublic: false,
  slug,
  updatedAt: '2026-01-01T00:00:00.000Z',
  versionCount: 1,
});

beforeEach(() => {
  requested.length = 0;
  getAuthToken.mockResolvedValue(sessionToken([...ALL_SCOPES]));
  server.use(
    handleGetBillingCapabilities({
      body: billingCapabilitiesProfiles.stackWithVouchers(),
    }),
    handleListCustomers(() => HttpResponse.json(pageOf([]))),
    handleListAddons(() => HttpResponse.json(pageOf([]))),
    handleListEntitlements(() => HttpResponse.json(pageOf([TOKENS]))),
    handleGetLicenses(() =>
      HttpResponse.json(pageOf([PRO, STARTER] as unknown as License[])),
    ),
    handleListLicenseFamilies({
      body: pageOf([family('pro', PRO), family('starter', STARTER)]),
    }),
    handleGetLicenseEntitlements(({ params }) => {
      const slug = String(params.licenseSlug);
      requested.push(slug);

      return HttpResponse.json(
        pageOf([
          buildGrant({
            entitlement: TOKENS,
            license: slug === 'pro-v2' ? PRO : STARTER,
            value: slug === 'pro-v2' ? 100_000 : 10_000,
          }),
        ]),
      );
    }),
  );
});

function mount(options: { applicableLicenseIds: string[]; enabled: boolean }) {
  const client = createLoadedPageClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  return renderHook(
    () => {
      const references = useVoucherReferences();

      return useBoostLicenseGrants({
        ...options,
        licenses: references.licenses,
      });
    },
    { wrapper },
  );
}

const namesOf = (grants: ReturnType<typeof useBoostLicenseGrants>) =>
  (grants.get('tokens') ?? []).map(({ licenseName, value }) => [licenseName, value]);

describe('what the licenses a boost can be redeemed on grant', () => {
  it('is, for a voucher open to every license, the head of each family, one request a family', async () => {
    const { result } = mount({ applicableLicenseIds: [], enabled: true });

    await waitFor(() => expect(namesOf(result.current)).toHaveLength(2));
    expect(namesOf(result.current)).toEqual([
      ['Pro', 100_000],
      ['Starter', 10_000],
    ]);
    expect([...requested].sort()).toEqual(['pro-v2', 'starter-v1']);
  });

  it('is, for a voucher limited to some license versions, those and no other', async () => {
    const { result } = mount({
      applicableLicenseIds: ['license-starter'],
      enabled: true,
    });

    await waitFor(() => expect(namesOf(result.current)).toHaveLength(1));
    expect(namesOf(result.current)).toEqual([['Starter', 10_000]]);
    expect(requested).toEqual(['starter-v1']);
  });

  it('reads nothing until a change sets a value', async () => {
    const { result } = mount({ applicableLicenseIds: [], enabled: false });

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(result.current.size).toBe(0);
    expect(requested).toEqual([]);
  });

  it('reads nothing for a session that may not read licenses', async () => {
    getAuthToken.mockResolvedValue(
      sessionToken(['read:billing', 'read:vouchers', 'read:entitlements']),
    );
    const { result } = mount({ applicableLicenseIds: [], enabled: true });

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(result.current.size).toBe(0);
    expect(requested).toEqual([]);
  });
});
