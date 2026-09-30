import { describe, expect, it } from 'vite-plus/test';
import type { EditableLicenseEntitlement } from '../../utils';
import { createLicenseEntitlementsDraftStore } from '../license-entitlements-draft-store';

const seats: EditableLicenseEntitlement = {
  enabled: null,
  entitlementIcon: null,
  entitlementId: 'ent-seats',
  entitlementName: 'Seats',
  entitlementType: 'NUMBER',
  limitCapExceededOveragePercent: 25,
  threshold: 100,
};

const apiCalls: EditableLicenseEntitlement = {
  enabled: null,
  entitlementIcon: null,
  entitlementId: 'ent-api',
  entitlementName: 'API Calls',
  entitlementType: 'NUMBER',
  limitCapExceededOveragePercent: 0,
  threshold: 1000,
};

describe('createLicenseEntitlementsDraftStore', () => {
  it('updates the threshold and the overage percent of a row together', () => {
    const { store, actions } = createLicenseEntitlementsDraftStore([
      seats,
      apiCalls,
    ]);

    actions.updateDraftEntitlementGrant('ent-api', 500, 10);

    expect(store.state.draftEntitlements).toEqual([
      seats,
      { ...apiCalls, limitCapExceededOveragePercent: 10, threshold: 500 },
    ]);
  });

  it('leaves the other rows untouched, including their overage percent', () => {
    const { store, actions } = createLicenseEntitlementsDraftStore([
      seats,
      apiCalls,
    ]);

    actions.updateDraftEntitlementGrant('ent-api', -1, -1);

    const seatsRow = store.state.draftEntitlements.find(
      (row) => row.entitlementId === 'ent-seats',
    );

    expect(seatsRow).toEqual(seats);
  });

  it('copies rows into the draft buffer so query cache rows are never mutated', () => {
    const { store, actions } = createLicenseEntitlementsDraftStore();

    actions.addDraftEntitlement(seats);
    actions.updateDraftEntitlementGrant('ent-seats', 200, 0);

    expect(seats.threshold).toBe(100);
    expect(seats.limitCapExceededOveragePercent).toBe(25);
    expect(store.state.draftEntitlements[0]).toEqual({
      ...seats,
      limitCapExceededOveragePercent: 0,
      threshold: 200,
    });
  });
});
