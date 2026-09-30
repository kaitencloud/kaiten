import { describe, expect, it } from 'vite-plus/test';
import { licenseFormValuesToLicenseInput } from '../forms/license-form';

// Test data
const mockLicenseFormValues = {
  name: 'Test License',
  description: 'Test Description',
  type: 'DEVELOPMENT' as const,
  versionName: 'v1.0',
  slug: '',
  createAsDraft: false,
};

describe('LicenseForm - Helper Functions', () => {
  describe('licenseFormValuesToLicenseInput', () => {
    it('should transform form values to a LicenseWritable correctly', () => {
      const result = licenseFormValuesToLicenseInput(mockLicenseFormValues);

      // No version: the API assigns it on create.
      expect(result).toEqual({
        name: 'Test License',
        description: 'Test Description',
        type: 'DEVELOPMENT',
        versionName: 'v1.0',
        isDefault: false,
        lifecycleState: 'PUBLISHED',
      });
    });

    it('should always set isDefault to false', () => {
      const result = licenseFormValuesToLicenseInput(mockLicenseFormValues);
      expect(result.isDefault).toBe(false);
    });

    it('should handle different license types', () => {
      const testCases = ['DEVELOPMENT', 'TRIAL', 'PAID', 'COMMUNITY'] as const;

      testCases.forEach((type) => {
        const values = { ...mockLicenseFormValues, type };
        const result = licenseFormValuesToLicenseInput(values);
        expect(result.type).toBe(type);
      });
    });

    it('should preserve all form field values', () => {
      const customValues = {
        name: 'Custom License Name',
        description: 'Custom Description',
        type: 'PAID' as const,
        versionName: 'Custom Version',
        slug: '',
        createAsDraft: false,
      };

      const result = licenseFormValuesToLicenseInput(customValues);

      expect(result.name).toBe(customValues.name);
      expect(result.description).toBe(customValues.description);
      expect(result.type).toBe(customValues.type);
      expect(result.versionName).toBe(customValues.versionName);
    });

    it('should omit an empty slug so the API generates one', () => {
      const result = licenseFormValuesToLicenseInput(mockLicenseFormValues);
      expect(result.slug).toBeUndefined();
    });

    // The only state a new license can choose; publish, archive and
    // unarchive move it afterwards.
    it('should create the license as a draft when asked to', () => {
      const result = licenseFormValuesToLicenseInput({
        ...mockLicenseFormValues,
        createAsDraft: true,
      });
      expect(result.lifecycleState).toBe('DRAFT');
    });

    it('should keep a provided slug (trimmed)', () => {
      const result = licenseFormValuesToLicenseInput({
        ...mockLicenseFormValues,
        slug: '  my-license  ',
      });
      expect(result.slug).toBe('my-license');
    });
  });
});
