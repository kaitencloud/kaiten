import type { ChangeEvent, KeyboardEvent, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SEGMENT_MAX,
  SEGMENT_PAGE,
  segmentNumber,
  type TimeSegment,
  type TimeSegments,
} from '@/lib/time-field-model';

/** What a key does in a segment, apart from the digits. */
export type SegmentAction =
  | 'settle'
  | 'other'
  | 'clear'
  | { step: number }
  | { set: number }
  | undefined;

export function readSegmentKey(
  key: string,
  segment: TimeSegment,
): SegmentAction {
  switch (key) {
    case 'ArrowUp':
      return { step: 1 };
    case 'ArrowDown':
      return { step: -1 };
    case 'PageUp':
      return { step: SEGMENT_PAGE[segment] };
    case 'PageDown':
      return { step: -SEGMENT_PAGE[segment] };
    case 'Home':
      return { set: 0 };
    case 'End':
      return { set: SEGMENT_MAX[segment] };
    case 'Backspace':
    case 'Delete':
      return 'clear';
    case ':':
    case 'ArrowRight':
      return segment === 'hours' ? 'other' : undefined;
    case 'ArrowLeft':
      return segment === 'minutes' ? 'other' : undefined;
    case 'Enter':
      return 'settle';
    default:
      return undefined;
  }
}

const SEGMENT_LABELS = {
  hours: 'Common.datePicker.hours',
  minutes: 'Common.datePicker.minutes',
} as const;

type SegmentInputProps = {
  segment: TimeSegment;
  segments: TimeSegments;
  invalid: boolean | undefined;
  disabled: boolean | undefined;
  inputRef: Ref<HTMLInputElement>;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
};

export function SegmentInput({
  segment,
  segments,
  invalid,
  disabled,
  inputRef,
  onKeyDown,
  onInput,
  onFocus,
  onBlur,
}: SegmentInputProps) {
  const { t } = useTranslation();
  const text = segments[segment];
  const number = segmentNumber(segments, segment);

  return (
    <input
      aria-invalid={invalid || undefined}
      aria-label={t(SEGMENT_LABELS[segment])}
      aria-valuemax={SEGMENT_MAX[segment]}
      aria-valuemin={0}
      aria-valuenow={number ?? undefined}
      aria-valuetext={text === '' ? t('Common.datePicker.timeEmpty') : text}
      autoComplete="off"
      className="placeholder:text-muted-foreground focus-visible:bg-primary focus-visible:text-primary-foreground focus-visible:placeholder:text-primary-foreground w-6 rounded-sm bg-transparent text-center tabular-nums caret-transparent outline-none selection:bg-transparent"
      data-segment={segment}
      disabled={disabled}
      inputMode="numeric"
      onBlur={onBlur}
      onChange={onInput}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      placeholder="--"
      ref={inputRef}
      role="spinbutton"
      type="text"
      value={text}
    />
  );
}
