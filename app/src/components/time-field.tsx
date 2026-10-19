import { Clock } from 'lucide-react';
import {
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { TimeColumns } from '@/components/time-field-columns';
import { SegmentInput, readSegmentKey } from '@/components/time-field-segment';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useFocusLeave } from '@/hooks/use-focus-leave';
import {
  clearSegment,
  isOutOfRange,
  joinTimeText,
  setSegment,
  splitTimeText,
  stepSegment,
  typeDigit,
  type TimeSegment,
  type TimeSegments,
} from '@/lib/time-field-model';
import { cn } from '@/lib/utils';

type TimeFieldProps = {
  /**
   * The time, `09:30`; `09:--` while the minutes are empty, `--:30` while the
   * hours are, and an empty text while both are. Whatever a form hands in is
   * shown as it is: a segment that is out of range (`25`) is marked invalid, not
   * corrected.
   */
  value: string;
  /** Called with the text of the time each time a segment changes. */
  onChange: (value: string) => void;
  /**
   * Called when the person is done with the field: it is left (the popup of
   * columns it opens is part of it), or they press Enter. The moment to make
   * something of a time that is half filled.
   */
  onSettle?: () => void;
  /** The group is named by one of the two, as no label can point at it. */
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  /** Marks both segments invalid, for a time the caller refuses. */
  'aria-invalid'?: boolean;
  disabled?: boolean;
  className?: string;
  /** Receives the element of the popup of columns, for a control that has to tell whether the focus is in it. */
  popupRef?: RefObject<HTMLDivElement | null>;
};

/**
 * A time of day on the 24-hour clock, whatever the locale of the browser:
 * `HH : mm` as two segments, and a clock button that opens two columns to pick
 * from. It looks like the other inputs of the console and works like the time
 * input of a browser, which it replaces so that the keyboard, the language and
 * the popup are the same everywhere.
 *
 * Each segment is a spin button. Up and Down step it and wrap (23 goes to 00,
 * with no carry into the other segment), Page Up and Page Down step by six
 * hours or ten minutes, Home and End go to 00 and to the last value. Digits fill
 * a segment and move on when no other digit could follow (`1` waits, `16` and
 * `3` move on), Backspace empties it, `:` and Right go to the minutes, Left
 * back to the hours, and Alt+Down or the clock opens the columns. A segment
 * that is empty is `--`.
 */
export function TimeField({
  value,
  onChange,
  onSettle,
  disabled,
  className,
  popupRef: popupRefProp,
  'aria-invalid': invalid,
  ...aria
}: TimeFieldProps) {
  const { t } = useTranslation();
  const segments = splitTimeText(value);
  const groupRef = useRef<HTMLDivElement>(null);
  const ownPopupRef = useRef<HTMLDivElement>(null);
  const popupRef = popupRefProp ?? ownPopupRef;
  const hoursRef = useRef<HTMLInputElement>(null);
  const minutesRef = useRef<HTMLInputElement>(null);
  const inputs = { hours: hoursRef, minutes: minutesRef };
  // The segment the person was on last: where the focus returns from the
  // columns, and the column the columns open on.
  const lastSegment = useRef<TimeSegment>('hours');
  // The first digit of a two-digit entry, while the second is awaited.
  const pending = useRef<{ segment: TimeSegment; digit: string } | null>(null);
  const [open, setOpen] = useState(false);

  const focus = useFocusLeave({
    containers: () => [groupRef.current, popupRef.current],
    onLeave: () => onSettle?.(),
  });

  const commit = (next: TimeSegments) => {
    pending.current = null;
    onChange(joinTimeText(next));
  };

  const typeInto = (segment: TimeSegment, digit: string) => {
    const awaiting =
      pending.current?.segment === segment ? pending.current.digit : null;
    const result = typeDigit(segments, segment, digit, awaiting);

    onChange(joinTimeText(result.segments));
    pending.current = result.pending
      ? { segment, digit: result.pending }
      : null;
    if (result.done && segment === 'hours') {
      minutesRef.current?.focus();
    }
  };

  const openColumns = (segment: TimeSegment) => {
    lastSegment.current = segment;
    setOpen(true);
  };

  const handleKeyDown = (
    segment: TimeSegment,
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.altKey && event.key === 'ArrowDown') {
      event.preventDefault();
      openColumns(segment);

      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      typeInto(segment, event.key);

      return;
    }
    const action = readSegmentKey(event.key, segment);
    if (action === 'settle') {
      // Not prevented: Enter still sends the form it is in, with what it holds.
      onSettle?.();
    } else if (action) {
      event.preventDefault();
      if (action === 'other') {
        inputs[segment === 'hours' ? 'minutes' : 'hours'].current?.focus();
      } else if (action === 'clear') {
        commit(clearSegment(segments, segment));
      } else if ('step' in action) {
        commit(stepSegment(segments, segment, action.step));
      } else {
        commit(setSegment(segments, segment, action.set));
      }
    } else if (event.key.length === 1) {
      // A letter or a sign: the segments hold digits only.
      event.preventDefault();
    }
  };

  // What a soft keyboard sends, which has no key to read: the character it
  // added, or a shorter text for a deletion.
  const handleInput = (
    segment: TimeSegment,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const text = event.target.value;
    const digit = text.at(-1) ?? '';
    if (text.length < segments[segment].length || text === '') {
      commit(clearSegment(segments, segment));
    } else if (/^\d$/.test(digit)) {
      typeInto(segment, digit);
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      focus.check();
    }
  };

  const pick = (segment: TimeSegment, number: number) => {
    lastSegment.current = segment;
    commit(setSegment(segments, segment, number));
  };

  const step = (segment: TimeSegment, delta: number) => {
    lastSegment.current = segment;
    commit(stepSegment(segments, segment, delta));
  };

  const close = () => handleOpenChange(false);

  const renderSegment = (segment: TimeSegment) => (
    <SegmentInput
      disabled={disabled}
      inputRef={inputs[segment]}
      invalid={invalid || isOutOfRange(segments, segment)}
      key={segment}
      onFocus={() => {
        lastSegment.current = segment;
      }}
      onBlur={() => {
        pending.current = null;
      }}
      onInput={(event) => handleInput(segment, event)}
      onKeyDown={(event) => handleKeyDown(segment, event)}
      segment={segment}
      segments={segments}
    />
  );

  return (
    <div
      {...aria}
      aria-disabled={disabled || undefined}
      className={cn(
        'border-input bg-background dark:bg-input/30 flex h-9 w-28 items-center gap-1 rounded-md border pr-1 pl-3 text-sm shadow-xs transition-[color,box-shadow]',
        'focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
        open && 'border-ring ring-ring/50 ring-[3px]',
        invalid &&
          'border-destructive ring-destructive/20 dark:ring-destructive/40',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
      data-slot="time-field"
      onBlur={focus.onBlur}
      onFocus={focus.onFocus}
      ref={groupRef}
      role="group"
    >
      {renderSegment('hours')}
      <span aria-hidden="true" className="text-muted-foreground">
        :
      </span>
      {renderSegment('minutes')}
      <Popover onOpenChange={handleOpenChange} open={open}>
        <PopoverTrigger
          render={
            <Button
              aria-label={t('Common.datePicker.chooseTime')}
              className="text-muted-foreground ml-auto"
              disabled={disabled}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <Clock aria-hidden="true" />
            </Button>
          }
        />
        <PopoverContent
          align="start"
          anchor={groupRef}
          aria-label={t('Common.datePicker.chooseTime')}
          className="w-auto p-2"
          finalFocus={() => inputs[lastSegment.current].current ?? true}
          initialFocus={() =>
            popupRef.current?.querySelector<HTMLElement>(
              `[data-column="${lastSegment.current}"]`,
            ) ?? true
          }
          ref={popupRef}
        >
          <TimeColumns
            onDone={close}
            onPick={pick}
            onStep={step}
            segments={segments}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
