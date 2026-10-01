import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarIcon } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { Calendar } from './ui/calendar';

export type DatePickerProps = {
  className?: string;
  date?: Date;
  onSelect: (date: Date | undefined) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function DatePicker({
  className,
  date,
  onSelect,
  disabled = false,
  placeholder,
}: DatePickerProps) {
  const { t } = useTranslation();
  const id = useId();

  return (
    <div className={cn('grid gap-2 w-full', className)}>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              id={id}
              variant="outline"
              disabled={disabled}
              className={cn(
                'w-full justify-start text-left font-normal',
                !date && 'text-muted-foreground',
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date ? (
                formatDateTime(date, {
                  dateStyle: 'long',
                  timeStyle: 'short',
                })
              ) : (
                <span>{placeholder || t('Common.pickDate')}</span>
              )}
            </Button>
          }
        />
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={date} onSelect={onSelect} />
        </PopoverContent>
      </Popover>
    </div>
  );
}
