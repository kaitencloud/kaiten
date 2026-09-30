import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type StatsCardsRowItem = {
  id?: string;
  label: ReactNode;
  labelClassName?: string;
  value: ReactNode;
  helper?: ReactNode;
  Icon?: LucideIcon;
  iconClassName?: string;
  valueClassName?: string;
  helperClassName?: string;
  cardClassName?: string;
};

export type StatsCardsRowProps = {
  items: StatsCardsRowItem[];
  className?: string;
  columnsClassName?: string;
};

/**
 * A row of figures. The cards share the row's height and each pins its value
 * to the bottom, so the values sit on one line whatever their labels do above
 * them. When any card carries a helper, every card keeps the line for it, so
 * a helper never lifts its own value off that line.
 *
 * Two columns from `md`, four from `xl`: a label needs room to stay on one
 * line, and a page has four figures at most. A row with more, or fewer,
 * passes its own `columnsClassName`.
 */
export const StatsCardsRow = ({
  items,
  className,
  columnsClassName = 'md:grid-cols-2 xl:grid-cols-4',
}: StatsCardsRowProps) => {
  const hasHelpers = items.some((item) => item.helper);

  return (
    <div
      className={cn(
        // Two abreast on a phone: six full-width cards pushed every list
        // under the fold.
        'grid grid-cols-2 gap-3 md:gap-4 lg:gap-6',
        columnsClassName,
        className,
      )}
    >
      {items.map((item, index) => (
        <Card
          key={item.id ?? `stat-card-${index}`}
          className={cn('gap-0 px-4 py-3 md:px-6 md:py-4', item.cardClassName)}
        >
          <div className="flex items-start justify-between gap-3">
            <CardDescription
              className={cn(
                'min-w-0 text-sm leading-snug md:text-base',
                item.labelClassName,
              )}
            >
              {item.label}
            </CardDescription>
            {item.Icon ? (
              <item.Icon
                className={cn(
                  'mt-1 size-4 shrink-0 text-muted-foreground',
                  item.iconClassName,
                )}
              />
            ) : null}
          </div>
          <div className="mt-auto pt-3">
            <CardTitle
              className={cn(
                'text-2xl leading-none md:text-3xl',
                item.valueClassName,
              )}
            >
              {item.value}
            </CardTitle>
            {/* One size and one line height for every helper, whatever a
                caller renders in it, so the row's helpers sit on one line. */}
            {hasHelpers ? (
              <CardDescription
                data-slot="stat-card-helper"
                className={cn(
                  'mt-2 min-h-4 text-xs leading-4',
                  item.helperClassName,
                )}
              >
                {item.helper}
              </CardDescription>
            ) : null}
          </div>
        </Card>
      ))}
    </div>
  );
};
