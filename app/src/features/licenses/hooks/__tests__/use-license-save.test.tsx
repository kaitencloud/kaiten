import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse } from 'msw/http';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Entitlement, License } from '@/api-client';
import {
  handleAssociateEntitlementWithLicense,
  handleCreateLicense,
  handlePublishLicense,
} from '@/api-client/msw.gen';
import type { EditableLicenseEntitlement } from '../../utils';
import { useLicenseSave } from '../use-license-save';

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

type ApiCall =
  | { op: 'associate'; licenseSlug: string; body: unknown }
  | { op: 'create'; body: unknown }
  | { op: 'publish'; licenseSlug: string };

/**
 * Serves the three writes the hook chains, and records them in the order the
 * API received them, with the slug and the body each one carried.
 */
function serveLicenseWrites({
  failAssociate = false,
}: { failAssociate?: boolean } = {}) {
  const calls: ApiCall[] = [];

  server.use(
    handleAssociateEntitlementWithLicense(async ({ params, request }) => {
      calls.push({
        op: 'associate',
        licenseSlug: params.licenseSlug,
        body: await request.json(),
      });
      return failAssociate && calls.filter(({ op }) => op === 'associate').length === 1
        ? HttpResponse.json(
            { title: 'Conflict', status: 409, detail: 'grant refused' },
            { status: 409 },
          )
        : HttpResponse.json({}, { status: 201 });
    }),
    handleCreateLicense(async ({ request }) => {
      calls.push({ op: 'create', body: await request.json() });
      return HttpResponse.json(
        { lifecycleState: 'DRAFT', slug: 'enterprise-v2' } as License,
        { status: 201 },
      );
    }),
    handlePublishLicense(({ params }) => {
      calls.push({ op: 'publish', licenseSlug: params.licenseSlug });
      return HttpResponse.json({
        lifecycleState: 'PUBLISHED',
        slug: params.licenseSlug,
      } as License);
    }),
  );

  return calls;
}

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
  it('sends the threshold and overage percent together for every NUMBER draft', async () => {
    const calls = serveLicenseWrites();
    const { result } = renderHook(() => useLicenseSave(entitlements), {
      wrapper: createWrapper(),
    });

    await result.current.attachDraftEntitlements('enterprise-v1', drafts);

    expect(calls).toHaveLength(4);
    expect(calls).toEqual(
      expect.arrayContaining([
        {
          op: 'associate',
          licenseSlug: 'enterprise-v1',
          body: {
            entitlementSlug: 'seats',
            limitCapExceededOveragePercent: 20,
            value: { type: 'number', value: 100 },
          },
        },
        {
          op: 'associate',
          licenseSlug: 'enterprise-v1',
          body: {
            entitlementSlug: 'storage',
            limitCapExceededOveragePercent: -1,
            value: { type: 'number', value: -1 },
          },
        },
        // No percent at all for the other types: an undefined field is left
        // out of the JSON the API receives.
        {
          op: 'associate',
          licenseSlug: 'enterprise-v1',
          body: { entitlementSlug: 'sso', value: { type: 'boolean', value: false } },
        },
        {
          op: 'associate',
          licenseSlug: 'enterprise-v1',
          body: {
            entitlementSlug: 'branding',
            value: { type: 'object', value: { theme: 'dark' } },
          },
        },
      ]),
    );
  });

  it('skips drafts whose entitlement is unknown in the catalogue', async () => {
    const calls = serveLicenseWrites();
    const { result } = renderHook(() => useLicenseSave(entitlements), {
      wrapper: createWrapper(),
    });

    await result.current.attachDraftEntitlements('enterprise-v1', [
      { ...drafts[0], entitlementId: 'ent-unknown' },
      { ...drafts[0], entitlementId: null },
    ]);

    expect(calls).toEqual([]);
  });

  describe('createLicenseWithGrants', () => {
    const body = {
      description: 'Second version',
      familyId: 'family-enterprise',
      isDefault: false,
      name: 'Enterprise',
      type: 'PAID',
    } as const;
    let calls: ApiCall[];

    beforeEach(() => {
      calls = serveLicenseWrites();
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

      const ops = calls.map(({ op }) => op);
      expect(calls[0]).toMatchObject({
        op: 'create',
        body: { lifecycleState: 'DRAFT' },
      });
      expect(ops.at(-1)).toBe('publish');
      expect(ops.filter((op) => op === 'associate')).toHaveLength(4);
      expect(calls.at(-1)).toEqual({
        op: 'publish',
        licenseSlug: 'enterprise-v2',
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

      expect(calls.map(({ op }) => op)).not.toContain('publish');
      expect(saved.error).toBeUndefined();
      expect(saved.license.lifecycleState).toBe('DRAFT');
    });

    it('keeps the draft unpublished and reports why when a grant fails', async () => {
      calls = serveLicenseWrites({ failAssociate: true });
      const { result } = renderHook(() => useLicenseSave(entitlements), {
        wrapper: createWrapper(),
      });

      const saved = await result.current.createLicenseWithGrants({
        body: { ...body, lifecycleState: 'PUBLISHED' },
        draftEntitlements: drafts,
      });

      expect(calls.map(({ op }) => op)).not.toContain('publish');
      expect(saved.error).toMatchObject({ detail: 'grant refused' });
      expect(saved.license).toEqual({
        lifecycleState: 'DRAFT',
        slug: 'enterprise-v2',
      });
      // The writes run concurrently. A rejected first grant returns before
      // its siblings settle; keep their handlers installed until they do.
      await waitFor(() => expect(calls.filter(({ op }) => op === 'associate')).toHaveLength(4));
    });

    // What a version also sells (its prices) is added between its grants and its
    // publication: a price meters an entitlement the version must grant, and a
    // published version must not be served half made.
    it('runs what comes after the grants once they are attached, and before the publish', async () => {
      const order: string[] = [];
      const { result } = renderHook(() => useLicenseSave(entitlements), {
        wrapper: createWrapper(),
      });

      const saved = await result.current.createLicenseWithGrants({
        afterGrants: async (license) => {
          order.push(
            `after:${license.slug}:${calls.map(({ op }) => op).join(',')}`,
          );
        },
        body: { ...body, lifecycleState: 'PUBLISHED' },
        draftEntitlements: drafts,
      });

      expect(order).toEqual([
        'after:enterprise-v2:create,associate,associate,associate,associate',
      ]);
      expect(calls.at(-1)).toEqual({
        op: 'publish',
        licenseSlug: 'enterprise-v2',
      });
      expect(saved.error).toBeUndefined();
    });

    it('keeps the draft unpublished and reports why when what comes after the grants fails', async () => {
      const { result } = renderHook(() => useLicenseSave(entitlements), {
        wrapper: createWrapper(),
      });
      const failure = new Error('price refused');

      const saved = await result.current.createLicenseWithGrants({
        afterGrants: async () => {
          throw failure;
        },
        body: { ...body, lifecycleState: 'PUBLISHED' },
        draftEntitlements: drafts,
      });

      expect(calls.map(({ op }) => op)).not.toContain('publish');
      expect(saved.error).toBe(failure);
      expect(saved.license).toEqual({
        lifecycleState: 'DRAFT',
        slug: 'enterprise-v2',
      });
    });
  });
});
