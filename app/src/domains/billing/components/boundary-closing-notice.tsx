import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

type BoundaryClosingNoticeProps = {
  className?: string;
};

/**
 * What a screen says while the period of a subscription is being closed and the
 * request it was about is waiting to be sent again (`useBoundaryRetry`): not an
 * error, since nothing went wrong and the request is sent by itself in a moment.
 */
export function BoundaryClosingNotice({
  className,
}: BoundaryClosingNoticeProps) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border bg-card px-4 py-3 text-sm',
        className,
      )}
      data-testid="boundary-closing"
      role="status"
    >
      <Loader2 aria-hidden className="mt-0.5 size-4 shrink-0 animate-spin" />
      <div className="space-y-0.5">
        <p className="font-medium">
          {t('Features.Billing.Problems.BoundaryClosing.title')}
        </p>
        <p className="text-muted-foreground">
          {t('Features.Billing.Problems.BoundaryClosing.description')}
        </p>
      </div>
    </div>
  );
}
