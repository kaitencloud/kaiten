import { describe, expect, it } from 'vite-plus/test';
import type { Entitlement, EntitlementWritable } from '@/api-client';
import {
  conditionUnitFields,
  entitlementFormSchema,
  entitlementToUpdateBody,
  getEntitlementFormDefaults,
  initialEntitlementFormValues,
} from '../entitlement-form.shared';

const numberEntitlementWithUnits: Entitlement = {
  id: 'entitlement-seats',
  name: 'Seats',
  slug: 'seats',
  description: 'Seats included in the plan',
  type: 'NUMBER',
  aggregationMethod: 'SUM',
  userFacing: true,
  displayOrder: 5,
  unitSingular: 'seat',
  unitPlural: 'seats',
  saleUnitSingular: 'pack',
  saleUnitPlural: 'packs',
  saleUnitFactor: 3,
  createdAt: '2026-03-01T09:00:00.000Z',
  updatedAt: '2026-03-01T09:00:00.000Z',
};

const periodicEntitlement: Entitlement = {
  id: 'entitlement-api-calls',
  name: 'API calls',
  slug: 'api-calls',
  description: 'API calls included in the plan',
  type: 'NUMBER',
  aggregationMethod: 'SUM',
  resetPeriod: 'MONTH',
  resetAnchor: 'CALENDAR',
  createdAt: '2026-03-01T09:00:00.000Z',
  updatedAt: '2026-03-01T09:00:00.000Z',
};

describe('entitlementToUpdateBody', () => {
  it('keeps the unit fields when renaming', () => {
    const body = entitlementToUpdateBody(numberEntitlementWithUnits, {
      name: 'Renamed seats',
    });

    expect(body.name).toBe('Renamed seats');
    expect(body.unitSingular).toBe('seat');
    expect(body.unitPlural).toBe('seats');
    expect(body.saleUnitSingular).toBe('pack');
    expect(body.saleUnitPlural).toBe('packs');
    expect(body.saleUnitFactor).toBe(3);
    expect(body.userFacing).toBe(true);
    expect(body.displayOrder).toBe(5);
  });

  it('keeps the unit fields when changing the icon', () => {
    const body = entitlementToUpdateBody(numberEntitlementWithUnits, {
      icon: 'lucide:anchor',
    });

    expect(body.icon).toBe('lucide:anchor');
    expect(body.unitSingular).toBe('seat');
    expect(body.saleUnitFactor).toBe(3);
  });

  it('strips every unit field for non-NUMBER entitlements', () => {
    const body = entitlementToUpdateBody({
      ...numberEntitlementWithUnits,
      type: 'BOOLEAN',
    });

    expect(body.unitSingular).toBeUndefined();
    expect(body.unitPlural).toBeUndefined();
    expect(body.saleUnitSingular).toBeUndefined();
    expect(body.saleUnitPlural).toBeUndefined();
    expect(body.saleUnitFactor).toBeUndefined();
  });

  it('strips the sale unit trio when the base pair is missing', () => {
    const body = entitlementToUpdateBody({
      ...numberEntitlementWithUnits,
      unitSingular: undefined,
      unitPlural: undefined,
    });

    expect(body.unitSingular).toBeUndefined();
    expect(body.saleUnitSingular).toBeUndefined();
    expect(body.saleUnitPlural).toBeUndefined();
    expect(body.saleUnitFactor).toBeUndefined();
  });

  // resetPeriod/resetAnchor are immutable once configured (see the API's
  // one-way-door rule): a full-replace PUT that omits them reads as an
  // attempted removal and the API rejects it. This helper serves the inline
  // rename/icon/groups edits, which never touch the pair, so it always echoes
  // them back unchanged.
  it('preserves resetPeriod and resetAnchor when renaming a periodic entitlement', () => {
    const body = entitlementToUpdateBody(periodicEntitlement, {
      name: 'Renamed API calls',
    });

    expect(body.name).toBe('Renamed API calls');
    expect(body.resetPeriod).toBe('MONTH');
    expect(body.resetAnchor).toBe('CALENDAR');
  });

  it('does not set resetPeriod/resetAnchor for a lifetime entitlement', () => {
    const body = entitlementToUpdateBody(numberEntitlementWithUnits);

    expect(body.resetPeriod).toBeUndefined();
    expect(body.resetAnchor).toBeUndefined();
  });
});

describe('getEntitlementFormDefaults', () => {
  it('shows a lifetime entitlement as having no cadence', () => {
    const defaults = getEntitlementFormDefaults(numberEntitlementWithUnits);

    expect(defaults.resetPeriod).toBe('NONE');
    expect(defaults.resetAnchor).toBe('CALENDAR');
  });

  it('seeds the stored cadence and anchor of a periodic entitlement', () => {
    const defaults = getEntitlementFormDefaults(periodicEntitlement);

    expect(defaults.resetPeriod).toBe('MONTH');
    expect(defaults.resetAnchor).toBe('CALENDAR');
  });

  it('starts a new entitlement on a lifetime counter', () => {
    expect(initialEntitlementFormValues.resetPeriod).toBe('NONE');
  });
});

describe('conditionUnitFields', () => {
  const numberBody = (
    overrides: Partial<EntitlementWritable>,
  ): Pick<
    EntitlementWritable,
    | 'type'
    | 'unitSingular'
    | 'unitPlural'
    | 'saleUnitSingular'
    | 'saleUnitPlural'
    | 'saleUnitFactor'
  > => ({
    type: 'NUMBER',
    ...overrides,
  });

  it('normalizes empty and whitespace labels to undefined', () => {
    const body = numberBody({
      unitSingular: '  seat  ',
      unitPlural: 'seats',
      saleUnitSingular: '',
      saleUnitPlural: '   ',
      saleUnitFactor: undefined,
    });

    conditionUnitFields(body);

    expect(body.unitSingular).toBe('seat');
    expect(body.unitPlural).toBe('seats');
    expect(body.saleUnitSingular).toBeUndefined();
    expect(body.saleUnitPlural).toBeUndefined();
    expect(body.saleUnitFactor).toBeUndefined();
  });

  it('drops an incomplete base pair together with the sale trio', () => {
    const body = numberBody({
      unitSingular: 'seat',
      unitPlural: '',
      saleUnitSingular: 'pack',
      saleUnitPlural: 'packs',
      saleUnitFactor: 3,
    });

    conditionUnitFields(body);

    expect(body.unitSingular).toBeUndefined();
    expect(body.unitPlural).toBeUndefined();
    expect(body.saleUnitSingular).toBeUndefined();
    expect(body.saleUnitPlural).toBeUndefined();
    expect(body.saleUnitFactor).toBeUndefined();
  });

  it('drops an incomplete sale trio but keeps the base pair', () => {
    const body = numberBody({
      unitSingular: 'seat',
      unitPlural: 'seats',
      saleUnitSingular: 'pack',
      saleUnitPlural: '',
      saleUnitFactor: 3,
    });

    conditionUnitFields(body);

    expect(body.unitSingular).toBe('seat');
    expect(body.unitPlural).toBe('seats');
    expect(body.saleUnitSingular).toBeUndefined();
    expect(body.saleUnitPlural).toBeUndefined();
    expect(body.saleUnitFactor).toBeUndefined();
  });

  it('drops a non-positive conversion factor together with the sale trio', () => {
    const body = numberBody({
      unitSingular: 'seat',
      unitPlural: 'seats',
      saleUnitSingular: 'pack',
      saleUnitPlural: 'packs',
      saleUnitFactor: 0,
    });

    conditionUnitFields(body);

    expect(body.unitSingular).toBe('seat');
    expect(body.saleUnitSingular).toBeUndefined();
    expect(body.saleUnitFactor).toBeUndefined();
  });

  it('keeps a complete unit configuration untouched', () => {
    const body = numberBody({
      unitSingular: 'seat',
      unitPlural: 'seats',
      saleUnitSingular: 'pack',
      saleUnitPlural: 'packs',
      saleUnitFactor: 2.5,
    });

    conditionUnitFields(body);

    expect(body).toEqual(
      numberBody({
        unitSingular: 'seat',
        unitPlural: 'seats',
        saleUnitSingular: 'pack',
        saleUnitPlural: 'packs',
        saleUnitFactor: 2.5,
      }),
    );
  });
});

describe('getEntitlementFormDefaults', () => {
  it('prefills unit fields from the entitlement', () => {
    const defaults = getEntitlementFormDefaults(numberEntitlementWithUnits);

    expect(defaults.unitSingular).toBe('seat');
    expect(defaults.unitPlural).toBe('seats');
    expect(defaults.saleUnitSingular).toBe('pack');
    expect(defaults.saleUnitPlural).toBe('packs');
    expect(defaults.saleUnitFactor).toBe(3);
  });

  it('defaults unit fields to empty for a new entitlement', () => {
    const defaults = getEntitlementFormDefaults();

    expect(defaults.unitSingular).toBe('');
    expect(defaults.unitPlural).toBe('');
    expect(defaults.saleUnitSingular).toBe('');
    expect(defaults.saleUnitPlural).toBe('');
    expect(defaults.saleUnitFactor).toBeUndefined();
    expect(defaults.userFacing).toBe(false);
    expect(defaults.displayOrder).toBe(0);
  });

  it('prefills userFacing from the entitlement and defaults it to false', () => {
    expect(getEntitlementFormDefaults(numberEntitlementWithUnits).userFacing).toBe(
      true,
    );
    expect(
      getEntitlementFormDefaults({
        ...numberEntitlementWithUnits,
        userFacing: undefined,
      }).userFacing,
    ).toBe(false);
  });

  it('prefills displayOrder from the entitlement and defaults it to 0', () => {
    expect(
      getEntitlementFormDefaults(numberEntitlementWithUnits).displayOrder,
    ).toBe(5);
    expect(
      getEntitlementFormDefaults({
        ...numberEntitlementWithUnits,
        displayOrder: undefined,
      }).displayOrder,
    ).toBe(0);
  });
});

describe('entitlementFormSchema displayOrder', () => {
  const validBase = { ...initialEntitlementFormValues, name: 'Test' };

  it('accepts a valid non-negative display order unchanged', () => {
    const result = entitlementFormSchema.safeParse({
      ...validBase,
      displayOrder: 12,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayOrder).toBe(12);
    }
  });

  it('rejects a negative display order', () => {
    const result = entitlementFormSchema.safeParse({
      ...validBase,
      displayOrder: -1,
    });

    expect(result.success).toBe(false);
  });
});
