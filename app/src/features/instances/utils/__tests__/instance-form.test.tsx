import { describe, expect, it } from 'vite-plus/test';
import type { Instance, License } from '@/api-client';
import {
  instanceDetailsFormValuesToInstanceInput,
  instanceFormValuesToInstanceInput,
  instanceFormValuesToUpdateInput,
  instanceToFormValues,
} from '../../components/instance-form';

// Test data
const mockInstanceFormValues = {
  name: 'Test Instance',
  description: 'Test Description',
  customerId: 'customer-1',
  slug: '',
  deploymentZoneId: '',
  licenseSlug: 'license-slug-1',
  licenseDate: {
    from: new Date('2024-01-01'),
    to: new Date('2024-12-31'),
  },
  metadata: { owner: 'team-platform', tier: 'gold' },
  lifecycleStage: '',
};

const mockLicenses: License[] = [
  {
    id: 'license-1',
    slug: 'license-slug-1',
    name: 'Test License',
    description: 'Test License Description',
    isDefault: false,
    type: 'PAID',
  } as License,
];

const mockInstance: Instance = {
  id: 'instance-1',
  name: 'Test Instance',
  description: 'Test Description',
  customerId: 'customer-1',
  customerSlug: 'customer-slug-1',
  licenseId: 'license-1',
  licenseSlug: 'license-slug-1',
  startLicenseDate: '2024-01-01T00:00:00Z',
  endLicenseDate: '2024-12-31T23:59:59Z',
  metadata: { owner: 'team-platform', tier: 'gold' },
  status: 'HEALTHY',
  createdAt: '2024-01-01T00:00:00Z',
  createdBy: { id: 'user-1', name: 'User 1' },
  updatedAt: '2024-01-01T00:00:00Z',
  updatedBy: { id: 'user-1', name: 'User 1' },
};

describe('InstanceForm - Helper Functions', () => {
  describe('instanceFormValuesToInstanceInput', () => {
    it('should transform form values to InstanceInput correctly', () => {
      const result = instanceFormValuesToInstanceInput(
        mockInstanceFormValues,
        mockLicenses,
      );

      expect(result).toEqual({
        name: 'Test Instance',
        description: 'Test Description',
        customerId: 'customer-1',
        licenseId: 'license-1',
        startLicenseDate: '2024-01-01T00:00:00.000Z',
        endLicenseDate: '2024-12-31T00:00:00.000Z',
        metadata: { owner: 'team-platform', tier: 'gold' },
      });
    });

    // Instance metadata is tolerant: keys the SaaS reports and no field
    // declares are legitimate, and the PUT full-replaces the blob, so the
    // form value has to carry them through untouched.
    it('should send the metadata the form carries, undeclared keys included', () => {
      const values = {
        ...mockInstanceFormValues,
        metadata: { tier: 'gold', reported_by_saas: 'agent-1' },
      };

      const result = instanceFormValuesToInstanceInput(values, mockLicenses);
      expect(result.metadata).toEqual({
        tier: 'gold',
        reported_by_saas: 'agent-1',
      });
    });

    it('should convert dates to ISO strings correctly', () => {
      const fromDate = new Date('2024-06-15T10:30:00Z');
      const toDate = new Date('2025-06-15T15:45:00Z');

      const values = {
        ...mockInstanceFormValues,
        licenseDate: { from: fromDate, to: toDate },
      };

      const result = instanceFormValuesToInstanceInput(values, mockLicenses);
      expect(result.startLicenseDate).toBe('2024-06-15T10:30:00.000Z');
      expect(result.endLicenseDate).toBe('2025-06-15T15:45:00.000Z');
    });

    it('should omit an empty slug so the API generates one', () => {
      const result = instanceFormValuesToInstanceInput(
        mockInstanceFormValues,
        mockLicenses,
      );

      expect(result.slug).toBeUndefined();
    });

    it('should keep a provided slug (trimmed)', () => {
      const result = instanceFormValuesToInstanceInput(
        { ...mockInstanceFormValues, slug: '  acme-prod  ' },
        mockLicenses,
      );

      expect(result.slug).toBe('acme-prod');
    });

    // The zone is optional on create: an instance can be created orphan and
    // deployed later from the list or its detail page.
    it('should omit an empty deployment zone', () => {
      const result = instanceFormValuesToInstanceInput(
        mockInstanceFormValues,
        mockLicenses,
      );

      expect(result.deploymentZoneId).toBeUndefined();
    });

    it('should keep the selected deployment zone', () => {
      const result = instanceFormValuesToInstanceInput(
        { ...mockInstanceFormValues, deploymentZoneId: 'zone-1' },
        mockLicenses,
      );

      expect(result.deploymentZoneId).toBe('zone-1');
    });
  });

  describe('instanceFormValuesToUpdateInput', () => {
    // Regression: the full edit form seeds its values from instanceToFormValues,
    // which previously leaked the instance's server-only, read-only fields into
    // the PUT body and triggered a 422 "unexpected property" (slug, status,
    // createdAt, createdBy, updatedAt, updatedBy, customerSlug).
    const SERVER_ONLY_FIELDS = [
      'slug',
      'status',
      'createdAt',
      'createdBy',
      'updatedAt',
      'updatedBy',
      'customerSlug',
      'id',
      'licenseSlug',
      'lifecycleStage',
    ] as const;

    it('should not leak read-only fields when seeded from an instance', () => {
      const formValues = instanceToFormValues(mockInstance);

      const result = instanceFormValuesToUpdateInput(
        formValues,
        mockLicenses,
        mockInstance,
      );

      for (const field of SERVER_ONLY_FIELDS) {
        expect(result).not.toHaveProperty(field);
      }
      expect(Object.keys(result).sort()).toEqual(
        [
          'customerId',
          'deploymentZoneId',
          'description',
          'endLicenseDate',
          'licenseId',
          'metadata',
          'name',
          'startLicenseDate',
        ].sort(),
      );
    });

    // The zone is editable on the update form, but the PUT has no way to
    // express a detach: an omitted deploymentZoneId *is* "keep the current
    // one", so an emptied field must fall back rather than clear.
    it('should apply the zone chosen on the form', () => {
      const result = instanceFormValuesToUpdateInput(
        { ...instanceToFormValues(mockInstance), deploymentZoneId: 'zone-2' },
        mockLicenses,
        { ...mockInstance, deploymentZoneId: 'zone-1' },
      );

      expect(result.deploymentZoneId).toBe('zone-2');
    });

    it('should keep the current zone when the field was emptied', () => {
      const result = instanceFormValuesToUpdateInput(
        { ...instanceToFormValues(mockInstance), deploymentZoneId: '' },
        mockLicenses,
        { ...mockInstance, deploymentZoneId: 'zone-1' },
      );

      expect(result.deploymentZoneId).toBe('zone-1');
    });

    it('should leave an orphan instance orphan', () => {
      const result = instanceFormValuesToUpdateInput(
        { ...instanceToFormValues(mockInstance), deploymentZoneId: '' },
        mockLicenses,
        mockInstance,
      );

      expect(result.deploymentZoneId).toBeUndefined();
    });

    it('should map the writable fields from the instance', () => {
      const result = instanceFormValuesToUpdateInput(
        instanceToFormValues(mockInstance),
        mockLicenses,
        mockInstance,
      );

      expect(result).toEqual({
        name: 'Test Instance',
        description: 'Test Description',
        customerId: 'customer-1',
        licenseId: 'license-1',
        metadata: { owner: 'team-platform', tier: 'gold' },
        startLicenseDate: '2024-01-01T00:00:00.000Z',
        endLicenseDate: '2024-12-31T23:59:59.000Z',
      });
    });

    it('should preserve the existing instance metadata', () => {
      const result = instanceFormValuesToUpdateInput(
        instanceToFormValues(mockInstance),
        mockLicenses,
        mockInstance,
      );

      expect(result.metadata).toEqual(mockInstance.metadata);
    });
  });

  describe('metadata preservation in update helpers', () => {
    it('should preserve metadata for details updates', () => {
      const result = instanceDetailsFormValuesToInstanceInput(
        {
          name: mockInstance.name,
          description: mockInstance.description,
          customerId: mockInstance.customerId,
        },
        mockInstance,
      );

      expect(result.metadata).toEqual(mockInstance.metadata);
    });
  });

  // Regression: the PUT replaces the full resource, so an update body
  // built without deploymentZoneId silently detached the instance from its
  // deployment zone and broke the release card resolution chain.
  describe('deployment zone preservation in update helpers', () => {
    const zonedInstance: Instance = {
      ...mockInstance,
      deploymentZoneId: 'zone-1',
    };

    it('should resend the deployment zone on full updates', () => {
      const result = instanceFormValuesToUpdateInput(
        instanceToFormValues(zonedInstance),
        mockLicenses,
        zonedInstance,
      );

      expect(result.deploymentZoneId).toBe('zone-1');
    });

    it('should resend the deployment zone on details updates', () => {
      const result = instanceDetailsFormValuesToInstanceInput(
        {
          name: zonedInstance.name,
          description: zonedInstance.description,
          customerId: zonedInstance.customerId,
        },
        zonedInstance,
      );

      expect(result.deploymentZoneId).toBe('zone-1');
    });

  });

  describe('instanceToFormValues', () => {
    it('should transform Instance to form values correctly', () => {
      const result = instanceToFormValues(mockInstance);

      expect(result).toMatchObject({
        name: 'Test Instance',
        description: 'Test Description',
        customerId: 'customer-1',
        licenseSlug: 'license-slug-1',
        licenseDate: {
          from: new Date('2024-01-01T00:00:00Z'),
          to: new Date('2024-12-31T23:59:59Z'),
        },
        metadata: { owner: 'team-platform', tier: 'gold' },
      });
    });

    // Seeded whole, undeclared keys included: the metadata step folds the ones
    // it doesn't render back into the value on every edit, so nothing the
    // instance carries is dropped by the PUT.
    it('should seed metadata from the instance', () => {
      const instance = {
        ...mockInstance,
        metadata: { tier: 'gold', reported_by_saas: 'agent-1' },
      };

      const result = instanceToFormValues(instance);
      expect(result.metadata).toEqual({
        tier: 'gold',
        reported_by_saas: 'agent-1',
      });
    });

    it('should default absent metadata to an empty object', () => {
      const instance = {
        ...mockInstance,
        metadata: undefined,
      } as unknown as Instance;

      const result = instanceToFormValues(instance);
      expect(result.metadata).toEqual({});
    });

    it('should convert ISO date strings to Date objects', () => {
      const instance = {
        ...mockInstance,
        startLicenseDate: '2024-03-15T08:00:00.000Z',
        endLicenseDate: '2025-03-15T17:30:00.000Z',
      };

      const result = instanceToFormValues(instance);
      expect(result.licenseDate.from).toEqual(
        new Date('2024-03-15T08:00:00.000Z'),
      );
      expect(result.licenseDate.to).toEqual(
        new Date('2025-03-15T17:30:00.000Z'),
      );
    });

    it('should exclude specific fields from form values', () => {
      const result = instanceToFormValues(mockInstance);

      // These fields are dropped by the destructuring
      expect(result).not.toHaveProperty('id');
      expect(result).not.toHaveProperty('startLicenseDate');
      expect(result).not.toHaveProperty('endLicenseDate');
      expect(result).not.toHaveProperty('licenseId');

      // These fields are kept but transformed
      expect(result).toHaveProperty('licenseDate');
      expect(result).toHaveProperty('metadata');
      expect(result).toHaveProperty('licenseSlug');
    });
  });
});
