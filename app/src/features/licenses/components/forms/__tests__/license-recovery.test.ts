import { describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';
import type { EditableLicenseEntitlement } from '../../../utils';
import { keepGrantableRows, licenseRecovery } from '../license-recovery';

const row = (entitlementId: string | null): EditableLicenseEntitlement => ({
  enabled: true,
  entitlementId,
  entitlementName: entitlementId ?? 'none',
  entitlementType: 'BOOLEAN',
  limitCapExceededOveragePercent: null,
  threshold: null,
});

describe('the recovery descriptor of the license creation', () => {
  it('pins the identity of what is stored', () => {
    expect(licenseRecovery.formId).toBe('licenses.create');
    expect(licenseRecovery.version).toBe(1);
    expect(licenseRecovery.omit).toEqual([]);
    expect(licenseRecovery.steps).toBeUndefined();
  });

  it('names every field of the form, for the notes of a restore', () => {
    expect(Object.keys(licenseRecovery.fieldLabels).sort()).toEqual([
      'createAsDraft',
      'description',
      'name',
      'slug',
      'type',
      'versionName',
    ]);
  });

  it('reads back the grant rows it wrote, and refuses another shape', () => {
    const rows = [
      row('seats'),
      {
        ...row('quota'),
        entitlementType: 'NUMBER' as const,
        limitCapExceededOveragePercent: 0,
        threshold: 10,
      },
    ];
    expect(licenseRecovery.extraSchema!.safeParse(rows).success).toBe(true);
    expect(
      licenseRecovery.extraSchema!.safeParse([{ entitlementId: 'seats' }])
        .success,
    ).toBe(false);
  });

  it('drops on a resume the rows whose entitlement is gone', () => {
    expect(
      keepGrantableRows(
        [row('seats'), row('gone'), row(null)],
        new Set(['seats']),
      ).map((kept) => kept.entitlementId),
    ).toEqual(['seats']);
    expect(keepGrantableRows(undefined, new Set(['seats']))).toEqual([]);
  });

  // The schema derives from the generated one of the API: a change of the contract
  // moves this snapshot, which is the cue to ask whether `version` must be raised,
  // since a stored input is read back through it.
  it('stores values of the shape its schema describes', () => {
    expect(
      z.toJSONSchema(licenseRecovery.schema!, {
        io: 'input',
        unrepresentable: 'any',
      }),
    ).toMatchSnapshot();
  });
});
