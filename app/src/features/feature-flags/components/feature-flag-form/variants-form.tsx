import { Card, CardContent } from '@/components/ui/card';
import type { Variant } from '@/api-client';
import { VariantList } from '../../variants';
import { withForm } from '@/hooks/form';
import type { VariantsFormProps } from '../../types';
import { featureFlagFormOpts } from '../../utils/shared-form';

type VariantsFormContentProps = {
  form: any;
  variantType: string;
};

function VariantsFormContent({ form, variantType }: VariantsFormContentProps) {
  return (
    <Card>
      <CardContent>
        <form.AppField name="variants">
          {(field: any) => (
            <VariantList
              variants={field.state.value || []}
              type={variantType as 'boolean' | 'string' | 'number' | 'object'}
              onChange={(variants: Variant[]) => {
                field.handleChange([...variants]);
              }}
            />
          )}
        </form.AppField>
      </CardContent>
    </Card>
  );
}

export const VariantsForm = withForm({
  ...featureFlagFormOpts,
  props: {} as VariantsFormProps,
  render: (props) => <VariantsFormContent {...props} />,
});
