import { useTranslation } from 'react-i18next';
import { useAppForm } from '@/hooks/form';
import { getVariantSchemaByType } from '../schemas/variant.schema';
import type { Variant } from '../types';

export type VariantFormProps = {
  variant: Variant;
  type: 'boolean' | 'string' | 'number' | 'object';
  onLiveChange?: (variant: Variant) => void;
  onChange: (variant: Variant) => void;
  onValidationChange?: (isValid: boolean) => void;
};

const booleanVariantOptions = [
  { label: 'true', value: 'true' },
  { label: 'false', value: 'false' },
];

const getVariantFieldOptionLabel = (option: unknown) => {
  if (typeof option === 'object' && option !== null && 'label' in option) {
    return String((option as { label: string }).label);
  }

  return String(option);
};

const getVariantFieldOptionValue = (option: unknown) => {
  if (typeof option === 'object' && option !== null && 'value' in option) {
    return String((option as { value: string }).value);
  }

  return String(option);
};

const getInitialVariantValue = (
  variant: Variant,
  type: VariantFormProps['type'],
) => {
  const initialValue = variant.value;

  if (type === 'object') {
    if (typeof initialValue === 'object' && initialValue !== null) {
      return JSON.stringify(initialValue, null, 2);
    }

    return typeof initialValue === 'string' ? initialValue : '{}';
  }

  if (type === 'boolean') {
    return String(initialValue);
  }

  return initialValue;
};

const normalizeVariantValue = (
  value: Variant['value'],
  type: VariantFormProps['type'],
) => {
  if (type === 'boolean') {
    return value === 'true';
  }

  if (type === 'object' && typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value;
};

const useVariantEditorForm = ({
  onChange,
  onLiveChange,
  onValidationChange,
  type,
  variant,
}: VariantFormProps) => {
  return useAppForm({
    defaultValues: {
      description: variant.description || '',
      name: variant.name,
      value: getInitialVariantValue(variant, type),
    },
    validators: {
      onBlur: getVariantSchemaByType(type) as any,
    },
    onSubmit: async () => {
      // Form submission logic is now handled in onChange listener
      // to support real-time updates even when invalid
    },
    listeners: {
      onChange: ({ formApi }) => {
        const state = formApi.state;
        onLiveChange?.({
          name: state.values.name,
          description: state.values.description,
          value:
            type === 'boolean'
              ? state.values.value === 'true'
              : state.values.value,
        });
      },
      onBlur: ({ formApi }) => {
        const state = formApi.state;
        onValidationChange?.(state.isValid);
        onChange({
          name: state.values.name,
          description: state.values.description,
          value: normalizeVariantValue(state.values.value, type),
        });
      },
    },
  });
};

export function VariantForm({
  variant,
  type,
  onLiveChange,
  onChange,
  onValidationChange,
}: VariantFormProps) {
  const { t } = useTranslation();
  const form = useVariantEditorForm({
    onChange,
    onLiveChange,
    onValidationChange,
    type,
    variant,
  });

  return (
    <form.AppForm>
      <div className="space-y-3">
        <form.AppField name="name">
          {(field) => (
            <field.TextField
              label={t('Features.Variants.Form.name')}
              required
              placeholder={t('Features.Variants.Form.namePlaceholder')}
            />
          )}
        </form.AppField>

        <form.AppField name="description">
          {(field) => (
            <field.TextField
              label={t('Features.Variants.Form.description')}
              placeholder={t('Features.Variants.Form.descriptionPlaceholder')}
            />
          )}
        </form.AppField>

        <form.AppField name="value">
          {(field) => {
            if (type === 'boolean') {
              return (
                <field.SelectField
                  label={t('Features.Variants.Form.value')}
                  required
                  placeholder={t('Features.Variants.Form.valuePlaceholder')}
                  disabled={true}
                  options={booleanVariantOptions}
                  getOptionLabel={getVariantFieldOptionLabel}
                  getOptionValue={getVariantFieldOptionValue}
                />
              );
            }

            if (type === 'string') {
              return (
                <field.TextField
                  label={t('Features.Variants.Form.value')}
                  required
                  placeholder={t('Features.Variants.Form.valuePlaceholder')}
                  description={t(
                    'Features.Variants.Form.valueDescription.string',
                  )}
                />
              );
            }

            if (type === 'number') {
              return (
                <field.NumberField
                  label={t('Features.Variants.Form.value')}
                  required
                  placeholder="0"
                  description={t(
                    'Features.Variants.Form.valueDescription.number',
                  )}
                />
              );
            }

            // Object type
            return (
              <field.JsonField
                label={t('Features.Variants.Form.value')}
                required
                placeholder='{"key": "value"}'
                description={t(
                  'Features.Variants.Form.valueDescription.object',
                )}
              />
            );
          }}
        </form.AppField>
      </div>
    </form.AppForm>
  );
}
