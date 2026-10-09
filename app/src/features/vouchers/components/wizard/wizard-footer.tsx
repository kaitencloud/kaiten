import { Link } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, Check, LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

type WizardFooterProps = {
  /** Whether the first step is open: there is nothing to go back to, only to leave. */
  isFirst: boolean;
  /** Whether the last step is open: it sends the voucher, where the others go on. */
  isReview: boolean;
  onBack: () => void;
  onSaveDraft: () => void;
  /** Whether a request is under way: nothing is sent twice. */
  submitting: boolean;
};

/**
 * The buttons under a step, pinned to the bottom of the scroll area. A step goes on, or
 * back, and the last one sends the voucher: publishes it, or keeps it as a draft to be
 * finished later. Next and Publish both submit the form, so that Enter in a field does
 * the same as the button under it; the page decides by the step it is on.
 */
export function WizardFooter({
  isFirst,
  isReview,
  onBack,
  onSaveDraft,
  submitting,
}: WizardFooterProps) {
  const { t } = useTranslation();

  return (
    <div className="sticky bottom-0 mt-6 flex flex-wrap items-center justify-between gap-3 border-t bg-app-background py-4">
      {isFirst ? (
        <Button
          nativeButton={false}
          render={<Link to="/vouchers">{t('Common.cancel')}</Link>}
          role="link"
          variant="outline"
        />
      ) : (
        <Button
          disabled={submitting}
          onClick={onBack}
          type="button"
          variant="outline"
        >
          <ArrowLeft />
          {t('Pages.Vouchers.Wizard.Buttons.back')}
        </Button>
      )}
      <div className="flex flex-wrap gap-2">
        {isReview ? (
          <>
            <Button
              disabled={submitting}
              onClick={onSaveDraft}
              type="button"
              variant="outline"
            >
              {t('Pages.Vouchers.Wizard.Buttons.saveDraft')}
            </Button>
            <Button disabled={submitting} type="submit">
              {submitting ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Check />
              )}
              {t('Pages.Vouchers.Wizard.Buttons.publish')}
            </Button>
          </>
        ) : (
          <Button type="submit">
            {t('Pages.Vouchers.Wizard.Buttons.next')}
            <ArrowRight />
          </Button>
        )}
      </div>
    </div>
  );
}
