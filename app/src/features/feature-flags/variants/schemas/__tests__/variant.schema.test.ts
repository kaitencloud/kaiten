import { describe, it, expect } from 'vite-plus/test';
import {
  variantFormSchema,
  booleanVariantSchema,
  stringVariantSchema,
  numberVariantSchema,
  objectVariantSchema,
  getVariantSchemaByType,
  validateVariant,
  hasDuplicateNames,
  generateUniqueVariantName,
  mapToFormVariants,
  mapToApiVariants,
  VARIANT_TYPE_OPTIONS,
} from '../variant.schema';
import type { Variant as ApiVariant } from '@/api-client/types.gen';

describe('variant schemas', () => {
  describe('variantFormSchema', () => {
    it('should validate valid variant with all fields', () => {
      const variant = {
        name: 'variant_a',
        description: 'Variant A',
        value: true,
      };
      const result = variantFormSchema.safeParse(variant);
      expect(result.success).toBe(true);
    });

    it('should validate variant with empty description', () => {
      const variant = {
        name: 'variant_a',
        description: '',
        value: 'test',
      };
      const result = variantFormSchema.safeParse(variant);
      expect(result.success).toBe(true);
    });

    it('should accept various value types', () => {
      const variants = [
        { name: 'bool', description: '', value: true },
        { name: 'string', description: '', value: 'text' },
        { name: 'number', description: '', value: 42 },
        { name: 'object', description: '', value: { key: 'value' } },
      ];

      variants.forEach((variant) => {
        const result = variantFormSchema.safeParse(variant);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('booleanVariantSchema', () => {
    it('should validate boolean true value', () => {
      const variant = {
        name: 'enabled',
        description: 'Enabled state',
        value: true,
      };
      const result = booleanVariantSchema.safeParse(variant);
      expect(result.success).toBe(true);
    });

    it('should validate boolean false value', () => {
      const variant = {
        name: 'disabled',
        description: 'Disabled state',
        value: false,
      };
      const result = booleanVariantSchema.safeParse(variant);
      expect(result.success).toBe(true);
    });

    it('should validate string "true"', () => {
      const variant = {
        name: 'enabled',
        description: '',
        value: 'true',
      };
      const result = booleanVariantSchema.safeParse(variant);
      expect(result.success).toBe(true);
    });

    it('should validate string "false"', () => {
      const variant = {
        name: 'disabled',
        description: '',
        value: 'false',
      };
      const result = booleanVariantSchema.safeParse(variant);
      expect(result.success).toBe(true);
    });

    it('should reject missing name', () => {
      const variant = {
        description: '',
        value: true,
      };
      const result = booleanVariantSchema.safeParse(variant);
      expect(result.success).toBe(false);
    });

    it('should reject empty name', () => {
      const variant = {
        name: '',
        description: '',
        value: true,
      };
      const result = booleanVariantSchema.safeParse(variant);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('nameRequired');
      }
    });

    it('should reject undefined value', () => {
      const variant = {
        name: 'test',
        description: '',
        value: undefined,
      };
      const result = booleanVariantSchema.safeParse(variant);
      expect(result.success).toBe(false);
    });

    it('should reject null value', () => {
      const variant = {
        name: 'test',
        description: '',
        value: null,
      };
      const result = booleanVariantSchema.safeParse(variant);
      expect(result.success).toBe(false);
    });
  });

  describe('stringVariantSchema', () => {
    it('should validate string value', () => {
      const variant = {
        name: 'option_a',
        description: 'Option A',
        value: 'value_a',
      };
      const result = stringVariantSchema.safeParse(variant);
      expect(result.success).toBe(true);
    });

    it('should reject empty string value', () => {
      const variant = {
        name: 'option_a',
        description: '',
        value: '',
      };
      const result = stringVariantSchema.safeParse(variant);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('valueRequired');
      }
    });

    it('should reject non-string value', () => {
      const variant = {
        name: 'option_a',
        description: '',
        value: 123,
      };
      const result = stringVariantSchema.safeParse(variant);
      expect(result.success).toBe(false);
    });

    it('should validate long string value', () => {
      const variant = {
        name: 'long_text',
        description: '',
        value: 'a'.repeat(1000),
      };
      const result = stringVariantSchema.safeParse(variant);
      expect(result.success).toBe(true);
    });
  });

  describe('numberVariantSchema', () => {
    it('should validate positive integer', () => {
      const variant = {
        name: 'count',
        description: 'Count value',
        value: 42,
      };
      const result = numberVariantSchema.safeParse(variant);
      expect(result.success).toBe(true);
    });

    it('should validate negative integer', () => {
      const variant = {
        name: 'temperature',
        description: '',
        value: -10,
      };
      const result = numberVariantSchema.safeParse(variant);
      expect(result.success).toBe(true);
    });

    it('should validate zero', () => {
      const variant = {
        name: 'zero',
        description: '',
        value: 0,
      };
      const result = numberVariantSchema.safeParse(variant);
      expect(result.success).toBe(true);
    });

    it('should validate float', () => {
      const variant = {
        name: 'pi',
        description: '',
        value: 3.14159,
      };
      const result = numberVariantSchema.safeParse(variant);
      expect(result.success).toBe(true);
    });

    it('should reject string value', () => {
      const variant = {
        name: 'count',
        description: '',
        value: '42',
      };
      const result = numberVariantSchema.safeParse(variant);
      expect(result.success).toBe(false);
    });

    it('should reject undefined value', () => {
      const variant = {
        name: 'count',
        description: '',
        value: undefined,
      };
      const result = numberVariantSchema.safeParse(variant);
      expect(result.success).toBe(false);
    });
  });

  describe('objectVariantSchema', () => {
    it('should validate simple object', () => {
      const variant = {
        name: 'config',
        description: 'Configuration',
        value: { key: 'value' },
      };
      const result = objectVariantSchema.safeParse(variant);
      expect(result.success).toBe(true);
    });

    it('should validate nested object', () => {
      const variant = {
        name: 'config',
        description: '',
        value: {
          theme: 'dark',
          settings: {
            fontSize: 14,
            lineHeight: 1.5,
          },
        },
      };
      const result = objectVariantSchema.safeParse(variant);
      expect(result.success).toBe(true);
    });

    it('should validate empty object', () => {
      const variant = {
        name: 'config',
        description: '',
        value: {},
      };
      const result = objectVariantSchema.safeParse(variant);
      expect(result.success).toBe(true);
    });

    it('should validate object with various value types', () => {
      const variant = {
        name: 'config',
        description: '',
        value: {
          string: 'text',
          number: 42,
          boolean: true,
          null: null,
          array: [1, 2, 3],
          nested: { key: 'value' },
        },
      };
      const result = objectVariantSchema.safeParse(variant);
      expect(result.success).toBe(true);
    });
  });

  describe('getVariantSchemaByType', () => {
    it('should return booleanVariantSchema for boolean type', () => {
      const schema = getVariantSchemaByType('boolean');
      expect(schema).toBe(booleanVariantSchema);
    });

    it('should return stringVariantSchema for string type', () => {
      const schema = getVariantSchemaByType('string');
      expect(schema).toBe(stringVariantSchema);
    });

    it('should return numberVariantSchema for number type', () => {
      const schema = getVariantSchemaByType('number');
      expect(schema).toBe(numberVariantSchema);
    });

    it('should return objectVariantSchema for object type', () => {
      const schema = getVariantSchemaByType('object');
      expect(schema).toBe(objectVariantSchema);
    });
  });

  describe('validateVariant', () => {
    it('should validate boolean variant', () => {
      const variant = { name: 'test', description: '', value: true };
      const result = validateVariant(variant, 'boolean');
      expect(result.success).toBe(true);
    });

    it('should validate string variant', () => {
      const variant = { name: 'test', description: '', value: 'text' };
      const result = validateVariant(variant, 'string');
      expect(result.success).toBe(true);
    });

    it('should validate number variant', () => {
      const variant = { name: 'test', description: '', value: 42 };
      const result = validateVariant(variant, 'number');
      expect(result.success).toBe(true);
    });

    it('should validate object variant', () => {
      const variant = { name: 'test', description: '', value: { key: 'val' } };
      const result = validateVariant(variant, 'object');
      expect(result.success).toBe(true);
    });

    it('should reject invalid variant for type', () => {
      const variant = { name: 'test', description: '', value: 'text' };
      const result = validateVariant(variant, 'number');
      expect(result.success).toBe(false);
    });
  });

  describe('hasDuplicateNames', () => {
    it('should return false for unique names', () => {
      const variants = [
        { name: 'variant_a' },
        { name: 'variant_b' },
        { name: 'variant_c' },
      ];
      expect(hasDuplicateNames(variants)).toBe(false);
    });

    it('should return true for duplicate names', () => {
      const variants = [
        { name: 'variant_a' },
        { name: 'variant_b' },
        { name: 'variant_a' },
      ];
      expect(hasDuplicateNames(variants)).toBe(true);
    });

    it('should return false for empty array', () => {
      expect(hasDuplicateNames([])).toBe(false);
    });

    it('should return false for single variant', () => {
      const variants = [{ name: 'variant_a' }];
      expect(hasDuplicateNames(variants)).toBe(false);
    });

    it('should be case-sensitive', () => {
      const variants = [{ name: 'variant_a' }, { name: 'Variant_A' }];
      expect(hasDuplicateNames(variants)).toBe(false);
    });
  });

  describe('generateUniqueVariantName', () => {
    it('should generate variant_1 for empty array', () => {
      const name = generateUniqueVariantName([]);
      expect(name).toBe('variant_1');
    });

    it('should generate variant_2 when variant_1 exists', () => {
      const existing = [{ name: 'variant_1' }];
      const name = generateUniqueVariantName(existing);
      expect(name).toBe('variant_2');
    });

    it('should skip to next available number', () => {
      const existing = [{ name: 'variant_1' }, { name: 'variant_2' }];
      const name = generateUniqueVariantName(existing);
      expect(name).toBe('variant_3');
    });

    it('should handle gaps in numbering', () => {
      const existing = [{ name: 'variant_1' }, { name: 'variant_3' }];
      const name = generateUniqueVariantName(existing);
      expect(name).toBe('variant_2');
    });

    it('should use custom prefix', () => {
      const name = generateUniqueVariantName([], 'option');
      expect(name).toBe('option_1');
    });

    it('should increment until unique name found', () => {
      const existing = Array.from({ length: 10 }, (_, i) => ({
        name: `variant_${i + 1}`,
      }));
      const name = generateUniqueVariantName(existing);
      expect(name).toBe('variant_11');
    });
  });

  describe('mapToFormVariants', () => {
    it('should map API variants to form variants', () => {
      const apiVariants: ApiVariant[] = [
        { name: 'variant_a', description: 'Variant A', value: true },
        { name: 'variant_b', description: 'Variant B', value: false },
      ];
      const formVariants = mapToFormVariants(apiVariants);
      expect(formVariants).toHaveLength(2);
      expect(formVariants![0]).toEqual({
        name: 'variant_a',
        description: 'Variant A',
        value: true,
      });
    });

    it('should convert null description to empty string', () => {
      const apiVariants: ApiVariant[] = [
        { name: 'variant_a', description: '', value: true },
      ];
      const formVariants = mapToFormVariants(apiVariants);
      expect(formVariants![0].description).toBe('');
    });

    it('should return null for null input', () => {
      const formVariants = mapToFormVariants(null);
      expect(formVariants).toBeNull();
    });

    it('should handle empty array', () => {
      const formVariants = mapToFormVariants([]);
      expect(formVariants).toEqual([]);
    });

    it('should preserve value types', () => {
      const apiVariants: ApiVariant[] = [
        { name: 'bool', description: '', value: true },
        { name: 'string', description: '', value: 'text' },
        { name: 'number', description: '', value: 42 },
        { name: 'object', description: '', value: { key: 'val' } },
      ];
      const formVariants = mapToFormVariants(apiVariants);
      expect(formVariants![0].value).toBe(true);
      expect(formVariants![1].value).toBe('text');
      expect(formVariants![2].value).toBe(42);
      expect(formVariants![3].value).toEqual({ key: 'val' });
    });
  });

  describe('mapToApiVariants', () => {
    it('should map form variants to API variants', () => {
      const formVariants = [
        { name: 'variant_a', description: 'Variant A', value: true },
        { name: 'variant_b', description: 'Variant B', value: false },
      ];
      const apiVariants = mapToApiVariants(formVariants);
      expect(apiVariants).toHaveLength(2);
      expect(apiVariants![0]).toEqual({
        name: 'variant_a',
        description: 'Variant A',
        value: true,
      });
    });

    it('should return null for null input', () => {
      const apiVariants = mapToApiVariants(null);
      expect(apiVariants).toBeNull();
    });

    it('should handle empty array', () => {
      const apiVariants = mapToApiVariants([]);
      expect(apiVariants).toEqual([]);
    });

    it('should preserve all fields', () => {
      const formVariants = [
        { name: 'test', description: 'Test variant', value: { key: 'val' } },
      ];
      const apiVariants = mapToApiVariants(formVariants);
      expect(apiVariants![0]).toEqual({
        name: 'test',
        description: 'Test variant',
        value: { key: 'val' },
      });
    });
  });

  describe('VARIANT_TYPE_OPTIONS', () => {
    it('should contain all variant types', () => {
      expect(VARIANT_TYPE_OPTIONS).toHaveLength(4);
      expect(VARIANT_TYPE_OPTIONS.map((opt) => opt.value)).toEqual([
        'boolean',
        'string',
        'number',
        'object',
      ]);
    });

    it('should have proper labels', () => {
      const labels = VARIANT_TYPE_OPTIONS.map((opt) => opt.label);
      expect(labels).toContain('Boolean');
      expect(labels).toContain('String');
      expect(labels).toContain('Number');
      expect(labels).toContain('JSON Object');
    });
  });

  describe('integration tests', () => {
    it('should round-trip variants through form and API mappers', () => {
      const originalApi: ApiVariant[] = [
        { name: 'on', description: 'On state', value: true },
        { name: 'off', description: 'Off state', value: false },
      ];

      const formVariants = mapToFormVariants(originalApi);
      const backToApi = mapToApiVariants(formVariants);

      expect(backToApi).toEqual(originalApi);
    });

    it('should validate and transform variants of different types', () => {
      const variants = [
        {
          name: 'bool',
          description: '',
          value: true,
          type: 'boolean' as const,
        },
        {
          name: 'str',
          description: '',
          value: 'text',
          type: 'string' as const,
        },
        { name: 'num', description: '', value: 42, type: 'number' as const },
        {
          name: 'obj',
          description: '',
          value: { key: 'val' },
          type: 'object' as const,
        },
      ];

      variants.forEach((variant) => {
        const result = validateVariant(variant, variant.type);
        expect(result.success).toBe(true);
      });
    });
  });
});
