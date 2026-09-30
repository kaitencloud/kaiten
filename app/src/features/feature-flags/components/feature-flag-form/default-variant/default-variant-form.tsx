import { withForm } from '@/hooks/form';
import type { DefaultVariantFormProps } from '../../../types';
import { featureFlagFormOpts } from '../../../utils/shared-form';
import { DefaultVariantConfig } from './default-variant-config';

export const DefaultVariantForm = withForm({
  ...featureFlagFormOpts,
  props: {} as DefaultVariantFormProps,
  render: function DefaultVariantFormRender({ form }) {
    const variants = form.state.values.variants || [];

    return (
      <form.AppField
        name="default_variant"
        validators={{
          onChangeListenTo: ['variants'],
          onChange: ({ value, fieldApi }: { value: any; fieldApi: any }) => {
            const variants = fieldApi.form.getFieldValue('variants') || [];
            const variantNames = variants.map((v: any) => v.name);

            const isBasicType = value?.type === 'basic';
            const basicValue = isBasicType ? value.value : '';

            if (variantNames.length === 1 && isBasicType && basicValue === '') {
              fieldApi.setValue({
                type: 'basic',
                value: variantNames[0],
              });
              return undefined;
            }

            if (
              isBasicType &&
              basicValue !== '' &&
              variantNames.length > 0 &&
              !variantNames.includes(basicValue)
            ) {
              setTimeout(() => {
                fieldApi.setValue({
                  type: 'basic',
                  value: variantNames.length > 0 ? variantNames[0] : '',
                });
              }, 0);
              return undefined;
            }

            if (variantNames.length === 0 && isBasicType && basicValue !== '') {
              setTimeout(() => {
                fieldApi.setValue({ type: 'basic', value: '' });
              }, 0);
              return undefined;
            }

            return undefined;
          },
        }}
      >
        {(field: any) => {
          const metadata =
            (form.state.values.metadata as Record<string, unknown>) ?? {};
          const fallbackValue =
            'fallback_value' in metadata ? metadata.fallback_value : undefined;

          const handleFallbackChange = (val: unknown | undefined) => {
            const current =
              (form.state.values.metadata as Record<string, unknown>) ?? {};
            if (val === undefined) {
              const { fallback_value: _fallbackValue, ...rest } = current;
              form.setFieldValue('metadata', rest);
            } else {
              form.setFieldValue('metadata', {
                ...current,
                fallback_value: val,
              });
            }
          };

          return (
            <DefaultVariantConfig
              value={field.state.value}
              variants={variants as any}
              onChange={(value) => field.handleChange(value)}
              fallbackValue={fallbackValue}
              onFallbackChange={handleFallbackChange}
            />
          );
        }}
      </form.AppField>
    );
  },
});
