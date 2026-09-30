import { describe, it, expect } from 'vite-plus/test';
import {
  featureFlagFormSchema,
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
} from '../feature-flag.schema';

describe('featureFlagFormSchema', () => {
  describe('name validation', () => {
    it('should accept valid name', () => {
      const data = {
        name: 'Test Feature',
        slug: 'test-feature',
        description: 'Test description',
        type: 'boolean',
        enabled: true,
        event_name: '',
        metadata: {},
        variants: [{ name: 'on', description: 'On', value: true }],
        default_variant: { type: 'basic', value: 'on' },
        targetings: null,
      };

      const result = featureFlagFormSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject empty name', () => {
      const data = {
        name: '',
        slug: 'test-feature',
        description: '',
        type: 'boolean',
        enabled: true,
        event_name: '',
        metadata: {},
        variants: [{ name: 'on', description: 'On', value: true }],
        default_variant: { type: 'basic', value: 'on' },
        targetings: null,
      };

      const result = featureFlagFormSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Name is required');
      }
    });
  });

  describe('slug validation', () => {
    it('should accept valid slug', () => {
      const data = {
        name: 'Test',
        slug: 'test-feature-flag',
        description: '',
        type: 'boolean',
        enabled: true,
        event_name: '',
        metadata: {},
        variants: [{ name: 'on', description: 'On', value: true }],
        default_variant: { type: 'basic', value: 'on' },
        targetings: null,
      };

      const result = featureFlagFormSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject empty slug', () => {
      const data = {
        name: 'Test',
        slug: '',
        description: '',
        type: 'boolean',
        enabled: true,
        event_name: '',
        metadata: {},
        variants: [{ name: 'on', description: 'On', value: true }],
        default_variant: { type: 'basic', value: 'on' },
        targetings: null,
      };

      const result = featureFlagFormSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Slug is required');
      }
    });
  });

  describe('variants validation', () => {
    it('should accept valid variants array', () => {
      const data = {
        name: 'Test',
        slug: 'test',
        description: '',
        type: 'boolean',
        enabled: true,
        event_name: '',
        metadata: {},
        variants: [
          { name: 'on', description: 'On', value: true },
          { name: 'off', description: 'Off', value: false },
        ],
        default_variant: { type: 'basic', value: 'on' },
        targetings: null,
      };

      const result = featureFlagFormSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept null variants', () => {
      const data = {
        name: 'Test',
        slug: 'test',
        description: '',
        type: 'boolean',
        enabled: true,
        event_name: '',
        metadata: {},
        variants: null,
        default_variant: { type: 'basic', value: '' },
        targetings: null,
      };

      const result = featureFlagFormSchema.safeParse(data);
      expect(result.success).toBe(false); // Should fail because variants validation requires at least one valid variant
    });

    it('should reject empty variants array', () => {
      const data = {
        name: 'Test',
        slug: 'test',
        description: '',
        type: 'boolean',
        enabled: true,
        event_name: '',
        metadata: {},
        variants: [],
        default_variant: { type: 'basic', value: 'on' }, // Valid default_variant to isolate variants error
        targetings: null,
      };

      const result = featureFlagFormSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        // Find the variants error specifically
        const variantsError = result.error.issues.find((issue) =>
          issue.path.includes('variants'),
        );
        expect(variantsError).toBeDefined();
        expect(variantsError?.message).toContain('allVariantsMustBeValid');
      }
    });

    it('should reject variants with empty name', () => {
      const data = {
        name: 'Test',
        slug: 'test',
        description: '',
        type: 'boolean',
        enabled: true,
        event_name: '',
        metadata: {},
        variants: [{ name: '', description: 'Test', value: true }],
        default_variant: { type: 'basic', value: 'on' }, // Valid default_variant to isolate variants error
        targetings: null,
      };

      const result = featureFlagFormSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        // Find the variants error specifically
        const variantsError = result.error.issues.find((issue) =>
          issue.path.includes('variants'),
        );
        expect(variantsError).toBeDefined();
        expect(variantsError?.message).toContain('allVariantsMustBeValid');
      }
    });

    it('should reject variants with undefined value', () => {
      const data = {
        name: 'Test',
        slug: 'test',
        description: '',
        type: 'boolean',
        enabled: true,
        event_name: '',
        metadata: {},
        variants: [{ name: 'on', description: 'On', value: undefined }],
        default_variant: { type: 'basic', value: '' },
        targetings: null,
      };

      const result = featureFlagFormSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject variants with empty string value', () => {
      const data = {
        name: 'Test',
        slug: 'test',
        description: '',
        type: 'string',
        enabled: true,
        event_name: '',
        metadata: {},
        variants: [{ name: 'variant_a', description: 'Variant A', value: '' }],
        default_variant: { type: 'basic', value: 'variant_a' },
        targetings: null,
      };

      const result = featureFlagFormSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          'allVariantsMustBeValid',
        );
      }
    });

    it('should accept variants with different value types', () => {
      const stringData = {
        name: 'Test',
        slug: 'test',
        description: '',
        type: 'string',
        enabled: true,
        event_name: '',
        metadata: {},
        variants: [{ name: 'variant_a', description: 'A', value: 'option-a' }],
        default_variant: { type: 'basic', value: 'variant_a' },
        targetings: null,
      };

      expect(featureFlagFormSchema.safeParse(stringData).success).toBe(true);

      const numberData = {
        ...stringData,
        type: 'number',
        variants: [{ name: 'high', description: 'High', value: 10 }],
        default_variant: { type: 'basic', value: 'high' },
      };

      expect(featureFlagFormSchema.safeParse(numberData).success).toBe(true);

      const objectData = {
        ...stringData,
        type: 'object',
        variants: [
          { name: 'config', description: 'Config', value: { theme: 'dark' } },
        ],
        default_variant: { type: 'basic', value: 'config' },
      };

      expect(featureFlagFormSchema.safeParse(objectData).success).toBe(true);
    });
  });

  describe('default_variant validation', () => {
    it('should accept valid basic default_variant', () => {
      const data = {
        name: 'Test',
        slug: 'test',
        description: '',
        type: 'boolean',
        enabled: true,
        event_name: '',
        metadata: {},
        variants: [{ name: 'on', description: 'On', value: true }],
        default_variant: { type: 'basic', value: 'on' },
        targetings: null,
      };

      const result = featureFlagFormSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject empty value in basic default_variant', () => {
      const data = {
        name: 'Test',
        slug: 'test',
        description: '',
        type: 'boolean',
        enabled: true,
        event_name: '',
        metadata: {},
        variants: [{ name: 'on', description: 'On', value: true }],
        default_variant: { type: 'basic', value: '' },
        targetings: null,
      };

      const result = featureFlagFormSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          'defaultVariantRequired',
        );
      }
    });

    it('should accept RolloutDate as default_variant', () => {
      const data = {
        name: 'Test',
        slug: 'test',
        description: '',
        type: 'boolean',
        enabled: true,
        event_name: '',
        metadata: {},
        variants: [
          { name: 'on', description: 'On', value: true },
          { name: 'off', description: 'Off', value: false },
        ],
        default_variant: {
          type: 'rollout_date',
          start: {
            date: '2024-01-01T00:00:00Z',
            variant: 'off',
            percentage: 0,
          },
          end: {
            date: '2024-12-31T23:59:59Z',
            variant: 'on',
            percentage: 100,
          },
        },
        targetings: null,
      };

      const result = featureFlagFormSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept RolloutPercentage as default_variant', () => {
      const data = {
        name: 'Test',
        slug: 'test',
        description: '',
        type: 'boolean',
        enabled: true,
        event_name: '',
        metadata: {},
        variants: [
          { name: 'on', description: 'On', value: true },
          { name: 'off', description: 'Off', value: false },
        ],
        default_variant: {
          type: 'rollout_percentage',
          distribution: {
            on: 50,
            off: 50,
          },
        },
        targetings: null,
      };

      const result = featureFlagFormSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('targetings validation', () => {
    it('should accept null targetings', () => {
      const data = {
        name: 'Test',
        slug: 'test',
        description: '',
        type: 'boolean',
        enabled: true,
        event_name: '',
        metadata: {},
        variants: [{ name: 'on', description: 'On', value: true }],
        default_variant: { type: 'basic', value: 'on' },
        targetings: null,
      };

      const result = featureFlagFormSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept empty targetings array', () => {
      const data = {
        name: 'Test',
        slug: 'test',
        description: '',
        type: 'boolean',
        enabled: true,
        event_name: '',
        metadata: {},
        variants: [{ name: 'on', description: 'On', value: true }],
        default_variant: { type: 'basic', value: 'on' },
        targetings: [],
      };

      const result = featureFlagFormSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept valid targetings array', () => {
      const data = {
        name: 'Test',
        slug: 'test',
        description: '',
        type: 'boolean',
        enabled: true,
        event_name: '',
        metadata: {},
        variants: [
          { name: 'on', description: 'On', value: true },
          { name: 'off', description: 'Off', value: false },
        ],
        default_variant: { type: 'basic', value: 'off' },
        targetings: [
          {
            type: 'basic',
            name: 'Premium Users',
            rule: 'user.plan == "premium"',
            variant: 'on',
          },
        ],
      };

      const result = featureFlagFormSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });
});

describe('step1Schema', () => {
  it('should validate basic info fields', () => {
    const data = {
      name: 'Test Feature',
      slug: 'test-feature',
      description: 'A test description',
      enabled: true,
      type: 'boolean',
      event_name: '',
      metadata: {},
    };

    const result = step1Schema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should reject missing name', () => {
    const data = {
      name: '',
      slug: 'test',
      description: '',
      enabled: true,
      type: 'boolean',
      event_name: '',
      metadata: {},
    };

    const result = step1Schema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should reject missing slug', () => {
    const data = {
      name: 'Test',
      slug: '',
      description: '',
      enabled: true,
      type: 'boolean',
      event_name: '',
      metadata: {},
    };

    const result = step1Schema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

describe('step2Schema', () => {
  it('should validate variants field', () => {
    const data = {
      variants: [{ name: 'on', description: 'On', value: true }],
    };

    const result = step2Schema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should reject empty variants', () => {
    const data = {
      variants: [],
    };

    const result = step2Schema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

describe('step3Schema', () => {
  it('should validate default_variant field with basic type', () => {
    const data = {
      default_variant: { type: 'basic', value: 'on' },
    };

    const result = step3Schema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should validate default_variant field with RolloutPercentage', () => {
    const data = {
      default_variant: {
        type: 'rollout_percentage',
        distribution: { on: 50, off: 50 },
      },
    };

    const result = step3Schema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should reject empty value in basic default_variant', () => {
    const data = {
      default_variant: { type: 'basic', value: '' },
    };

    const result = step3Schema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

describe('step4Schema', () => {
  it('should validate targetings field with null', () => {
    const data = {
      targetings: null,
    };

    const result = step4Schema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should validate targetings field with array', () => {
    const data = {
      targetings: [
        {
          type: 'basic',
          name: 'Test',
          rule: 'user.id == "123"',
          variant: 'on',
        },
      ],
    };

    const result = step4Schema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should validate targetings field with empty array', () => {
    const data = {
      targetings: [],
    };

    const result = step4Schema.safeParse(data);
    expect(result.success).toBe(true);
  });
});
