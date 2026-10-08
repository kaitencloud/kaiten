import { useTranslation } from 'react-i18next';
import { withForm } from '@/hooks/form';
import { cancelFormOpts } from '../../../../../schemas/cancel-form-options';
import {
  CANCEL_REASON_MAX_LENGTH,
  countReasonCharacters,
} from '../../../../../schemas/cancel-subscription.schema';

/**
 * Why the subscription is canceled: optional, and kept with the cancellation. Its
 * counter reads the characters the API counts, so the person sees the limit
 * before the API says it.
 */
export const CancelReasonField = withForm({
  ...cancelFormOpts,
  render: function CancelReasonFieldRender({ form }) {
    const { t } = useTranslation();

    return (
      <form.AppField name="reason">
        {(field) => {
          const count = countReasonCharacters(field.state.value);
          const counter = t(
            'Pages.Customers.Instances.Detail.Billing.Cancel.Fields.reasonCounter',
            { count, max: CANCEL_REASON_MAX_LENGTH },
          );

          return (
            <div className="space-y-1.5">
              <field.TextAreaField
                description={counter}
                label={t(
                  'Pages.Customers.Instances.Detail.Billing.Cancel.Fields.reason',
                )}
                placeholder={t(
                  'Pages.Customers.Instances.Detail.Billing.Cancel.Fields.reasonPlaceholder',
                )}
              />
              {/* The refusal takes the place of the description, and the person still
                  has to see by how much the reason is too long. */}
              {count > CANCEL_REASON_MAX_LENGTH ? (
                <p
                  className="text-[0.8rem] font-medium text-destructive-subtle-foreground"
                  data-testid="cancel-reason-counter"
                >
                  {counter}
                </p>
              ) : null}
            </div>
          );
        }}
      </form.AppField>
    );
  },
});
