import { type ReactNode, useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { Addon, InstanceBilling } from '@/api-client';
import { Button } from '@/components/ui/button';
import { BoundaryClosingNotice, ProblemAlert } from '@/domains/billing';
import {
  StackedFormDialogFooter,
  StackedFormDialogPanel,
} from '@/functionals/stacked-form-dialog';
import { createFormSubmitHandler } from '@/hooks/form';
import { useAttachAddonForm } from '../../../../../hooks/use-attach-addon-form';
import { useInstanceDetail } from '../../../instance-detail-context';
import { AttachAddonFields } from './attach-addon-fields';

type AttachAddonFormProps = {
  /** The versions the instance can take. */
  addons: readonly Addon[];
  /** What is said above the fields when part of what they offer could not be read. */
  notice?: ReactNode;
  onAttached: () => void;
  onCancel: () => void;
  subscription: InstanceBilling;
};

/**
 * The form that attaches an add-on to an instance. It sends one request however
 * often it is pressed; a period being closed says so and is waited out, and a refusal
 * leaves the dialog open with what was typed, on its field when it is about one,
 * above the buttons otherwise.
 */
export function AttachAddonForm({
  addons,
  notice,
  onAttached,
  onCancel,
  subscription,
}: AttachAddonFormProps) {
  const { t } = useTranslation();
  const formId = useId();
  const { entitlements, instance } = useInstanceDetail();
  const { closing, failure, form } = useAttachAddonForm({
    addons,
    entitlements,
    instanceSlug: instance.slug ?? instance.id,
    onAttached,
  });

  return (
    <form.AppForm>
      <form id={formId} onSubmit={createFormSubmitHandler(form.handleSubmit)}>
        <StackedFormDialogFooter>
          <Button onClick={onCancel} type="button" variant="outline">
            {t('Common.cancel')}
          </Button>
          <form.SubmitButton
            allowPristine
            form={formId}
            label={t(
              'Pages.Customers.Instances.Detail.Billing.Addons.Attach.confirm',
            )}
          />
        </StackedFormDialogFooter>
        <StackedFormDialogPanel>
          <div className="space-y-5">
            {notice}
            <AttachAddonFields
              addons={addons}
              form={form}
              period={subscription.billingPeriod}
            />
            <p
              className="text-sm text-muted-foreground"
              data-testid="addons-note"
            >
              {t('Pages.Customers.Instances.Detail.Billing.Addons.note')}
            </p>
            {closing ? <BoundaryClosingNotice /> : null}
            {failure && !closing ? (
              <ProblemAlert
                autoFocus
                error={failure}
                onRetry={() => void form.handleSubmit()}
              />
            ) : null}
          </div>
        </StackedFormDialogPanel>
      </form>
    </form.AppForm>
  );
}
