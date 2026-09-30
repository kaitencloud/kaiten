import { Card, CardContent } from '@/components/ui/card';
import type { AnyFieldApi } from '@tanstack/react-form';
import type { Variant } from '@/api-client';
import { type Targeting, TargetingList } from '../../targeting';
import { withForm } from '@/hooks/form';
import type { TargetingFormProps } from '../../types';
import { featureFlagFormOpts } from '../../utils/shared-form';

type TargetingFormContentProps = {
  form: any;
};

function TargetingFormContent({ form }: TargetingFormContentProps) {
  return (
    <Card>
      <CardContent>
        <form.AppField name="targetings">
          {(field: AnyFieldApi) => (
            <TargetingList
              targetings={field.state.value || []}
              variants={(form.state.values.variants || []) as Variant[]}
              onChange={(targetings: Targeting[]) => {
                field.handleChange(targetings);
              }}
            />
          )}
        </form.AppField>
      </CardContent>
    </Card>
  );
}

export const TargetingForm = withForm({
  ...featureFlagFormOpts,
  props: {} as TargetingFormProps,
  render: (props) => <TargetingFormContent {...props} />,
});
