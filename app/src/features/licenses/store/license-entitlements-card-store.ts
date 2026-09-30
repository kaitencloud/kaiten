import { Store } from '@tanstack/react-store';
import type { InlineEditField } from '../utils';

// Which cell of a NUMBER row is being edited inline. Threshold and overage
// percent are edited one at a time, each through its own single input.
export type LicenseEntitlementEditingField = InlineEditField;

export type LicenseEntitlementsCardStoreState = {
  addDialogOpen: boolean;
  editingEntitlementId: string | null;
  editingField: LicenseEntitlementEditingField | null;
  editingValue: string;
  // False until the user types in the open editor: a fresh edit selects its
  // value so typing replaces it, a re-render must not re-select it.
  editingValueTouched: boolean;
  newBooleanValue: boolean;
  newConfigValue: string;
  // Null while the field is empty. The percentage only applies to a capped
  // grant, so it is ignored while newThresholdUnlimited is on.
  newOveragePercent: number | null;
  newThreshold: number | null;
  newThresholdUnlimited: boolean;
  // Rows whose inline save is in flight: their cells stay read-only until the
  // refetched rows land, so a second edit cannot start from stale values.
  // A set, because saves on different rows overlap.
  savingEntitlementIds: ReadonlySet<string>;
  selectedEntitlementId: string;
};

export type LicenseEntitlementsCardStoreActions = {
  beginSave: (entitlementId: string) => void;
  closeAddDialog: () => void;
  closeEdit: () => void;
  endSave: (entitlementId: string) => void;
  openAddDialog: () => void;
  resetAddDialogState: () => void;
  setEditingValue: (value: string) => void;
  setNewBooleanValue: (value: boolean) => void;
  setNewConfigValue: (value: string) => void;
  setNewOveragePercent: (percent: number | null) => void;
  setNewThreshold: (threshold: number | null) => void;
  setNewThresholdUnlimited: (unlimited: boolean) => void;
  setSelectedEntitlementId: (entitlementId: string) => void;
  startEdit: (
    entitlementId: string,
    field: LicenseEntitlementEditingField,
    value: string,
  ) => void;
};

const initialState: LicenseEntitlementsCardStoreState = {
  addDialogOpen: false,
  editingEntitlementId: null,
  editingField: null,
  editingValue: '',
  editingValueTouched: false,
  newBooleanValue: true,
  newConfigValue: '{}',
  newOveragePercent: 0,
  newThreshold: null,
  newThresholdUnlimited: true,
  savingEntitlementIds: new Set<string>(),
  selectedEntitlementId: '',
};

const initialAddDialogValues: Pick<
  LicenseEntitlementsCardStoreState,
  | 'newBooleanValue'
  | 'newConfigValue'
  | 'newOveragePercent'
  | 'newThreshold'
  | 'newThresholdUnlimited'
> = {
  newBooleanValue: true,
  newConfigValue: '{}',
  newOveragePercent: 0,
  newThreshold: null,
  newThresholdUnlimited: true,
};

export function createLicenseEntitlementsCardStore() {
  const store = new Store<LicenseEntitlementsCardStoreState>({
    ...initialState,
  });

  const actions: LicenseEntitlementsCardStoreActions = {
    beginSave: (entitlementId: string) => {
      store.setState((state) => ({
        ...state,
        savingEntitlementIds: new Set(state.savingEntitlementIds).add(
          entitlementId,
        ),
      }));
    },

    closeAddDialog: () => {
      store.setState((state) => ({
        ...state,
        addDialogOpen: false,
      }));
    },

    closeEdit: () => {
      store.setState((state) => ({
        ...state,
        editingEntitlementId: null,
        editingField: null,
        editingValue: '',
        editingValueTouched: false,
      }));
    },

    endSave: (entitlementId: string) => {
      store.setState((state) => {
        const savingEntitlementIds = new Set(state.savingEntitlementIds);
        savingEntitlementIds.delete(entitlementId);

        return { ...state, savingEntitlementIds };
      });
    },

    openAddDialog: () => {
      store.setState((state) => ({
        ...state,
        addDialogOpen: true,
      }));
    },

    resetAddDialogState: () => {
      store.setState((state) => ({
        ...state,
        ...initialAddDialogValues,
        selectedEntitlementId: '',
      }));
    },

    setEditingValue: (value: string) => {
      store.setState((state) => ({
        ...state,
        editingValue: value,
        editingValueTouched: true,
      }));
    },

    setNewBooleanValue: (value: boolean) => {
      store.setState((state) => ({
        ...state,
        newBooleanValue: value,
      }));
    },

    setNewConfigValue: (value: string) => {
      store.setState((state) => ({
        ...state,
        newConfigValue: value,
      }));
    },

    setNewOveragePercent: (percent: number | null) => {
      store.setState((state) => ({
        ...state,
        newOveragePercent: percent,
      }));
    },

    setNewThreshold: (threshold: number | null) => {
      store.setState((state) => ({
        ...state,
        newThreshold: threshold,
      }));
    },

    // Turning the cap back on starts from a hard limit, the default the API
    // applies to a capped grant whose percentage is left out.
    setNewThresholdUnlimited: (unlimited: boolean) => {
      store.setState((state) => ({
        ...state,
        newOveragePercent: unlimited ? state.newOveragePercent : 0,
        newThresholdUnlimited: unlimited,
      }));
    },

    // Picking another entitlement starts a fresh value: a threshold or overage
    // typed for the previous pick must not leak into this one.
    setSelectedEntitlementId: (entitlementId: string) => {
      store.setState((state) => ({
        ...state,
        ...initialAddDialogValues,
        selectedEntitlementId: entitlementId,
      }));
    },

    startEdit: (
      entitlementId: string,
      field: LicenseEntitlementEditingField,
      value: string,
    ) => {
      store.setState((state) => ({
        ...state,
        editingEntitlementId: entitlementId,
        editingField: field,
        editingValue: value,
        editingValueTouched: false,
      }));
    },
  };

  return { store, actions };
}

export type LicenseEntitlementsCardStore = ReturnType<
  typeof createLicenseEntitlementsCardStore
>;
