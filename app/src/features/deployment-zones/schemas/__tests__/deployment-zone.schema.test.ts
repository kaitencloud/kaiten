import { describe, expect, it } from 'vite-plus/test';
import { deploymentZoneFormSchema } from '../deployment-zone.schema';

describe('deploymentZoneFormSchema', () => {
  it('should validate valid deployment zone data', () => {
    const result = deploymentZoneFormSchema.safeParse({
      name: 'Production EU',
      type: 'production',
      description: 'Production deployment zone',
      metadata: { region: 'eu-west-1', cluster: 'prod' },
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing name', () => {
    const result = deploymentZoneFormSchema.safeParse({
      type: 'production',
      description: 'Production deployment zone',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty name', () => {
    const result = deploymentZoneFormSchema.safeParse({
      name: '',
      type: 'production',
      description: 'Production deployment zone',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing type', () => {
    const result = deploymentZoneFormSchema.safeParse({
      name: 'Production EU',
      description: 'Production deployment zone',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing description', () => {
    const result = deploymentZoneFormSchema.safeParse({
      name: 'Production EU',
      type: 'production',
    });
    expect(result.success).toBe(false);
  });

  it('should validate different zone types', () => {
    const types = ['production', 'staging', 'development'];
    for (const type of types) {
      const result = deploymentZoneFormSchema.safeParse({
        name: 'Test Zone',
        type,
        description: 'Test description',
      });
      expect(result.success).toBe(true);
    }
  });

  it('should allow optional features field', () => {
    const result = deploymentZoneFormSchema.safeParse({
      name: 'Production EU',
      type: 'production',
      description: 'Production deployment zone',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metadata).toBeUndefined();
    }
  });

  it('should validate features as record of unknown', () => {
    const result = deploymentZoneFormSchema.safeParse({
      name: 'Production EU',
      type: 'production',
      description: 'Production deployment zone',
      metadata: {
        region: 'eu-west-1',
        cluster: 'prod',
        resources: { cpu: 4, memory: '16GB' },
        tags: ['production', 'critical'],
      },
    });
    expect(result.success).toBe(true);
  });

  it('should allow optional releaseId', () => {
    const result = deploymentZoneFormSchema.safeParse({
      name: 'Production EU',
      type: 'production',
      description: 'Production deployment zone',
      releaseId: 'release-123',
    });
    expect(result.success).toBe(true);
  });

  it('should allow null releaseId', () => {
    const result = deploymentZoneFormSchema.safeParse({
      name: 'Production EU',
      type: 'production',
      description: 'Production deployment zone',
      releaseId: null,
    });
    expect(result.success).toBe(true);
  });
});
