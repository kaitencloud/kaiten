import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { BoundaryClosingNotice, ProblemAlert } from '@/domains/billing';
import {
  StackedFormDialogFooter,
  StackedFormDialogPanel,
} from '@/functionals/stacked-form-dialog';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';
import type { useRedeemVoucher } from '../../../../../hooks/use-redeem-voucher';
import { redeemVoucherFormOpts } from '../../../../../schemas/redeem-voucher-form-options';
import { getRedeemVoucherFormErrors } from '../../../../../schemas/redeem-voucher.schema';
import { useInstanceDetail } from '../../../instance-detail-context';
import { RedeemVoucherOutcome } from './redeem-voucher-outcome';
import { RedeemVoucherVerdict } from './redeem-voucher-verdict';

type RedeemVoucherFormProps = {
  /** Closes the dialog: the route leads back to the tab. */
  onClose: () => void;
  /** The two requests and what they returned: the dialog holds them, to title itself by the step it is on. */
  redeem: ReturnType<typeof useRedeemVoucher>;
};

/**
 * The form that applies a code to an instance, in two steps the dialog shows one after
 * the other: the code is checked, and what the API said of it is shown as the offer it
 * makes (or why it cannot be redeemed); a code it called valid can then be redeemed, and
 * what that did is shown, read from the API on either side of it. Editing the code forgets
 * the verdict, which was about the old one. The code is held by the field and the two
 * requests, and goes nowhere else.
 */
export function RedeemVoucherForm({ onClose, redeem }: RedeemVoucherFormProps) {
  const { t } = useTranslation();
  const formId = useId();
  const { entitlements, instance } = useInstanceDetail();

  const form = useAppForm({
    ...redeemVoucherFormOpts,
    listeners: { onChange: () => redeem.reset() },
    onSubmit: ({ value }) => redeem.check(value.code.trim()),
    validators: {
      onChange: ({ value }) => {
        const errors = getRedeemVoucherFormErrors(value);

        return errors
          ? { fields: { code: { message: errors.code ?? '' } } }
          : undefined;
      },
    },
  });

  if (redeem.outcome) {
    return (
      <>
        <StackedFormDialogFooter>
          <Button onClick={onClose} type="button">
            {t('Common.close')}
          </Button>
        </StackedFormDialogFooter>
        <StackedFormDialogPanel>
          <RedeemVoucherOutcome
            entitlements={entitlements}
            outcome={redeem.outcome}
          />
        </StackedFormDialogPanel>
      </>
    );
  }
  const valid = redeem.checked?.validity.valid === true;

  return (
    <form.AppForm>
      <form id={formId} onSubmit={createFormSubmitHandler(form.handleSubmit)}>
        <StackedFormDialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t('Common.cancel')}
          </Button>
          {valid ? (
            <Button
              disabled={redeem.pending}
              onClick={() => void redeem.confirm()}
              type="button"
            >
              {t(
                'Pages.Customers.Instances.Detail.Billing.Vouchers.Redeem.confirm',
              )}
            </Button>
          ) : (
            <form.SubmitButton
              allowPristine
              disabled={redeem.pending}
              form={formId}
              label={t(
                'Pages.Customers.Instances.Detail.Billing.Vouchers.Redeem.check',
              )}
            />
          )}
        </StackedFormDialogFooter>
        <StackedFormDialogPanel>
          <div className="space-y-5">
            <form.AppField name="code">
              {(field) => (
                <field.TextField
                  autoComplete="off"
                  description={t(
                    'Pages.Customers.Instances.Detail.Billing.Vouchers.Redeem.codeHint',
                  )}
                  label={t(
                    'Pages.Customers.Instances.Detail.Billing.Vouchers.Redeem.code',
                  )}
                  placeholder={t(
                    'Pages.Customers.Instances.Detail.Billing.Vouchers.Redeem.codePlaceholder',
                  )}
                  required
                />
              )}
            </form.AppField>
            {redeem.checked ? (
              <RedeemVoucherVerdict
                entitlements={entitlements}
                instanceName={instance.name}
                validity={redeem.checked.validity}
              />
            ) : null}
            {redeem.closing ? <BoundaryClosingNotice /> : null}
            {redeem.failure && !redeem.closing ? (
              <ProblemAlert
                autoFocus
                error={redeem.failure}
                onRetry={() =>
                  void (valid
                    ? redeem.confirm()
                    : redeem.check(form.state.values.code.trim()))
                }
              />
            ) : null}
          </div>
        </StackedFormDialogPanel>
      </form>
    </form.AppForm>
  );
}
