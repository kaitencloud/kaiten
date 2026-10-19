import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  useId,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  SEGMENT_MAX,
  SEGMENT_PAGE,
  segmentNumber,
  type TimeSegment,
  type TimeSegments,
} from '@/lib/time-field-model';
import { cn } from '@/lib/utils';

// A row is 28px and seven are in view: the chosen one in the middle, three
// above and three below. The list is padded by three rows so that the first and
// the last value can reach the middle too.
const ROW = 28;
const VISIBLE_ROWS = 7;
const PADDING_ROWS = (VISIBLE_ROWS - 1) / 2;

type TimeColumnsProps = {
  segments: TimeSegments;
  /** Called with the value a click or a key chose: the field takes it at once. */
  onPick: (segment: TimeSegment, value: number) => void;
  /** Called with a number of steps, from a chevron or an arrow key. */
  onStep: (segment: TimeSegment, delta: number) => void;
  /** Called when the person is done: Enter on a column. */
  onDone: () => void;
};

/**
 * The two scrollable columns of the time popup: the hours from 00 to 23, a
 * colon, the minutes from 00 to 59. Each is a listbox whose chosen value is
 * centred and filled with the primary colour, with a chevron above and one
 * below that move it by one. Choosing moves the selection with the focus: an
 * arrow key, a click or a chevron changes the time of the field at once. Up and
 * Down move to the value above and below (earlier and later), Left and Right
 * to the other column, Enter closes the popup.
 */
export function TimeColumns({
  segments,
  onPick,
  onStep,
  onDone,
}: TimeColumnsProps) {
  return (
    <div className="flex items-center gap-1" data-slot="time-columns">
      <TimeColumn
        onDone={onDone}
        onPick={onPick}
        onStep={onStep}
        segment="hours"
        value={segmentNumber(segments, 'hours')}
      />
      <span aria-hidden="true" className="text-muted-foreground text-sm">
        :
      </span>
      <TimeColumn
        onDone={onDone}
        onPick={onPick}
        onStep={onStep}
        segment="minutes"
        value={segmentNumber(segments, 'minutes')}
      />
    </div>
  );
}

type TimeColumnProps = {
  segment: TimeSegment;
  value: number | null;
  onPick: (segment: TimeSegment, value: number) => void;
  onStep: (segment: TimeSegment, delta: number) => void;
  onDone: () => void;
};

const COLUMN_LABELS = {
  hours: {
    name: 'Common.datePicker.hours',
    previous: 'Common.datePicker.previousHour',
    next: 'Common.datePicker.nextHour',
  },
  minutes: {
    name: 'Common.datePicker.minutes',
    previous: 'Common.datePicker.previousMinute',
    next: 'Common.datePicker.nextMinute',
  },
} as const;

function TimeColumn({
  segment,
  value,
  onPick,
  onStep,
  onDone,
}: TimeColumnProps) {
  const { t } = useTranslation();
  const labels = COLUMN_LABELS[segment];
  const id = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const placed = useRef(false);
  const max = SEGMENT_MAX[segment];

  // Centres the chosen value: it jumps there as the popup opens, and glides
  // from one value to the next after that (unless the person asked for less
  // motion, which the CSS `scroll-behavior` of the list honours).
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }
    if (!placed.current) {
      list.style.scrollBehavior = 'auto';
    }
    list.scrollTop = (value ?? 0) * ROW;
    list.style.scrollBehavior = '';
    placed.current = true;
  }, [value]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const action = readColumnKey(event.key, segment);
    if (!action) {
      return;
    }
    event.preventDefault();
    if (action === 'done') {
      onDone();
    } else if (action === 'other') {
      focusOtherColumn(event.currentTarget, segment);
    } else if ('step' in action) {
      onStep(segment, action.step);
    } else {
      onPick(segment, action.pick);
    }
  };

  const pick = (number: number) => onPick(segment, number);

  // Keeps the focus where it is (the list) when a pointer lands on a value or a
  // chevron, which are no stops of their own.
  const keepFocus = (event: MouseEvent) => event.preventDefault();

  const renderOption = (number: number) => (
    <ColumnOption
      id={`${id}-${number}`}
      key={number}
      number={number}
      onMouseDown={keepFocus}
      onPick={pick}
      selected={number === value}
    />
  );

  return (
    <div className="flex flex-col items-center gap-1">
      <ChevronButton
        label={t(labels.previous)}
        onClick={() => onStep(segment, -1)}
        onMouseDown={keepFocus}
      >
        <ChevronUp aria-hidden="true" className="size-4" />
      </ChevronButton>
      <div
        aria-activedescendant={value === null ? undefined : `${id}-${value}`}
        aria-label={t(labels.name)}
        className={cn(
          'ring-1 ring-transparent focus:ring-2 focus:ring-primary w-11 overflow-y-auto rounded-md outline-none',
          'motion-safe:scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
        data-column={segment}
        onKeyDown={handleKeyDown}
        ref={listRef}
        role="listbox"
        style={{
          height: ROW * VISIBLE_ROWS,
          paddingBottom: ROW * PADDING_ROWS,
          paddingTop: ROW * PADDING_ROWS,
        }}
        tabIndex={0}
      >
        {Array.from({ length: max + 1 }, (_, number) => renderOption(number))}
      </div>
      <ChevronButton
        label={t(labels.next)}
        onClick={() => onStep(segment, 1)}
        onMouseDown={keepFocus}
      >
        <ChevronDown aria-hidden="true" className="size-4" />
      </ChevronButton>
    </div>
  );
}

function focusOtherColumn(column: HTMLElement, segment: TimeSegment) {
  const other = segment === 'hours' ? 'minutes' : 'hours';

  column
    .closest('[data-slot="time-columns"]')
    ?.querySelector<HTMLElement>(`[data-column="${other}"]`)
    ?.focus();
}

type ColumnKey =
  | 'done'
  | 'other'
  | { step: number }
  | { pick: number }
  | undefined;

// What a key does in a column. Up and Down go to the value above and below,
// which is the earlier and the later one: the reverse of the spinbutton of the
// field, where Up raises the value.
function readColumnKey(key: string, segment: TimeSegment): ColumnKey {
  switch (key) {
    case 'ArrowUp':
      return { step: -1 };
    case 'ArrowDown':
      return { step: 1 };
    case 'PageUp':
      return { step: -SEGMENT_PAGE[segment] };
    case 'PageDown':
      return { step: SEGMENT_PAGE[segment] };
    case 'Home':
      return { pick: 0 };
    case 'End':
      return { pick: SEGMENT_MAX[segment] };
    case 'ArrowLeft':
    case 'ArrowRight':
      return 'other';
    case 'Enter':
      return 'done';
    default:
      return undefined;
  }
}

function ChevronButton({
  label,
  onClick,
  onMouseDown,
  children,
}: {
  label: string;
  onClick: () => void;
  onMouseDown: (event: MouseEvent) => void;
  children: ReactNode;
}) {
  return (
    <Button
      aria-label={label}
      className="text-muted-foreground h-5 w-full"
      onClick={onClick}
      onMouseDown={onMouseDown}
      size="icon-xs"
      tabIndex={-1}
      type="button"
      variant="ghost"
    >
      {children}
    </Button>
  );
}

function ColumnOption({
  id,
  number,
  selected,
  onPick,
  onMouseDown,
}: {
  id: string;
  number: number;
  selected: boolean;
  onPick: (value: number) => void;
  onMouseDown: (event: MouseEvent) => void;
}) {
  return (
    <div
      aria-selected={selected}
      className={cn(
        'mx-auto flex w-9 cursor-pointer items-center justify-center rounded-md text-sm tabular-nums',
        selected
          ? 'bg-primary text-primary-foreground font-medium'
          : 'hover:bg-accent hover:text-foreground',
      )}
      id={id}
      onClick={() => onPick(number)}
      onMouseDown={onMouseDown}
      role="option"
      style={{ height: ROW }}
    >
      {String(number).padStart(2, '0')}
    </div>
  );
}
