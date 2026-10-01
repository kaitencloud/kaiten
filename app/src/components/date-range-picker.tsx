import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarIcon } from 'lucide-react';
import { useId } from 'react';
import type { DateRange, PropsRange } from 'react-day-picker';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { Calendar } from './ui/calendar';

type CalendarProps = React.ComponentProps<typeof Calendar>;

export type DateRangePickerProps = {
  className?: string;
  date: DateRange | undefined;
  onSelect: PropsRange['onSelect'];
} & Omit<
  CalendarProps,
  | 'mode'
  | 'initialFocus'
  | 'selected'
  | 'onSelect'
  | 'defaultMonth'
  | 'numberOfMonths'
>;

export function DateRangePicker({
  className,
  date,
  onSelect,
  ...props
}: DateRangePickerProps) {
  const { t } = useTranslation();
  return (
    <div className={cn('grid gap-2 w-full', className)}>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              id={useId()}
              variant={'outline'}
              className={cn(
                'w-full justify-start text-left font-normal',
                !date && 'text-muted-foreground',
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date?.from ? (
                date.to ? (
                  <>
                    {formatDate(date.from, { dateStyle: 'medium' })} -{' '}
                    {formatDate(date.to, { dateStyle: 'medium' })}
                  </>
                ) : (
                  formatDate(date.from, { dateStyle: 'medium' })
                )
              ) : (
                <span>{t('Common.pickDate')}</span>
              )}
            </Button>
          }
        />
        <PopoverContent className="w-auto p-0" align="center">
          <Calendar
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={onSelect}
            numberOfMonths={2}
            {...props}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
