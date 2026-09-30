import { describe, expect, it } from 'vite-plus/test';
import type { Instance } from '@/api-client';
import {
  getInstanceDeploymentMode,
  instanceToDeploymentUpdateInput,
  isInstanceDeployed,
} from '../instance-deployment.utils';

const actor = { id: 'user-1', name: 'User 1' };

const orphanInstance: Instance = {
  createdAt: '2024-01-01T00:00:00Z',
  createdBy: actor,
  customerId: 'customer-1',
  customerSlug: 'customer-slug-1',
  description: 'Test Description',
  endLicenseDate: '2024-12-31T23:59:59Z',
  id: 'instance-1',
  licenseId: 'license-1',
  licenseSlug: 'license-slug-1',
  metadata: { owner: 'team-platform' },
  name: 'Test Instance',
  slug: 'test-instance',
  startLicenseDate: '2024-01-01T00:00:00Z',
  status: 'HEALTHY',
  updatedAt: '2024-01-01T00:00:00Z',
  updatedBy: actor,
};

const deployedInstance: Instance = {
  ...orphanInstance,
  deploymentZoneId: 'zone-1',
};

describe('getInstanceDeploymentMode', () => {
  it('reads an instance without a zone as a first deployment', () => {
    expect(getInstanceDeploymentMode(undefined)).toBe('deploy');
    expect(getInstanceDeploymentMode(null)).toBe('deploy');
    expect(getInstanceDeploymentMode('')).toBe('deploy');
  });

  it('reads an instance already on a zone as a migration', () => {
    expect(getInstanceDeploymentMode('zone-1')).toBe('migrate');
  });
});

describe('isInstanceDeployed', () => {
  it('is true only when a zone is set', () => {
    expect(isInstanceDeployed(undefined)).toBe(false);
    expect(isInstanceDeployed(null)).toBe(false);
    expect(isInstanceDeployed('zone-1')).toBe(true);
  });
});

describe('instanceToDeploymentUpdateInput', () => {
  it('sets the target zone', () => {
    const body = instanceToDeploymentUpdateInput(orphanInstance, 'zone-2');

    expect(body.deploymentZoneId).toBe('zone-2');
  });

  it('replaces the current zone when migrating', () => {
    const body = instanceToDeploymentUpdateInput(deployedInstance, 'zone-2');

    expect(body.deploymentZoneId).toBe('zone-2');
  });

  // The PUT replaces the whole resource: anything left out of the body is
  // dropped server-side, so a zone change must carry every writable field.
  it('carries over every writable field of the instance', () => {
    const body = instanceToDeploymentUpdateInput(orphanInstance, 'zone-2');

    expect(body).toEqual({
      customerId: 'customer-1',
      deploymentZoneId: 'zone-2',
      description: 'Test Description',
      endLicenseDate: '2024-12-31T23:59:59Z',
      licenseId: 'license-1',
      metadata: { owner: 'team-platform' },
      name: 'Test Instance',
      startLicenseDate: '2024-01-01T00:00:00Z',
    });
  });

  it('sends no read-only field the API would reject', () => {
    const body = instanceToDeploymentUpdateInput(orphanInstance, 'zone-2');

    for (const field of [
      'id',
      'slug',
      'status',
      'createdAt',
      'createdBy',
      'updatedAt',
      'updatedBy',
      'customerSlug',
      'licenseSlug',
      'lifecycleStage',
    ]) {
      expect(body).not.toHaveProperty(field);
    }
  });

  // The schema types metadata as always present, but a null would be rejected
  // by the PUT, so the mapper defaults it. Cast to reach that branch.
  it('defaults a null metadata to an empty object', () => {
    const body = instanceToDeploymentUpdateInput(
      { ...orphanInstance, metadata: null } as unknown as Instance,
      'zone-2',
    );

    expect(body.metadata).toEqual({});
  });
});
