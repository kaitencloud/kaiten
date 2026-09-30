import { inferUiType } from '@/functionals/metadata-fields';
import {
  createMetadataFieldFormValues,
  metadataFieldFormValuesFromField,
  primaryTypeByUiType,
} from './schemas/metadata-fields.schema';
import type {
  MetadataDryRunImpact,
  MetadataFieldFormValues,
  MetadataPrimaryType,
  MetadataResourceType,
  MetadataSettingsField,
} from './types';

export type DialogMode = 'create' | 'duplicate' | 'edit';

export type MetadataFieldDialogState =
  | { mode: 'create' }
  | { mode: 'duplicate'; source: MetadataSettingsField }
  | { field: MetadataSettingsField; mode: 'edit' };

export type MetadataFieldSubmitPayload = {
  jsonSchema: Record<string, unknown>;
  values: MetadataFieldFormValues;
};

export type PendingDryRunConfirmation = {
  field: MetadataSettingsField;
  impact: MetadataDryRunImpact;
  jsonSchema: Record<string, unknown>;
  values: MetadataFieldFormValues;
};

export type PendingArchive = {
  field: MetadataSettingsField;
  isLastActive: boolean;
};

const primaryTypeLabels: Record<MetadataPrimaryType, string> = {
  BOOLEAN: 'Boolean',
  DATE: 'Date',
  ENUM: 'Enum',
  ENUM_LIST: 'Enum list',
  NUMBER: 'Number',
  STRING: 'String',
};

export const getErrorMessage = (error: unknown, fallback: string): string => {
  // The REST client surfaces the parsed Problem body on `error.data`.
  const responseData = (
    error as {
      data?: {
        detail?: string;
        message?: string;
        title?: string;
      };
    }
  )?.data;

  if (responseData?.detail) return responseData.detail;
  if (responseData?.message) return responseData.message;
  if (responseData?.title) return responseData.title;
  if (error instanceof Error && error.message) return error.message;

  return fallback;
};

export const isForbiddenError = (error: unknown): boolean => {
  const errorLike = error as {
    code?: string;
    message?: string;
    response?: { status?: number };
    status?: number;
  };
  const message = errorLike?.message?.toLowerCase() ?? '';

  return (
    errorLike?.response?.status === 403 ||
    errorLike?.status === 403 ||
    errorLike?.code === 'FORBIDDEN' ||
    message.includes('403') ||
    message.includes('forbidden') ||
    message.includes('permission') ||
    message.includes('access restricted')
  );
};

export const isArchivedField = (field: MetadataSettingsField) =>
  Boolean(field.archivedAt);

export function resourceTypeLabel(resourceType: MetadataResourceType) {
  return resourceType === 'DEPLOYMENT_ZONE' ? 'Deployment Zones' : 'Instances';
}

export function primaryTypeLabel(primaryType: MetadataPrimaryType) {
  return primaryTypeLabels[primaryType];
}

export function primaryTypeFromField(
  field: MetadataSettingsField,
): MetadataPrimaryType | null {
  return primaryTypeByUiType[inferUiType(field.jsonSchema)] ?? null;
}

export function dialogInitialValues(
  state: MetadataFieldDialogState | null,
): MetadataFieldFormValues {
  if (!state) return createMetadataFieldFormValues();
  if (state.mode === 'edit') {
    return metadataFieldFormValuesFromField(state.field);
  }
  if (state.mode === 'duplicate') {
    const sourceValues = metadataFieldFormValuesFromField(state.source);
    // Duplicate inherits everything *except* the key, which must be unique.
    return { ...sourceValues, key: '' };
  }
  return createMetadataFieldFormValues();
}

export function dialogInitialField(
  state: MetadataFieldDialogState | null,
): MetadataSettingsField | undefined {
  if (!state) return undefined;
  if (state.mode === 'edit') return state.field;
  if (state.mode === 'duplicate') return state.source;
  return undefined;
}
