import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { getHandoffStatusLabelKey, type HandoffStatus } from '../logic';

type HandoffStatusLabelProps = {
  className?: string;
  status: HandoffStatus;
};

/**
 * Where an invoice stands in the queue the organization's accounting system
 * reads. What is waiting is what needs someone, so it reads at full weight; what
 * was acknowledged, or never needed to be, is muted.
 */
export function HandoffStatusLabel({
  className,
  status,
}: HandoffStatusLabelProps) {
  const { t } = useTranslation();

  return (
    <span
      className={cn(
        'text-sm',
        status === 'PENDING' ? 'font-medium' : 'text-muted-foreground',
        className,
      )}
      data-handoff-status={status}
    >
      {t(getHandoffStatusLabelKey(status))}
    </span>
  );
}
