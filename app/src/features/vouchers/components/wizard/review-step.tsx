import { useStore } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { VoucherTypeBadge } from '@/domains/billing';
import { withForm } from '@/hooks/form';
import type { VoucherReferences } from '../../hooks/use-voucher-references';
import { voucherFormOpts, voucherFormValuesToBody } from '../../schemas';
import { describeVoucherReview } from '../../utils/voucher-review';

type ReviewStepProps = {
  references: VoucherReferences;
};

/**
 * The last step: the voucher in plain language, as it will read to whoever is given the
 * code, before anything is sent. Each sentence says what it counts and for whom, so that
 * a discount that lasts three invoices is not read as one that lasts three months.
 * Publishing makes the code redeemable; a draft can still be changed.
 */
export const ReviewStep = withForm({
  ...voucherFormOpts,
  props: {} as ReviewStepProps,
  render: function ReviewStepRender({ form, references }) {
    const { i18n, t } = useTranslation();
    const values = useStore(form.store, (state) => state.values);
    const sentences = describeVoucherReview(voucherFormValuesToBody(values), {
      language: i18n.language,
      names: references.names,
      t,
    });
    const code = values.code.trim();

    return (
      <div className="space-y-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="text-muted-foreground">
            {t('Pages.Vouchers.Review.name')}
          </dt>
          <dd className="flex flex-wrap items-center gap-2 font-medium">
            {values.name.trim()}
            <VoucherTypeBadge type={values.voucherType} />
          </dd>
          <dt className="text-muted-foreground">
            {t('Pages.Vouchers.Review.code')}
          </dt>
          <dd>
            {code === '' ? (
              <span className="text-muted-foreground">
                {t('Pages.Vouchers.Review.codeGenerated')}
              </span>
            ) : (
              <span className="font-mono">{code}</span>
            )}
          </dd>
        </dl>
        <ul
          aria-label={t('Pages.Vouchers.Review.summary')}
          className="list-disc space-y-1.5 pl-5 text-sm"
          data-testid="voucher-review"
        >
          {sentences.map((sentence) => (
            <li key={sentence}>{sentence}</li>
          ))}
        </ul>
        <p className="text-[0.8rem] text-muted-foreground">
          {t('Pages.Vouchers.Review.publishNote')}
        </p>
      </div>
    );
  },
});
