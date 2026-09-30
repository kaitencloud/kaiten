import { useStore } from '@tanstack/react-store';
import { useCallback, useState } from 'react';
import type { Entitlement } from '@/api-client';
import { resolveLimitCapExceededOveragePercent } from '@/domains/entitlement-usage';
import { createLicenseEntitlementsDraftStore } from '../store';
import type { EditableLicenseEntitlement } from '../utils';
import { toEditableEntitlementType } from '../utils';

export type AddDraftEntitlementPayload = {
  configValue?: Record<string, unknown>;
  enabled?: boolean;
  entitlementId: string;
  limitCapExceededOveragePercent?: number;
  threshold?: number;
};

const toDraftEntitlement = (
  entitlement: Entitlement,
  payload: AddDraftEntitlementPayload,
): EditableLicenseEntitlement => {
  const entitlementType = toEditableEntitlementType(entitlement.type);
  const threshold =
    entitlementType === 'NUMBER' ? (payload.threshold ?? -1) : null;

  return {
    configValue:
      entitlementType === 'CONFIG' ? (payload.configValue ?? {}) : undefined,
    enabled: entitlementType === 'BOOLEAN' ? (payload.enabled ?? true) : null,
    entitlementIcon: entitlement.icon ?? null,
    entitlementId: entitlement.id,
    entitlementName: entitlement.name,
    entitlementType,
    limitCapExceededOveragePercent:
      entitlementType === 'NUMBER'
        ? resolveLimitCapExceededOveragePercent(
            threshold,
            payload.limitCapExceededOveragePercent,
          )
        : null,
    threshold,
  };
};

export const useLicenseEntitlementsDraft = (
  initialRows: EditableLicenseEntitlement[] = [],
) => {
  const [{ store, actions }] = useState(() =>
    createLicenseEntitlementsDraftStore(initialRows),
  );
  const draftEntitlements = useStore(store, (state) => state.draftEntitlements);

  const addDraftEntitlement = useCallback(
    (entitlements: Entitlement[], payload: AddDraftEntitlementPayload) => {
      const entitlement = entitlements.find(
        (item) => item.id === payload.entitlementId,
      );

      if (!entitlement) {
        return;
      }

      actions.addDraftEntitlement(toDraftEntitlement(entitlement, payload));
    },
    [actions],
  );

  return {
    addDraftEntitlement,
    draftEntitlements,
    removeDraftEntitlement: actions.removeDraftEntitlement,
    resetDraftEntitlements: actions.resetDraftEntitlements,
    setDraftEntitlements: actions.setDraftEntitlements,
    updateDraftEntitlementGrant: actions.updateDraftEntitlementGrant,
    store,
  };
};
