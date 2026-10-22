import { Clock } from 'lucide-react';
import { useRef, useState, type MouseEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { TimeColumns } from '@/components/time-field-columns';
import { SegmentInput } from '@/components/time-field-segment';
import { InputGroup, InputGroupButton } from '@/components/ui/input-group';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useTimeFieldKeys } from '@/components/use-time-field-keys';
import { useFocusLeave } from '@/hooks/use-focus-leave';
import {
  isOutOfRange,
  setSegment,
  splitTimeText,
  stepSegment,
  type TimeSegment,
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
   * columns it opens is part of it), or they press Enter, which ends the time
   * and does not send the form it sits in. The moment to make something of a
   * time that is half filled.
   */
  onSettle?: () => void;
  /** The group is named by one of the two, as no label can point at it. */
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  /**
   * For a time the caller refuses. The segments that are empty or out of range
   * are the ones marked invalid; when none is, the time is refused as a whole
   * and both are.
   */
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
 * `3` move on); a pair that is out of range, the `24` of `2` then `4`, is kept
 * as it was typed and marked invalid, never replaced by another time, and the
 * same goes for `60` in the minutes. Hours typed into a time with no minutes
 * give it `00` minutes. Backspace empties it, `:` and Right go to the minutes, Left back to the hours,
 * Enter ends the time (and not the form), and Alt+Down or the clock opens the
 * columns. A segment that is empty is `--`. `onChange` is called at each edit,
 * as the time input of a browser fires `input` at each digit: after the `1` of
 * `16` the time is `01:30`, then `16:30`.
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
  const colonRef = useRef<HTMLSpanElement>(null);
  const ownPopupRef = useRef<HTMLDivElement>(null);
  const popupRef = popupRefProp ?? ownPopupRef;
  const hoursRef = useRef<HTMLInputElement>(null);
  const minutesRef = useRef<HTMLInputElement>(null);
  const inputs = { hours: hoursRef, minutes: minutesRef };
  // The segment the person was on last: where the focus returns from the
  // columns, and the column the columns open on.
  const lastSegment = useRef<TimeSegment>('hours');
  const [open, setOpen] = useState(false);

  const focus = useFocusLeave({
    containers: () => [groupRef.current, popupRef.current],
    onLeave: () => onSettle?.(),
  });

  const openColumns = (segment: TimeSegment) => {
    lastSegment.current = segment;
    setOpen(true);
  };

  const keys = useTimeFieldKeys({
    inputs,
    onChange,
    onOpenColumns: openColumns,
    onSettle,
    segments,
  });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      focus.check();
    }
  };

  const pick = (segment: TimeSegment, number: number) => {
    lastSegment.current = segment;
    keys.commit(setSegment(segments, segment, number));
  };

  const step = (segment: TimeSegment, delta: number) => {
    lastSegment.current = segment;
    keys.commit(stepSegment(segments, segment, delta));
  };

  const close = () => handleOpenChange(false);

  // The box is the field, not only its two segments: a press on the padding or
  // between the parts lands on the segment nearest to it, as on any input. A
  // press in the popup of columns bubbles here through React, and is not ours.
  const focusNearest = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as Node;
    if (
      !event.currentTarget.contains(target) ||
      (target as Element).closest?.('input, button')
    ) {
      return;
    }
    event.preventDefault();
    const colon = colonRef.current?.getBoundingClientRect();
    const before = colon ? event.clientX < colon.left + colon.width / 2 : true;
    inputs[before ? 'hours' : 'minutes'].current?.focus();
  };

  // Empty or out of range: the segments to blame for a time that is refused.
  const broken = (segment: TimeSegment) =>
    segments[segment] === '' || isOutOfRange(segments, segment);
  const blameAll = !broken('hours') && !broken('minutes');
  const segmentInvalid = (segment: TimeSegment) =>
    isOutOfRange(segments, segment) ||
    Boolean(invalid && (blameAll || broken(segment)));

  const renderSegment = (segment: TimeSegment) => (
    <SegmentInput
      disabled={disabled}
      inputRef={inputs[segment]}
      invalid={segmentInvalid(segment)}
      key={segment}
      onFocus={() => {
        lastSegment.current = segment;
      }}
      onBlur={keys.reset}
      onInput={(event) => keys.onInput(segment, event)}
      onKeyDown={(event) => keys.onKeyDown(segment, event)}
      segment={segment}
      segments={segments}
    />
  );

  return (
    <InputGroup
      {...aria}
      aria-disabled={disabled || undefined}
      className={cn(
        'bg-background w-28 gap-1 pr-1 pl-3',
        open && 'border-ring ring-ring/50 ring-3',
        invalid && 'border-destructive ring-destructive/20 ring-3',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
      data-slot="time-field"
      onBlur={focus.onBlur}
      onFocus={focus.onFocus}
      onMouseDown={focusNearest}
      ref={groupRef}
    >
      {renderSegment('hours')}
      <span aria-hidden="true" className="text-muted-foreground" ref={colonRef}>
        :
      </span>
      {renderSegment('minutes')}
      <Popover onOpenChange={handleOpenChange} open={open}>
        <PopoverTrigger
          render={
            <InputGroupButton
              aria-label={t('Common.datePicker.chooseTime')}
              className="text-muted-foreground ml-auto"
              disabled={disabled}
              size="icon-xs"
            >
              <Clock aria-hidden="true" />
            </InputGroupButton>
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
    </InputGroup>
  );
}
