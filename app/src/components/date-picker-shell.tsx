import { Calendar as CalendarIcon } from 'lucide-react';
import {
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
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
  /**
   * The value as the form holds it, kept on the button (`data-value`). That
   * attribute is the contract the unit, story and E2E helpers share
   * (`date-picker-test-support.ts`) to read a picker, as the text is localized:
   * leave it be.
   */
  value: string;
  placeholder: string;
  /** The name of the calendar once it is open. */
  dialogLabel: string;
  onClear: () => void;
  /** Called as the popover closes, before the field is reported as left: the moment to settle what is half typed in it. */
  onClose?: () => void;
  children: (controls: { close: () => void }) => ReactNode;
};

/**
 * The button and the popover every date picker of the console shares: the value
 * (or a placeholder) on the button, the calendar in the popover, and a way to
 * clear the value. The value is the description of the button, read after the
 * name the label gives it, since a button announces its name and not its text.
 */
export function DatePickerShell({
  text,
  value,
  placeholder,
  dialogLabel,
  onClear,
  onClose,
  onBlur,
  className,
  children,
  'aria-describedby': describedBy,
  ...triggerProps
}: DatePickerShellProps) {
  const { t } = useTranslation();
  const textId = useId();
  const popupRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      onClose?.();
      onBlur?.();
    }
  };

  // Not `onClose`: what was half typed has no say once the value is cleared.
  const clear = () => {
    onClear();
    setOpen(false);
    onBlur?.();
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            data-value={value}
            {...triggerProps}
            aria-describedby={
              [describedBy, textId].filter(Boolean).join(' ') || undefined
            }
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
            <span className="truncate" id={textId}>
              {text ?? placeholder}
            </span>
          </Button>
        }
      />
      <PopoverContent
        align="start"
        aria-label={dialogLabel}
        className="w-auto p-0"
        // Keyboard focus starts on a day of the calendar (the chosen one, else
        // today) and not on the first button of the header, so the arrow keys
        // work at once.
        initialFocus={() =>
          popupRef.current?.querySelector<HTMLElement>(
            'button[data-day][tabindex="0"]',
          ) ?? true
        }
        ref={popupRef}
      >
        {children({ close: () => handleOpenChange(false) })}
        {/* Always there, so the popover keeps its height when a day is picked
            and the controls above do not move under the pointer. */}
        <div className="border-t p-2">
          <Button
            className="w-full"
            disabled={!value}
            onClick={clear}
            size="sm"
            variant="ghost"
          >
            {t('Common.clear')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// A native control took any year; a dropdown has to end somewhere. These bounds
// are the years a date is planned in, and they grow to hold a value outside
// them rather than hide it.
const FIRST_MONTH = new Date(2000, 0, 1);
const LAST_MONTH = new Date(2100, 11, 1);

type UtcDayCalendarProps = {
  /** The chosen day, `2027-03-01`, or an empty text. */
  day: string;
  onDayChange: (day: string) => void;
};

// Today is the UTC day: a day of the console is a UTC day, not a day of the zone
// of the browser, which differs from it for some hours of the day.
function utcToday(): Date {
  return dateInputToCalendarDate(new Date().toISOString().slice(0, 10)) as Date;
}

/**
 * A calendar of UTC days. The console reads its days in UTC, so the calendar
 * marks the UTC day as today and hands back plain days (`2027-03-01`): the same
 * day is shown, and reported, in every zone of the browser.
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
