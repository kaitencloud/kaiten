import {
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { readSegmentKey } from '@/components/time-field-segment';
import {
  clearSegment,
  joinTimeText,
  setSegment,
  stepSegment,
  typeDigit,
  type TimeSegment,
  type TimeSegments,
} from '@/lib/time-field-model';

type TimeFieldKeysOptions = {
  segments: TimeSegments;
  onChange: (value: string) => void;
  /** Called on Enter, which ends the time and not the form. */
  onSettle: (() => void) | undefined;
  /** Called on Alt+Down: the columns open on that segment. */
  onOpenColumns: (segment: TimeSegment) => void;
  inputs: Record<TimeSegment, RefObject<HTMLInputElement | null>>;
};

/**
 * What the keyboard does in the segments of a `TimeField`: the arrow, page and
 * edge keys, the digits and their pairing, Backspace, the colon, Enter and
 * Alt+Down, and what a soft keyboard sends instead of keys. The component owns
 * the markup; this owns the entry in progress (the first digit of a pair, while
 * the second is awaited) and what each key makes of the text.
 */
export function useTimeFieldKeys({
  segments,
  onChange,
  onSettle,
  onOpenColumns,
  inputs,
}: TimeFieldKeysOptions) {
  // The first digit of a two-digit entry, while the second is awaited.
  const pending = useRef<{ segment: TimeSegment; digit: string } | null>(null);

  const commit = (next: TimeSegments) => {
    pending.current = null;
    onChange(joinTimeText(next));
  };

  const typeInto = (segment: TimeSegment, digit: string) => {
    const awaiting =
      pending.current?.segment === segment ? pending.current.digit : null;
    const result = typeDigit(segments, segment, digit, awaiting);

    if (result.ignored) {
      return;
    }
    onChange(joinTimeText(result.segments));
    pending.current = result.pending
      ? { segment, digit: result.pending }
      : null;
    if (result.done && segment === 'hours') {
      inputs.minutes.current?.focus();
    }
  };

  const onKeyDown = (
    segment: TimeSegment,
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.altKey && event.key === 'ArrowDown') {
      event.preventDefault();
      onOpenColumns(segment);

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
    if (action) {
      // Enter ends the time, not the form it sits in.
      event.preventDefault();
    } else if (event.key.length === 1) {
      // A letter or a sign: the segments hold digits only.
      event.preventDefault();

      return;
    }
    if (action === 'settle') {
      onSettle?.();
    } else if (action === 'other') {
      inputs[segment === 'hours' ? 'minutes' : 'hours'].current?.focus();
    } else if (action === 'clear') {
      commit(clearSegment(segments, segment));
    } else if (action && 'step' in action) {
      commit(stepSegment(segments, segment, action.step));
    } else if (action) {
      commit(setSegment(segments, segment, action.set));
    }
  };

  // What a soft keyboard sends, which has no key to read: the character it
  // added, or a shorter text for a deletion. A text longer by more than one
  // character (a paste) is not a digit typed, and is dropped.
  const onInput = (
    segment: TimeSegment,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const text = event.target.value;
    const shown = segments[segment];
    const digit = text.at(-1) ?? '';
    if (text === '' || text.length < shown.length) {
      commit(clearSegment(segments, segment));
    } else if (text.length - shown.length === 1 && /^\d$/.test(digit)) {
      typeInto(segment, digit);
    }
  };

  const reset = () => {
    pending.current = null;
  };

  return { commit, onKeyDown, onInput, reset };
}
