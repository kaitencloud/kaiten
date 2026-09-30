import { describe, expect, it } from 'vite-plus/test';
import type { License } from '@/api-client';
import {
  licenseVersionFormSchema,
  licenseVersionFormValuesToLicenseInput,
} from '../forms/license-version-form';

const baseLicense = {
  description: 'Base license',
  familyId: 'family-enterprise',
  id: 'lic-1',
  isDefault: true,
  name: 'Enterprise',
  slug: 'enterprise-v1',
  type: 'PAID',
  version: '1.0.0',
  versionName: 'Enterprise v1',
} as License;

describe('licenseVersionFormValuesToLicenseInput', () => {
  it('inherits name and type from base license', () => {
    const result = licenseVersionFormValuesToLicenseInput(
      {
        baseLicenseSlug: baseLicense.slug!,
        createAsDraft: false,
        description: 'Updated description',
        selectedFamilyId: 'family-enterprise',
        versionName: 'Enterprise v2',
      },
      baseLicense,
    );

    expect(result.name).toBe(baseLicense.name);
    expect(result.type).toBe(baseLicense.type);
    expect(result.versionName).toBe('Enterprise v2');
    expect(result.description).toBe('Updated description');
  });

  // The family is what makes the new row a version of the base's product.
  // Sending the name alone would open a second product under that name: the
  // name is a display label, not the family key, and two products
  // may share one.
  it('targets the base license family by id', () => {
    const result = licenseVersionFormValuesToLicenseInput(
      {
        baseLicenseSlug: baseLicense.slug!,
        createAsDraft: false,
        description: 'New version',
        selectedFamilyId: 'family-enterprise',
        versionName: 'v2',
      },
      baseLicense,
    );

    expect(result.familyId).toBe('family-enterprise');
  });

  it('creates a published version that is not the default', () => {
    const result = licenseVersionFormValuesToLicenseInput(
      {
        baseLicenseSlug: baseLicense.slug!,
        createAsDraft: false,
        description: 'New version',
        selectedFamilyId: 'family-enterprise',
        versionName: 'v2',
      },
      baseLicense,
    );

    expect(result.isDefault).toBe(false);
    expect(result.lifecycleState).toBe('PUBLISHED');
  });

  // A version being prepared: nothing serves it until it is published.
  it('creates a draft when asked to', () => {
    const result = licenseVersionFormValuesToLicenseInput(
      {
        baseLicenseSlug: baseLicense.slug!,
        createAsDraft: true,
        description: 'Next version',
        selectedFamilyId: 'family-enterprise',
        versionName: 'v3',
      },
      baseLicense,
    );

    expect(result.isDefault).toBe(false);
    expect(result.lifecycleState).toBe('DRAFT');
  });
});

describe('licenseVersionFormSchema', () => {
  it('requires a selected family', () => {
    const result = licenseVersionFormSchema.safeParse({
      baseLicenseSlug: 'enterprise-v2',
      baseVersion: '2.4',
      createAsDraft: false,
      description: 'New version',
      selectedFamilyId: '',
      versionName: 'Enterprise v2.4',
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.error.issues[0]?.message).toBe(
      'Pages.Licenses.Version.Form.Errors.licenseNameRequired',
    );
    expect(result.error.issues[0]?.path).toEqual(['selectedFamilyId']);
  });

  // The version number itself is not collected any more: POST /licenses
  // assigns the next one in the family, so there is nothing to validate.
  it('accepts a payload that carries no version', () => {
    const result = licenseVersionFormSchema.safeParse({
      baseLicenseSlug: 'enterprise-v2',
      baseVersion: '2.4',
      createAsDraft: false,
      description: 'New version',
      selectedFamilyId: 'family-enterprise',
      versionName: 'Enterprise v2.5',
    });

    expect(result.success).toBe(true);
  });
});
