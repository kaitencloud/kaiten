import { describe, expect, it } from 'vite-plus/test';
import {
  initialReleaseFormValues,
  normalizeReleaseFormValues,
  releaseFormSchema,
  validateReleaseAddComponentsStep,
  validateReleaseInheritedComponentsStep,
} from '../release.schema';

describe('releaseFormSchema', () => {
  it('validates release form values with the minimal create payload', () => {
    const result = releaseFormSchema.safeParse({
      ...initialReleaseFormValues,
      creationMode: 'scratch',
      description: 'Initial release',
      version: 'v1.0.0',
    });

    expect(result.success).toBe(true);
  });

  it('rejects missing version', () => {
    const result = releaseFormSchema.safeParse({
      ...initialReleaseFormValues,
      creationMode: 'scratch',
      description: 'Initial release',
    });

    expect(result.success).toBe(false);
  });

  it('rejects empty version', () => {
    const result = releaseFormSchema.safeParse({
      ...initialReleaseFormValues,
      creationMode: 'scratch',
      description: 'Initial release',
      version: '',
    });

    expect(result.success).toBe(false);
  });

  it('allows an empty description', () => {
    const result = releaseFormSchema.safeParse({
      ...initialReleaseFormValues,
      creationMode: 'scratch',
      version: 'v1.0.0',
    });

    expect(result.success).toBe(true);
  });

  it('requires choosing a creation mode before continuing', () => {
    const result = releaseFormSchema.safeParse({
      ...initialReleaseFormValues,
      version: 'v1.0.0',
    });

    expect(result.success).toBe(false);
  });

  it('rejects update patches without a previous release', () => {
    const result = releaseFormSchema.safeParse({
      ...initialReleaseFormValues,
      componentPatches: [
        {
          componentId: 'component-1',
          componentSlug: 'api-gateway',
          description: '',
          name: '',
          op: 'update',
          resolvedForkComponentId: '',
          slug: '',
          version: 'v1.0.1',
        },
      ],
      creationMode: 'scratch',
      version: 'v1.0.0',
    });

    expect(result.success).toBe(false);
  });

  it('requires a previous release when the mode is existing', () => {
    const result = releaseFormSchema.safeParse({
      ...initialReleaseFormValues,
      creationMode: 'existing',
      version: 'v1.0.0',
    });

    expect(result.success).toBe(false);
  });

  it('ignores add components when validating inherited component changes', () => {
    const result = validateReleaseInheritedComponentsStep({
      ...initialReleaseFormValues,
      componentPatches: [
        {
          componentId: '',
          componentSlug: '',
          description: '',
          name: '',
          op: 'add',
          resolvedForkComponentId: '',
          slug: '',
          version: '',
        },
      ],
      creationMode: 'existing',
      previousReleaseId: 'release-1',
      version: 'v1.0.0',
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid add components when validating the add components step', () => {
    const result = validateReleaseAddComponentsStep({
      ...initialReleaseFormValues,
      componentPatches: [
        {
          componentId: '',
          componentSlug: '',
          description: '',
          name: '',
          op: 'add',
          resolvedForkComponentId: '',
          slug: '',
          version: '',
        },
      ],
      creationMode: 'scratch',
      version: 'v1.0.0',
    });

    expect(result.success).toBe(false);
  });

  it('accepts a valid optional slug', () => {
    const result = releaseFormSchema.safeParse({
      ...initialReleaseFormValues,
      creationMode: 'scratch',
      slug: 'my-release',
      version: 'v1.0.0',
    });

    expect(result.success).toBe(true);
  });
});

describe('normalizeReleaseFormValues', () => {
  it('omits an empty slug so the API generates one', () => {
    const result = normalizeReleaseFormValues({
      ...initialReleaseFormValues,
      creationMode: 'scratch',
      version: 'v1.0.0',
    });

    expect(result.slug).toBeUndefined();
  });

  it('keeps a provided slug (trimmed)', () => {
    const result = normalizeReleaseFormValues({
      ...initialReleaseFormValues,
      creationMode: 'scratch',
      slug: '  my-release  ',
      version: 'v1.0.0',
    });

    expect(result.slug).toBe('my-release');
  });
});
