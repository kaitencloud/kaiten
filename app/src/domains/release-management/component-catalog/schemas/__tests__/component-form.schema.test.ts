import { describe, expect, it } from 'vite-plus/test';
import {
  componentFormSchema,
  initialComponentFormValues,
  normalizeComponentFormValues,
} from '../component-form.schema';

describe('componentFormSchema', () => {
  it('validates the minimal payload required to create a component', () => {
    const result = componentFormSchema.safeParse({
      ...initialComponentFormValues,
      name: 'API Gateway',
      version: 'v1.0.0',
    });

    expect(result.success).toBe(true);
  });

  it('allows empty optional slug and description fields', () => {
    const result = componentFormSchema.safeParse({
      ...initialComponentFormValues,
      name: 'Portal UI',
      version: 'v0.9.0',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a missing name', () => {
    const result = componentFormSchema.safeParse({
      ...initialComponentFormValues,
      version: 'v1.0.0',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a missing version', () => {
    const result = componentFormSchema.safeParse({
      ...initialComponentFormValues,
      name: 'API Gateway',
    });

    expect(result.success).toBe(false);
  });

  it('normalizes empty optional fields and trims submitted values', () => {
    expect(
      normalizeComponentFormValues({
        description: '  Routes traffic  ',
        name: '  API Gateway  ',
        slug: '  ',
        version: '  v1.2.3  ',
      }),
    ).toEqual({
      description: 'Routes traffic',
      name: 'API Gateway',
      slug: undefined,
      version: 'v1.2.3',
    });
  });
});
