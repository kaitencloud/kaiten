import { z } from 'zod';
import type { ReleaseWritable } from '@/api-client';
import { zComponentWritable, zReleaseWritable } from '@/api-client/zod.gen';
import type { ReleaseCreationMode } from '../types';

const optionalField = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  schema.or(z.literal(''));

export const releaseCreationModeSchema = z.enum(['scratch', 'existing']);
export const releaseCreationModeSelectionSchema = releaseCreationModeSchema.or(
  z.literal(''),
);
export const releaseComponentPatchOperationSchema = z.enum([
  'add',
  'update',
  'remove',
]);

export type ReleaseComponentPatchOperation = z.infer<
  typeof releaseComponentPatchOperationSchema
>;

export const emptyReleaseComponentPatch = {
  componentId: '',
  componentSlug: '',
  description: '',
  name: '',
  op: 'add' as const,
  resolvedForkComponentId: '',
  slug: '',
  version: '',
};

const componentPatchFormSchema = z
  .object({
    componentId: optionalField(z.string()),
    componentSlug: optionalField(z.string()),
    description: optionalField(zComponentWritable.shape.description.unwrap()),
    name: optionalField(zComponentWritable.shape.name),
    op: releaseComponentPatchOperationSchema,
    resolvedForkComponentId: optionalField(z.string()),
    slug: optionalField(zComponentWritable.shape.slug.unwrap()),
    version: optionalField(zComponentWritable.shape.version),
  })
  .superRefine((patch, ctx) => {
    const hasTarget = patch.componentId !== '' || patch.componentSlug !== '';

    if (patch.op === 'add') {
      if (patch.name === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Name is required when adding a component',
          path: ['name'],
        });
      }

      if (patch.version === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Version is required when adding a component',
          path: ['version'],
        });
      }
    }

    if (patch.op === 'update') {
      if (!hasTarget) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Select a component to update',
          path: ['componentId'],
        });
      }

      if (patch.version === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Provide a new version when deriving a component',
          path: ['version'],
        });
      }
    }

    if (patch.op === 'remove' && !hasTarget) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select a component to remove',
        path: ['componentId'],
      });
    }
  });

export const releaseBaseStepSchema = z
  .object({
    creationMode: releaseCreationModeSelectionSchema,
    previousReleaseId: optionalField(z.string()),
  })
  .superRefine((value, ctx) => {
    if (value.creationMode === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select how to create the release',
        path: ['creationMode'],
      });
      return;
    }

    if (
      value.creationMode === 'existing' &&
      value.previousReleaseId.trim() === ''
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select a base release',
        path: ['previousReleaseId'],
      });
    }
  });

export const releaseMetadataStepSchema = z.object({
  description: optionalField(zReleaseWritable.shape.description.unwrap()),
  slug: optionalField(zReleaseWritable.shape.slug.unwrap()),
  version: zReleaseWritable.shape.version,
});

export const releaseSelectedComponentsStepSchema = z.array(z.string());

export const releaseFormSchema = z
  .object({
    componentPatches: z.array(componentPatchFormSchema),
    creationMode: releaseCreationModeSelectionSchema,
    description: optionalField(zReleaseWritable.shape.description.unwrap()),
    previousReleaseId: optionalField(z.string()),
    selectedComponentIds: releaseSelectedComponentsStepSchema,
    slug: optionalField(zReleaseWritable.shape.slug.unwrap()),
    version: zReleaseWritable.shape.version,
  })
  .superRefine((value, ctx) => {
    if (value.creationMode === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select how to create the release',
        path: ['creationMode'],
      });
      return;
    }

    if (value.creationMode === 'existing' && value.previousReleaseId === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select a base release',
        path: ['previousReleaseId'],
      });
    }

    if (value.creationMode === 'existing') {
      return;
    }

    value.componentPatches.forEach((patch, index) => {
      if (patch.op === 'add') {
        return;
      }

      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Select a previous release before using update or remove patches',
        path: ['componentPatches', index, 'op'],
      });
    });
  });

export type ReleaseFormComponentPatch = z.infer<
  typeof componentPatchFormSchema
>;

export type ReleaseFormValues = {
  componentPatches: ReleaseFormComponentPatch[];
  creationMode: ReleaseCreationMode | '';
  description: string;
  previousReleaseId: string;
  selectedComponentIds: string[];
  slug: string;
  version: string;
};

export const initialReleaseFormValues: ReleaseFormValues = {
  componentPatches: [],
  creationMode: '',
  description: '',
  previousReleaseId: '',
  selectedComponentIds: [],
  slug: '',
  version: '',
};

const toOptionalValue = (value: string) => {
  const trimmedValue = value.trim();
  return trimmedValue === '' ? undefined : trimmedValue;
};

export function normalizeReleaseFormValues(
  value: ReleaseFormValues,
  componentIds?: string[],
): ReleaseWritable {
  return {
    componentIds:
      componentIds && componentIds.length > 0 ? componentIds : undefined,
    description: toOptionalValue(value.description),
    slug: toOptionalValue(value.slug),
    version: value.version.trim(),
  };
}

export function validateReleaseComponentChangesStep(value: ReleaseFormValues) {
  return releaseFormSchema.safeParse(value);
}

export function validateReleaseSelectComponentsStep(value: ReleaseFormValues) {
  return releaseSelectedComponentsStepSchema.safeParse(
    value.selectedComponentIds,
  );
}

export function validateReleaseInheritedComponentsStep(
  value: ReleaseFormValues,
) {
  return z
    .array(componentPatchFormSchema)
    .safeParse(
      value.componentPatches.filter(
        (patch) => patch.op === 'remove' || patch.op === 'update',
      ),
    );
}

export function validateReleaseAddComponentsStep(value: ReleaseFormValues) {
  return z
    .array(componentPatchFormSchema)
    .safeParse(value.componentPatches.filter((patch) => patch.op === 'add'));
}
