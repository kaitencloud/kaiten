import { useStore } from '@tanstack/react-store';
import { useMemo } from 'react';
import { createLicenseEntitlementsCardStore } from '../store';

export function useLicenseEntitlementsCardStore() {
  const { store, actions } = useMemo(
    () => createLicenseEntitlementsCardStore(),
    [],
  );
  const state = useStore(store, (snapshot) => snapshot);

  return {
    addDialogOpen: state.addDialogOpen,
    editingEntitlementId: state.editingEntitlementId,
    editingField: state.editingField,
    editingValue: state.editingValue,
    editingValueTouched: state.editingValueTouched,
    newBooleanValue: state.newBooleanValue,
    newConfigValue: state.newConfigValue,
    newOveragePercent: state.newOveragePercent,
    newThreshold: state.newThreshold,
    newThresholdUnlimited: state.newThresholdUnlimited,
    savingEntitlementIds: state.savingEntitlementIds,
    selectedEntitlementId: state.selectedEntitlementId,

    beginSave: actions.beginSave,
    closeAddDialog: actions.closeAddDialog,
    closeEdit: actions.closeEdit,
    endSave: actions.endSave,
    openAddDialog: actions.openAddDialog,
    resetAddDialogState: actions.resetAddDialogState,
    setEditingValue: actions.setEditingValue,
    setNewBooleanValue: actions.setNewBooleanValue,
    setNewConfigValue: actions.setNewConfigValue,
    setNewOveragePercent: actions.setNewOveragePercent,
    setNewThreshold: actions.setNewThreshold,
    setNewThresholdUnlimited: actions.setNewThresholdUnlimited,
    setSelectedEntitlementId: actions.setSelectedEntitlementId,
    startEdit: actions.startEdit,

    store,
  };
}
