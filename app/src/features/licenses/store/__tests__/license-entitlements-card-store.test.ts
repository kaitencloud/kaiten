import { describe, expect, it } from 'vite-plus/test';
import { createLicenseEntitlementsCardStore } from '../license-entitlements-card-store';

describe('createLicenseEntitlementsCardStore', () => {
  it('locks and unlocks each saving row independently', () => {
    const { store, actions } = createLicenseEntitlementsCardStore();

    actions.beginSave('ent-a');
    actions.beginSave('ent-b');

    expect([...store.state.savingEntitlementIds].sort()).toEqual([
      'ent-a',
      'ent-b',
    ]);

    actions.endSave('ent-a');

    expect([...store.state.savingEntitlementIds]).toEqual(['ent-b']);

    actions.endSave('ent-b');

    expect(store.state.savingEntitlementIds.size).toBe(0);
  });

  it('clears the typed values when another entitlement is selected', () => {
    const { store, actions } = createLicenseEntitlementsCardStore();

    actions.setSelectedEntitlementId('ent-a');
    actions.setNewThreshold(100);
    actions.setNewOveragePercent(20);
    actions.setNewBooleanValue(false);
    actions.setNewConfigValue('{"a":1}');

    actions.setSelectedEntitlementId('ent-b');

    expect(store.state).toMatchObject({
      newBooleanValue: true,
      newConfigValue: '{}',
      newOveragePercent: 0,
      newThreshold: null,
      newThresholdUnlimited: true,
      selectedEntitlementId: 'ent-b',
    });
  });

  // Turning the cap back on starts from the default the API applies to a
  // capped grant whose percentage is left out.
  it('resets the allowance to a hard limit when the cap comes back', () => {
    const { store, actions } = createLicenseEntitlementsCardStore();

    actions.setNewOveragePercent(40);
    actions.setNewThresholdUnlimited(false);

    expect(store.state).toMatchObject({
      newOveragePercent: 0,
      newThresholdUnlimited: false,
    });
  });

  it('keeps the edited field and value together', () => {
    const { store, actions } = createLicenseEntitlementsCardStore();

    actions.startEdit('ent-a', 'overagePercent', '20');
    actions.setEditingValue('25');

    expect(store.state).toMatchObject({
      editingEntitlementId: 'ent-a',
      editingField: 'overagePercent',
      editingValue: '25',
    });

    actions.closeEdit();

    expect(store.state).toMatchObject({
      editingEntitlementId: null,
      editingField: null,
      editingValue: '',
    });
  });
});
