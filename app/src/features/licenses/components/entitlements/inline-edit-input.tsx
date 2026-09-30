import { Input } from '@/components/ui/input';
import type { HTMLAttributes } from 'react';
import { useEffect, useRef } from 'react';

type InlineEditInputProps = {
  ariaLabel: string;
  getInitialValue: () => string;
  // True while the open editor still shows the value it started from, so a
  // fresh edit selects it and typing replaces it. Read through a getter: it
  // must not rebuild the column and remount this input mid-edit.
  getSelectsOnFocus: () => boolean;
  // "Enter to save · Esc to cancel": the cell has no Save button, so the
  // keys that settle the edit are spelled out under the field.
  hint?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode'];
  onCancel: () => void;
  onChange: (value: string) => void;
  // Resolves to false when the value was rejected and the cell stays open, so
  // the user can correct it and save again.
  onSave: (input?: string) => Promise<boolean>;
  placeholder: string;
};

export function InlineEditInput({
  ariaLabel,
  getInitialValue,
  getSelectsOnFocus,
  hint,
  inputMode,
  onCancel,
  onChange,
  onSave,
  placeholder,
}: InlineEditInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Enter and Escape settle the edit; the blur that follows must not save
  // again. A rejected value unsettles it, otherwise the corrected value could
  // never be submitted.
  const settledRef = useRef(false);

  useEffect(() => {
    const input = inputRef.current;

    if (!input) {
      return;
    }

    input.focus();

    // Idempotent on purpose: React runs mount effects twice in development.
    if (getSelectsOnFocus()) {
      input.select();
      return;
    }

    const caret = input.value.length;
    input.setSelectionRange(caret, caret);
  }, [getSelectsOnFocus]);

  const commit = async (value: string) => {
    if (settledRef.current) {
      return;
    }

    settledRef.current = true;

    if (!(await onSave(value))) {
      settledRef.current = false;
    }
  };

  return (
    <div
      className="flex flex-col items-end gap-1"
      onClick={(event) => {
        // The card sits in a row-clickable table on the detail page.
        event.stopPropagation();
      }}
    >
      <Input
        ref={inputRef}
        aria-label={ariaLabel}
        defaultValue={getInitialValue()}
        inputMode={inputMode}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
        onBlur={(event) => {
          void commit(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            // Enter and Space are what the table's row-navigation handler reads.
            event.stopPropagation();
            void commit(event.currentTarget.value);
            return;
          }

          if (event.key === ' ') {
            event.stopPropagation();
            return;
          }

          if (event.key === 'Escape') {
            event.preventDefault();
            settledRef.current = true;
            onCancel();
          }
        }}
        placeholder={placeholder}
        className="h-9 max-w-28 text-right font-mono"
      />
      {hint ? (
        <span className="text-[11px] leading-none text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
