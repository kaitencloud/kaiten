import { Calendar as CalendarIcon } from 'lucide-react';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  calendarDateToDateInput,
  dateInputToCalendarDate,
} from '@/lib/date-input';
import { cn } from '@/lib/utils';

/**
 * What a form passes to the control of a field (`FormControl` hands it down):
 * the id its label points at, the description and the state it is in. They land
 * on the button that opens the calendar, the one element of the picker a person
 * focuses, so the label of the field names it.
 */
export type DatePickerTriggerProps = Omit<
  ComponentProps<'button'>,
  'value' | 'onChange' | 'onBlur' | 'children' | 'type'
> & {
  /** Called once the person leaves the picker: the moment a form marks the field as touched. */
  onBlur?: () => void;
};

type DatePickerShellProps = DatePickerTriggerProps & {
  /** The value in words, for the button; nothing while no value is chosen. */
  text: string | undefined;
  /** The value as the form holds it, kept on the button (`data-value`) for tests to read. */
  value: string;
  placeholder: string;
  /** The name of the calendar once it is open. */
  dialogLabel: string;
  onClear: () => void;
  children: (controls: { close: () => void }) => ReactNode;
};

/**
 * The button and the popover every date picker of the console shares: the value
 * (or a placeholder) on the button, the calendar in the popover, and a way to
 * clear the value.
 */
export function DatePickerShell({
  text,
  value,
  placeholder,
  dialogLabel,
  onClear,
  onBlur,
  className,
  children,
  ...triggerProps
}: DatePickerShellProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      onBlur?.();
    }
  };

  const clear = () => {
    onClear();
    handleOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            data-value={value}
            {...triggerProps}
            // The popup takes the focus when it opens: a button left that way
            // is not a field the person has finished with.
            onBlur={open ? undefined : onBlur}
            className={cn(
              'w-full justify-start border text-left font-normal',
              !text && 'text-muted-foreground',
              className,
            )}
          >
            <CalendarIcon aria-hidden="true" className="size-4" />
            <span className="truncate">{text ?? placeholder}</span>
          </Button>
        }
      />
      <PopoverContent
        align="start"
        aria-label={dialogLabel}
        className="w-auto p-0"
      >
        {children({ close: () => handleOpenChange(false) })}
        {value ? (
          <div className="border-t p-2">
            <Button
              className="w-full"
              onClick={clear}
              size="sm"
              variant="ghost"
            >
              {t('Common.clear')}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

// A native control took any year; a dropdown has to end somewhere. These bounds
// are the years a console person plans billing in, and they grow to hold a
// value outside them rather than hide it.
const FIRST_MONTH = new Date(2000, 0, 1);
const LAST_MONTH = new Date(2100, 11, 1);

type UtcDayCalendarProps = {
  /** The chosen day, `2027-03-01`, or an empty text. */
  day: string;
  onDayChange: (day: string) => void;
};

// Today is the UTC day: the one every billing day of the console is counted from,
// not the one of the zone of the browser, which differs for some hours of the day.
function utcToday(): Date {
  return dateInputToCalendarDate(new Date().toISOString().slice(0, 10)) as Date;
}

/**
 * A calendar of UTC days. The console reads every billing day in UTC, so the
 * calendar marks the UTC day as today and hands back plain days (`2027-03-01`):
 * the same day is shown, and reported, in every zone of the browser.
 */
export function UtcDayCalendar({ day, onDayChange }: UtcDayCalendarProps) {
  const selected = dateInputToCalendarDate(day);
  const today = utcToday();
  const startMonth =
    selected && selected < FIRST_MONTH ? selected : FIRST_MONTH;
  const endMonth = selected && selected > LAST_MONTH ? selected : LAST_MONTH;

  return (
    <Calendar
      captionLayout="dropdown"
      defaultMonth={selected ?? today}
      endMonth={endMonth}
      mode="single"
      onSelect={(date) => onDayChange(calendarDateToDateInput(date))}
      required
      selected={selected}
      startMonth={startMonth}
      today={today}
    />
  );
}
