import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { Entitlement } from '@/api-client';
import type { EditableLicenseEntitlement } from '../../utils';
import { useLicenseSave } from '../use-license-save';

const { associateMock, createMock, publishMock } = vi.hoisted(() => ({
  associateMock: vi.fn(),
  createMock: vi.fn(),
  publishMock: vi.fn(),
}));

vi.mock('@/api-client/@tanstack/react-query.gen', () => ({
  associateEntitlementWithLicenseMutation: () => ({
    mutationFn: associateMock,
  }),
  createLicenseMutation: () => ({ mutationFn: createMock }),
  publishLicenseMutation: () => ({ mutationFn: publishMock }),
}));

const entitlements = [
  { id: 'ent-seats', name: 'Seats', slug: 'seats', type: 'NUMBER' },
  { id: 'ent-storage', name: 'Storage', slug: 'storage', type: 'NUMBER' },
  { id: 'ent-sso', name: 'SSO', slug: 'sso', type: 'BOOLEAN' },
  { id: 'ent-branding', name: 'Branding', slug: 'branding', type: 'CONFIG' },
] as Entitlement[];

const drafts: EditableLicenseEntitlement[] = [
  {
    enabled: null,
    entitlementId: 'ent-seats',
    entitlementName: 'Seats',
    entitlementType: 'NUMBER',
    limitCapExceededOveragePercent: 20,
    threshold: 100,
  },
  {
    enabled: null,
    entitlementId: 'ent-storage',
    entitlementName: 'Storage',
    entitlementType: 'NUMBER',
    // A stale percent on an unlimited row must never reach the API.
    limitCapExceededOveragePercent: 20,
    threshold: -1,
  },
  {
    enabled: false,
    entitlementId: 'ent-sso',
    entitlementName: 'SSO',
    entitlementType: 'BOOLEAN',
    limitCapExceededOveragePercent: null,
    threshold: null,
  },
  {
    configValue: { theme: 'dark' },
    enabled: null,
    entitlementId: 'ent-branding',
    entitlementName: 'Branding',
    entitlementType: 'CONFIG',
    limitCapExceededOveragePercent: null,
    threshold: null,
  },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('useLicenseSave', () => {
  beforeEach(() => {
    associateMock.mockReset();
    associateMock.mockResolvedValue({});
  });

  it('sends the threshold and overage percent together for every NUMBER draft', async () => {
    const { result } = renderHook(() => useLicenseSave(entitlements), {
      wrapper: createWrapper(),
    });

    await result.current.attachDraftEntitlements('enterprise-v1', drafts);

    const bodies = associateMock.mock.calls.map(
      ([variables]) => (variables as { body: unknown }).body,
    );

    expect(bodies).toEqual(
      expect.arrayContaining([
        {
          entitlementSlug: 'seats',
          limitCapExceededOveragePercent: 20,
          value: { type: 'number', value: 100 },
        },
        {
          entitlementSlug: 'storage',
          limitCapExceededOveragePercent: -1,
          value: { type: 'number', value: -1 },
        },
        {
          entitlementSlug: 'sso',
          limitCapExceededOveragePercent: undefined,
          value: { type: 'boolean', value: false },
        },
        {
          entitlementSlug: 'branding',
          limitCapExceededOveragePercent: undefined,
          value: { type: 'object', value: { theme: 'dark' } },
        },
      ]),
    );
    expect(associateMock).toHaveBeenCalledTimes(4);
    for (const [variables] of associateMock.mock.calls) {
      expect((variables as { path: unknown }).path).toEqual({
        licenseSlug: 'enterprise-v1',
      });
    }
  });

  it('skips drafts whose entitlement is unknown in the catalogue', async () => {
    const { result } = renderHook(() => useLicenseSave(entitlements), {
      wrapper: createWrapper(),
    });

    await result.current.attachDraftEntitlements('enterprise-v1', [
      { ...drafts[0], entitlementId: 'ent-unknown' },
      { ...drafts[0], entitlementId: null },
    ]);

    expect(associateMock).not.toHaveBeenCalled();
  });

  describe('createLicenseWithGrants', () => {
    const body = {
      description: 'Second version',
      familyId: 'family-enterprise',
      isDefault: false,
      name: 'Enterprise',
      type: 'PAID',
    } as const;
    let callOrder: string[] = [];

    beforeEach(() => {
      const order: string[] = [];
      createMock.mockReset();
      publishMock.mockReset();
      associateMock.mockImplementation(async () => {
        order.push('associate');
        return {};
      });
      createMock.mockImplementation(async () => {
        order.push('create');
        return { lifecycleState: 'DRAFT', slug: 'enterprise-v2' };
      });
      publishMock.mockImplementation(async () => {
        order.push('publish');
        return { lifecycleState: 'PUBLISHED', slug: 'enterprise-v2' };
      });
      callOrder = order;
    });

    // Published first, a family with no default would serve the version
    // before its grants exist.
    it('creates a draft, attaches its grants, then publishes it', async () => {
      const { result } = renderHook(() => useLicenseSave(entitlements), {
        wrapper: createWrapper(),
      });

      const saved = await result.current.createLicenseWithGrants({
        body: { ...body, lifecycleState: 'PUBLISHED' },
        draftEntitlements: drafts,
      });

      expect(
        (createMock.mock.calls[0]?.[0] as { body: unknown }).body,
      ).toMatchObject({ lifecycleState: 'DRAFT' });
      expect(callOrder[0]).toBe('create');
      expect(callOrder.at(-1)).toBe('publish');
      expect(callOrder.filter((call) => call === 'associate')).toHaveLength(4);
      expect(publishMock.mock.calls[0]?.[0]).toEqual({
        path: { licenseSlug: 'enterprise-v2' },
      });
      expect(saved).toEqual({
        license: { lifecycleState: 'PUBLISHED', slug: 'enterprise-v2' },
      });
    });

    it('leaves a version asked for as a draft unpublished', async () => {
      const { result } = renderHook(() => useLicenseSave(entitlements), {
        wrapper: createWrapper(),
      });

      const saved = await result.current.createLicenseWithGrants({
        body: { ...body, lifecycleState: 'DRAFT' },
        draftEntitlements: drafts,
      });

      expect(publishMock).not.toHaveBeenCalled();
      expect(saved.error).toBeUndefined();
      expect(saved.license.lifecycleState).toBe('DRAFT');
    });

    it('keeps the draft unpublished and reports why when a grant fails', async () => {
      const failure = new Error('grant refused');
      associateMock.mockRejectedValueOnce(failure);
      const { result } = renderHook(() => useLicenseSave(entitlements), {
        wrapper: createWrapper(),
      });

      const saved = await result.current.createLicenseWithGrants({
        body: { ...body, lifecycleState: 'PUBLISHED' },
        draftEntitlements: drafts,
      });

      expect(publishMock).not.toHaveBeenCalled();
      expect(saved.error).toBe(failure);
      expect(saved.license).toEqual({
        lifecycleState: 'DRAFT',
        slug: 'enterprise-v2',
      });
    });
  });
});
