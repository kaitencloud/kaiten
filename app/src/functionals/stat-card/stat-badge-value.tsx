import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * A word in the value slot of a stats card. A figure gets the numeral type;
 * a state or a category ("Development", "Not deployed") reads as a badge, so
 * it never impersonates a number.
 */
export const StatBadgeValue = ({
  className,
  variant = 'outline',
  ...props
}: BadgeProps) => (
  <Badge
    variant={variant}
    className={cn('text-sm font-medium', className)}
    {...props}
  />
);
