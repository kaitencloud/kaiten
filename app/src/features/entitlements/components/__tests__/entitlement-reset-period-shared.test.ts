import { describe, expect, it } from 'vite-plus/test';
import type { Entitlement } from '@/api-client';
import {
  hasImmutableResetPeriod,
  RESET_PERIOD_NONE,
  resolveResetFields,
} from '../entitlement-reset-period.shared';

type ResetFormValues = Parameters<typeof resolveResetFields>[0];

const formValues = (
  overrides: Partial<ResetFormValues> = {},
): ResetFormValues => ({
  type: 'NUMBER' as const,
  aggregationMethod: 'SUM' as const,
  resetPeriod: RESET_PERIOD_NONE,
  resetAnchor: 'CALENDAR' as const,
  ...overrides,
});

const storedEntitlement = (overrides: Partial<Entitlement> = {}): Entitlement =>
  ({
    id: 'entitlement-api-calls',
    name: 'API calls',
    slug: 'api-calls',
    type: 'NUMBER',
    aggregationMethod: 'SUM',
    createdAt: '2026-03-01T09:00:00.000Z',
    updatedAt: '2026-03-01T09:00:00.000Z',
    ...overrides,
  }) as Entitlement;

describe('resolveResetFields', () => {
  describe('creating an entitlement', () => {
    it('sends nothing for a lifetime counter', () => {
      expect(resolveResetFields(formValues())).toEqual({
        resetPeriod: undefined,
        resetAnchor: undefined,
      });
    });

    it('sends the pair once a cadence is picked', () => {
      expect(
        resolveResetFields(
          formValues({ resetPeriod: 'MONTH', resetAnchor: 'LICENSE_START' }),
        ),
      ).toEqual({ resetPeriod: 'MONTH', resetAnchor: 'LICENSE_START' });
    });

    // The API requires the anchor exactly when a period is set, so the pair
    // must never leave half-filled.
    it('defaults the anchor to CALENDAR', () => {
      const resolved = resolveResetFields({
        ...formValues({ resetPeriod: 'WEEK' }),
        resetAnchor: undefined as never,
      });

      expect(resolved).toEqual({
        resetPeriod: 'WEEK',
        resetAnchor: 'CALENDAR',
      });
    });

    it('drops the pair for a type that reports no numeric meter', () => {
      expect(
        resolveResetFields(
          formValues({ type: 'BOOLEAN', resetPeriod: 'MONTH' }),
        ),
      ).toEqual({ resetPeriod: undefined, resetAnchor: undefined });
    });

    // A gauge that evaporates at every boundary is meaningless; the API
    // refuses the combination, so the form never sends it.
    it('drops the pair for the LATEST aggregation', () => {
      expect(
        resolveResetFields(
          formValues({ aggregationMethod: 'LATEST', resetPeriod: 'MONTH' }),
        ),
      ).toEqual({ resetPeriod: undefined, resetAnchor: undefined });
    });

    it('keeps the pair for an AI credit meter, which the API counts as a number family', () => {
      expect(
        resolveResetFields(
          formValues({ type: 'NUMBER_AI_CREDIT', resetPeriod: 'DAY' }),
        ),
      ).toEqual({ resetPeriod: 'DAY', resetAnchor: 'CALENDAR' });
    });
  });

  describe('updating an entitlement (one-way door)', () => {
    const periodic = storedEntitlement({
      resetPeriod: 'MONTH',
      resetAnchor: 'CALENDAR',
    });

    it('echoes the stored pair back rather than a changed one', () => {
      expect(
        resolveResetFields(
          formValues({ resetPeriod: 'YEAR', resetAnchor: 'LICENSE_START' }),
          periodic,
        ),
      ).toEqual({ resetPeriod: 'MONTH', resetAnchor: 'CALENDAR' });
    });

    // Omitting the pair on this full-replace PUT would read as an attempted
    // removal, which the API rejects.
    it('echoes the stored pair back even when the form says lifetime', () => {
      expect(resolveResetFields(formValues(), periodic)).toEqual({
        resetPeriod: 'MONTH',
        resetAnchor: 'CALENDAR',
      });
    });

    it('lets an entitlement without a period still adopt one', () => {
      expect(
        resolveResetFields(
          formValues({ resetPeriod: 'HOUR', resetAnchor: 'LICENSE_START' }),
          storedEntitlement(),
        ),
      ).toEqual({ resetPeriod: 'HOUR', resetAnchor: 'LICENSE_START' });
    });

    it('keeps a lifetime entitlement lifetime', () => {
      expect(resolveResetFields(formValues(), storedEntitlement())).toEqual({
        resetPeriod: undefined,
        resetAnchor: undefined,
      });
    });
  });
});

describe('hasImmutableResetPeriod', () => {
  it('is false while creating', () => {
    expect(hasImmutableResetPeriod(undefined)).toBe(false);
  });

  it('is false for a stored lifetime entitlement, which may still adopt one', () => {
    expect(hasImmutableResetPeriod(storedEntitlement())).toBe(false);
  });

  it('is true once the API stored a period', () => {
    expect(
      hasImmutableResetPeriod(
        storedEntitlement({ resetPeriod: 'MONTH', resetAnchor: 'CALENDAR' }),
      ),
    ).toBe(true);
  });
});
