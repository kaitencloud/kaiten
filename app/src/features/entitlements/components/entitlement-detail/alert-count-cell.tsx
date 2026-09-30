import { cn } from '@/lib/utils';

const TONE_CLASS_NAMES = {
  destructive: 'text-destructive-subtle-foreground',
  warning: 'text-warning-subtle-foreground',
} as const;

type AlertCountCellProps = {
  locale: string;
  tone: keyof typeof TONE_CLASS_NAMES;
  value: number;
};

/**
 * A "near limit" or "over limit" count. Zero is not an alert: it takes the
 * muted tone, so the eye lands on the counts that are.
 */
export function AlertCountCell({ locale, tone, value }: AlertCountCellProps) {
  return (
    <span
      className={
        value > 0
          ? cn('font-medium', TONE_CLASS_NAMES[tone])
          : 'text-muted-foreground'
      }
    >
      {value.toLocaleString(locale)}
    </span>
  );
}
