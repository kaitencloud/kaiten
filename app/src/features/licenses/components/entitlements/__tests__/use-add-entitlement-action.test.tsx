import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { Entitlement } from '@/api-client';
import { useAddEntitlementAction } from '../use-add-entitlement-action';

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }));

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock },
}));

const seats = {
  id: 'ent-seats',
  name: 'Seats',
  slug: 'seats',
  type: 'NUMBER',
} as Entitlement;

const t = ((key: string) =>
  key === 'Pages.Licenses.Entitlements.Status.unlimited'
    ? 'Unlimited'
    : key) as unknown as Parameters<typeof useAddEntitlementAction>[0]['t'];

const aiCredits = {
  id: 'ent-ai',
  name: 'AI Credits',
  slug: 'ai-credits',
  type: 'NUMBER_AI_CREDIT',
} as Entitlement;

function renderAction(overrides: {
  newOveragePercent?: number | null;
  newThreshold?: number | null;
  newThresholdUnlimited?: boolean;
  selectedEntitlement?: Entitlement;
}) {
  const onAddEntitlement = vi.fn().mockResolvedValue(undefined);
  const closeAddDialog = vi.fn();
  const resetAddDialogState = vi.fn();
  const { result } = renderHook(() =>
    useAddEntitlementAction({
      closeAddDialog,
      newBooleanValue: true,
      newConfigValue: '{}',
      newOveragePercent: 0,
      newThreshold: null,
      newThresholdUnlimited: false,
      onAddEntitlement,
      resetAddDialogState,
      selectedEntitlement: seats,
      selectedEntitlementId: (overrides.selectedEntitlement ?? seats).id,
      t,
      ...overrides,
    }),
  );

  return { closeAddDialog, onAddEntitlement, resetAddDialogState, result };
}

describe('useAddEntitlementAction', () => {
  beforeEach(() => {
    toastErrorMock.mockReset();
  });

  it('sends the typed percent with a capped threshold', async () => {
    const { closeAddDialog, onAddEntitlement, resetAddDialogState, result } =
      renderAction({ newOveragePercent: 10, newThreshold: 100 });

    await act(async () => {
      await result.current();
    });

    expect(onAddEntitlement).toHaveBeenCalledWith({
      entitlementId: 'ent-seats',
      entitlementType: 'NUMBER',
      limitCapExceededOveragePercent: 10,
      threshold: 100,
    });
    expect(resetAddDialogState).toHaveBeenCalled();
    expect(closeAddDialog).toHaveBeenCalled();
  });

  it('treats a cleared percent as a hard limit', async () => {
    const { onAddEntitlement, result } = renderAction({
      newOveragePercent: null,
      newThreshold: 100,
    });

    await act(async () => {
      await result.current();
    });

    expect(onAddEntitlement).toHaveBeenCalledWith(
      expect.objectContaining({
        limitCapExceededOveragePercent: 0,
        threshold: 100,
      }),
    );
  });

  it('forces the percent to -1 when unlimited is on, ignoring leftover input', async () => {
    const { onAddEntitlement, result } = renderAction({
      newOveragePercent: 10,
      newThreshold: 100,
      newThresholdUnlimited: true,
    });

    await act(async () => {
      await result.current();
    });

    expect(onAddEntitlement).toHaveBeenCalledWith(
      expect.objectContaining({
        limitCapExceededOveragePercent: -1,
        threshold: -1,
      }),
    );
  });

  it('treats an AI credit entitlement like a numeric one', async () => {
    const { onAddEntitlement, result } = renderAction({
      newOveragePercent: 5,
      newThreshold: 1000,
      selectedEntitlement: aiCredits,
    });

    await act(async () => {
      await result.current();
    });

    expect(onAddEntitlement).toHaveBeenCalledWith({
      entitlementId: 'ent-ai',
      entitlementType: 'NUMBER_AI_CREDIT',
      limitCapExceededOveragePercent: 5,
      threshold: 1000,
    });
  });

  it('refuses a capped grant with no value', async () => {
    const { closeAddDialog, onAddEntitlement, result } = renderAction({
      newOveragePercent: 10,
      newThreshold: null,
    });

    await act(async () => {
      await result.current();
    });

    expect(onAddEntitlement).not.toHaveBeenCalled();
    expect(closeAddDialog).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      'Pages.Licenses.Entitlements.thresholdError',
    );
  });
});
