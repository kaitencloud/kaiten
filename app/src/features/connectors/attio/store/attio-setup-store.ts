import { Store } from '@tanstack/react-store';
import { type AttioSyncPolicy, ATTIO_SYNC_POLICY_DEFAULT } from '../constants';
import type { AttioSetupView, EditableMappingRow } from '../types';
import { createEditableRow } from '../utils';

export type AttioSetupStoreState = {
  view: AttioSetupView;
  apiToken: string;
  syncPolicy: AttioSyncPolicy;
  mappingRows: EditableMappingRow[];
};

export type AttioSetupStoreActions = {
  openWizard: () => void;
  backToIndex: () => void;
  setApiToken: (apiToken: string) => void;
  setSyncPolicy: (syncPolicy: AttioSyncPolicy) => void;
  addMappingRow: () => void;
  removeMappingRow: (id: string) => void;
  updateMappingRow: (id: string, patch: Partial<EditableMappingRow>) => void;
};

function initialMappingRows(): EditableMappingRow[] {
  return [createEditableRow()];
}

export function createAttioSetupStore() {
  const store = new Store<AttioSetupStoreState>({
    view: 'index',
    apiToken: '',
    syncPolicy: ATTIO_SYNC_POLICY_DEFAULT,
    mappingRows: initialMappingRows(),
  });

  const actions: AttioSetupStoreActions = {
    openWizard: () =>
      store.setState((state) => ({
        ...state,
        view: 'wizard',
        apiToken: '',
        syncPolicy: ATTIO_SYNC_POLICY_DEFAULT,
        mappingRows: initialMappingRows(),
      })),
    // Also drops the typed API token: a secret must not linger in memory
    // after the wizard is cancelled.
    backToIndex: () =>
      store.setState((state) => ({
        ...state,
        view: 'index',
        apiToken: '',
        syncPolicy: ATTIO_SYNC_POLICY_DEFAULT,
        mappingRows: initialMappingRows(),
      })),
    setApiToken: (apiToken) =>
      store.setState((state) => ({ ...state, apiToken })),
    setSyncPolicy: (syncPolicy) =>
      store.setState((state) => ({ ...state, syncPolicy })),
    addMappingRow: () =>
      store.setState((state) => ({
        ...state,
        mappingRows: [...state.mappingRows, createEditableRow()],
      })),
    removeMappingRow: (id) =>
      store.setState((state) => ({
        ...state,
        mappingRows: state.mappingRows.filter((row) => row.id !== id),
      })),
    updateMappingRow: (id, patch) =>
      store.setState((state) => ({
        ...state,
        mappingRows: state.mappingRows.map((row) =>
          row.id === id ? { ...row, ...patch } : row,
        ),
      })),
  };

  return { store, actions };
}

export type AttioSetupStore = ReturnType<typeof createAttioSetupStore>;
