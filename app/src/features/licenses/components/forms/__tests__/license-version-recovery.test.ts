import { describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';
import type { License } from '@/api-client';
import { licenseVersionRecovery } from '../license-version-recovery';

const base = {
  slug: 'pro-v2',
  updatedAt: '2026-10-20T08:00:00Z',
} as License;

describe('the recovery descriptor of a new license version', () => {
  it('pins the identity of what is stored', () => {
    expect(licenseVersionRecovery.formId).toBe('licenses.createVersion');
    expect(licenseVersionRecovery.version).toBe(1);
    expect(licenseVersionRecovery.omit).toEqual([]);
    expect(licenseVersionRecovery.steps).toBeUndefined();
    // The default of 7 days.
    expect(licenseVersionRecovery.retentionDays).toBeUndefined();
  });

  it('names every field of the form, for the notes of a restore', () => {
    expect(Object.keys(licenseVersionRecovery.fieldLabels).sort()).toEqual([
      'baseLicenseSlug',
      'baseVersion',
      'copyAiRules',
      'copyPrices',
      'createAsDraft',
      'description',
      'selectedFamilyId',
      'versionName',
    ]);
  });

  // The grants are copied from the base: kept rows are only good for the base as it
  // was when they were kept.
  it('ties the kept grants to the base version and to when it last changed', () => {
    const source = licenseVersionRecovery.extraSource!;
    expect(source({ baseLicense: base })).toBe('pro-v2@2026-10-20T08:00:00Z');
    expect(
      source({
        baseLicense: { ...base, updatedAt: '2026-10-21T08:00:00Z' },
      }),
    ).not.toBe(source({ baseLicense: base }));
    expect(source({ baseLicense: null })).toBeNull();
    expect(source({})).toBeNull();
  });

  it('reads back the grant rows it wrote, and refuses another shape', () => {
    const rows = [
      {
        enabled: null,
        entitlementId: 'requests',
        entitlementName: 'Requests',
        entitlementType: 'NUMBER' as const,
        limitCapExceededOveragePercent: 0,
        threshold: 500,
      },
    ];
    expect(licenseVersionRecovery.extraSchema!.safeParse(rows).success).toBe(
      true,
    );
    expect(
      licenseVersionRecovery.extraSchema!.safeParse([{ threshold: 500 }])
        .success,
    ).toBe(false);
  });

  // The schema is the form's: a change of it moves this snapshot, which is the cue to
  // ask whether `version` must be raised, since a stored input is read back through it.
  it('stores values of the shape its schema describes', () => {
    expect(
      z.toJSONSchema(licenseVersionRecovery.schema!, {
        io: 'input',
        unrepresentable: 'any',
      }),
    ).toMatchSnapshot();
  });
});
