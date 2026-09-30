import { Store } from '@tanstack/react-store';
import type { EditableLicenseEntitlement } from '../utils';

const toDraftBufferRows = (
  entitlements: EditableLicenseEntitlement[],
): EditableLicenseEntitlement[] => {
  return entitlements.map((entitlement) => ({ ...entitlement }));
};

export type LicenseEntitlementsDraftStoreState = {
  // UI write buffer for the entitlement editor (detached from query cache rows).
  draftEntitlements: EditableLicenseEntitlement[];
};

export type LicenseEntitlementsDraftStoreActions = {
  addDraftEntitlement: (entitlement: EditableLicenseEntitlement) => void;
  removeDraftEntitlement: (entitlementId: string) => void;
  resetDraftEntitlements: () => void;
  setDraftEntitlements: (entitlements: EditableLicenseEntitlement[]) => void;
  updateDraftEntitlementGrant: (
    entitlementId: string,
    threshold: number,
    limitCapExceededOveragePercent: number,
  ) => void;
};

export function createLicenseEntitlementsDraftStore(
  initialRows: EditableLicenseEntitlement[] = [],
) {
  const store = new Store<LicenseEntitlementsDraftStoreState>({
    draftEntitlements: toDraftBufferRows(initialRows),
  });

  const actions: LicenseEntitlementsDraftStoreActions = {
    addDraftEntitlement: (entitlement: EditableLicenseEntitlement) => {
      store.setState((state) => ({
        ...state,
        draftEntitlements: [...state.draftEntitlements, { ...entitlement }],
      }));
    },

    removeDraftEntitlement: (entitlementId: string) => {
      store.setState((state) => ({
        ...state,
        draftEntitlements: state.draftEntitlements.filter(
          (entitlement) => entitlement.entitlementId !== entitlementId,
        ),
      }));
    },

    resetDraftEntitlements: () => {
      store.setState((state) => ({
        ...state,
        draftEntitlements: [],
      }));
    },

    setDraftEntitlements: (entitlements: EditableLicenseEntitlement[]) => {
      store.setState((state) => ({
        ...state,
        draftEntitlements: toDraftBufferRows(entitlements),
      }));
    },

    updateDraftEntitlementGrant: (
      entitlementId: string,
      threshold: number,
      limitCapExceededOveragePercent: number,
    ) => {
      store.setState((state) => ({
        ...state,
        draftEntitlements: state.draftEntitlements.map((entitlement) =>
          entitlement.entitlementId === entitlementId
            ? { ...entitlement, limitCapExceededOveragePercent, threshold }
            : entitlement,
        ),
      }));
    },
  };

  return { store, actions };
}

export type LicenseEntitlementsDraftStore = ReturnType<
  typeof createLicenseEntitlementsDraftStore
>;
