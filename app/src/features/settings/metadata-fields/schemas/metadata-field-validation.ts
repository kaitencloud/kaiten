import { z } from 'zod';
import { partitionFields } from '@/functionals/metadata-fields';
import type {
  MetadataFieldFormErrors,
  MetadataFieldFormWarnings,
  MetadataResourceType,
  MetadataSettingsField,
} from '../types';
import {
  commonNativeKeys,
  type MetadataFieldFormValues,
  metadataFieldFormStateSchema,
  parseEnumOptions,
  resourceNativeKeys,
} from './metadata-fields.schema';

export const getNativeMetadataKeys = (
  resourceType: MetadataResourceType,
): string[] => [...commonNativeKeys, ...resourceNativeKeys[resourceType]];

export const isNativeMetadataKey = (
  key: string,
  resourceType: MetadataResourceType,
): boolean => {
  const normalizedKey = key.trim().toLowerCase();
  return getNativeMetadataKeys(resourceType).some(
    (nativeKey) => nativeKey.toLowerCase() === normalizedKey,
  );
};

export const createMetadataFieldFormValidationSchema = (options: {
  editingFieldId?: string;
  fields: MetadataSettingsField[];
  resourceType: MetadataResourceType;
}) =>
  metadataFieldFormStateSchema.superRefine((parsed, ctx) => {
    const key = parsed.key.trim();
    if (key && isNativeMetadataKey(key, options.resourceType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'This key is reserved by the native resource model.',
        path: ['key'],
      });
    }

    const { active } = partitionFields(options.fields);
    const collidesWithActiveKey = active.some(
      (field) =>
        field.id !== options.editingFieldId &&
        field.key.toLowerCase() === key.toLowerCase(),
    );
    if (key && collidesWithActiveKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'An active metadata field already uses this key.',
        path: ['key'],
      });
    }

    const needsEnumOptions =
      parsed.primaryType === 'ENUM' || parsed.primaryType === 'ENUM_LIST';
    if (
      !parsed.rawMode &&
      needsEnumOptions &&
      parseEnumOptions(parsed.enumOptionsText).length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Add at least one enum option.',
        path: ['enumOptionsText'],
      });
    }
  });

export const validateMetadataFieldForm = (
  values: MetadataFieldFormValues,
  options: {
    editingFieldId?: string;
    fields: MetadataSettingsField[];
    rawMode?: boolean;
    resourceType: MetadataResourceType;
  },
): MetadataFieldFormErrors => {
  const result = createMetadataFieldFormValidationSchema(options).safeParse({
    ...values,
    rawMode: options.rawMode ?? false,
  });

  if (result.success) return {};

  const errors: MetadataFieldFormErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field !== 'string') continue;
    const typedField = field as keyof MetadataFieldFormValues;
    errors[typedField] ??= issue.message;
  }
  return errors;
};

export const computeMetadataFieldFormWarnings = (
  values: MetadataFieldFormValues,
  options: {
    editingFieldId?: string;
    fields: MetadataSettingsField[];
  },
): MetadataFieldFormWarnings => {
  const warnings: MetadataFieldFormWarnings = {};
  const key = values.key.trim();
  if (!key) return warnings;

  const { archived } = partitionFields(options.fields);
  const reusedArchivedKey = archived.some(
    (field) =>
      field.id !== options.editingFieldId &&
      field.key.toLowerCase() === key.toLowerCase(),
  );
  if (reusedArchivedKey) {
    warnings.key =
      'An archived field already used this key. Existing values stored under it on resources will be re-evaluated against the new schema.';
  }

  return warnings;
};

export const hasMetadataFieldFormErrors = (
  errors: MetadataFieldFormErrors,
): boolean => Object.keys(errors).length > 0;
