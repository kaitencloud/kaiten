import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import type { Entitlement } from '@/api-client';
import { useLicenseEntitlementsDraft } from '../use-license-entitlements-draft';

const entitlements = [
  { id: 'ent-seats', name: 'Seats', slug: 'seats', type: 'NUMBER' },
  { id: 'ent-sso', name: 'SSO', slug: 'sso', type: 'BOOLEAN' },
  { id: 'ent-ai', name: 'AI Credits', slug: 'ai-credits', type: 'NUMBER_AI_CREDIT' },
] as Entitlement[];

describe('useLicenseEntitlementsDraft', () => {
  it('keeps the requested overage percent on a capped NUMBER draft', () => {
    const { result } = renderHook(() => useLicenseEntitlementsDraft());

    act(() => {
      result.current.addDraftEntitlement(entitlements, {
        entitlementId: 'ent-seats',
        limitCapExceededOveragePercent: 15,
        threshold: 100,
      });
    });

    expect(result.current.draftEntitlements).toEqual([
      expect.objectContaining({
        entitlementId: 'ent-seats',
        entitlementType: 'NUMBER',
        limitCapExceededOveragePercent: 15,
        threshold: 100,
      }),
    ]);
  });

  it('drafts an AI credit entitlement as a numeric grant', () => {
    const { result } = renderHook(() => useLicenseEntitlementsDraft());

    act(() => {
      result.current.addDraftEntitlement(entitlements, {
        entitlementId: 'ent-ai',
        limitCapExceededOveragePercent: 5,
        threshold: 1000,
      });
    });

    expect(result.current.draftEntitlements[0]).toMatchObject({
      entitlementType: 'NUMBER',
      limitCapExceededOveragePercent: 5,
      threshold: 1000,
    });
  });

  it('forces the overage percent to -1 on an unlimited NUMBER draft', () => {
    const { result } = renderHook(() => useLicenseEntitlementsDraft());

    act(() => {
      result.current.addDraftEntitlement(entitlements, {
        entitlementId: 'ent-seats',
        limitCapExceededOveragePercent: 15,
        threshold: -1,
      });
    });

    expect(result.current.draftEntitlements[0]).toMatchObject({
      limitCapExceededOveragePercent: -1,
      threshold: -1,
    });
  });

  it('defaults a capped NUMBER draft to a hard limit and leaves BOOLEAN drafts without a percent', () => {
    const { result } = renderHook(() => useLicenseEntitlementsDraft());

    act(() => {
      result.current.addDraftEntitlement(entitlements, {
        entitlementId: 'ent-seats',
        threshold: 100,
      });
      result.current.addDraftEntitlement(entitlements, {
        enabled: false,
        entitlementId: 'ent-sso',
      });
    });

    expect(result.current.draftEntitlements).toEqual([
      expect.objectContaining({
        entitlementId: 'ent-seats',
        limitCapExceededOveragePercent: 0,
        threshold: 100,
      }),
      expect.objectContaining({
        enabled: false,
        entitlementId: 'ent-sso',
        entitlementType: 'BOOLEAN',
        limitCapExceededOveragePercent: null,
        threshold: null,
      }),
    ]);
  });
});
