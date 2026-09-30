import { LoaderCircle, Pencil } from 'lucide-react';
import { type KeyboardEvent, useCallback, useState } from 'react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

type EditableTitleProps = {
  /** Current persisted value. */
  value: string;
  /** Persists the new value. Should throw on failure. */
  onSave: (value: string) => Promise<void>;
  /** Accessible label for the edit affordance (e.g. "Edit name"). */
  label: string;
  /** Minimum trimmed length required to persist. Defaults to 1. */
  minLength?: number;
  /** Disables editing entirely (kept read-only). */
  disabled?: boolean;
  className?: string;
  /** Typography applied to both the read-only label and the input. */
  textClassName?: string;
};

const DEFAULT_TEXT_CLASS = 'text-3xl font-bold tracking-tight';

/**
 * In-place editable page title. Renders the value as a button that, on click,
 * swaps to a borderless input matching the heading typography. Saves on Enter
 * or blur, cancels on Escape. Intended to be dropped into a `Page.Title` /
 * `Page.IconHeading` title slot so it inherits the surrounding header layout.
 */
export const EditableTitle = ({
  value,
  onSave,
  label,
  minLength = 1,
  disabled = false,
  className,
  textClassName = DEFAULT_TEXT_CLASS,
}: EditableTitleProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState('');

  // Focus and select the input the moment it mounts (i.e. when editing starts).
  // A stable ref callback runs during commit — before paint — so there is no
  // unfocused frame, and it only fires on mount/unmount, not on every keystroke.
  const focusInputOnMount = useCallback((input: HTMLInputElement | null) => {
    input?.focus();
    input?.select();
  }, []);

  const startEdit = () => {
    if (disabled) {
      return;
    }
    setDraft(value);
    setIsEditing(true);
  };

  const cancel = () => {
    setDraft(value);
    setIsEditing(false);
  };

  const commit = async () => {
    if (isSaving) {
      return;
    }

    const trimmed = draft.trim();

    // No change, empty, or below the minimum: leave the value untouched.
    if (
      trimmed === value.trim() ||
      trimmed.length === 0 ||
      trimmed.length < minLength
    ) {
      cancel();
      return;
    }

    try {
      setIsSaving(true);
      await onSave(trimmed);
      setIsEditing(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
      cancel();
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  };

  if (isEditing) {
    return (
      <span
        className={cn(
          '-mx-2 inline-flex max-w-full items-center gap-2 rounded-md bg-foreground/10 px-2 py-0.5 ring-1 ring-border',
          className,
        )}
      >
        <input
          ref={focusInputOnMount}
          aria-label={label}
          value={draft}
          size={Math.max(draft.length, 1)}
          disabled={isSaving}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onBlur={() => {
            void commit();
          }}
          onKeyDown={handleKeyDown}
          className={cn(
            'min-w-0 border-0 bg-transparent p-0 text-foreground outline-none focus:outline-none focus:ring-0',
            textClassName,
          )}
        />
        {isSaving && (
          <LoaderCircle
            className="size-4 shrink-0 animate-spin text-muted-foreground"
            aria-hidden
          />
        )}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      disabled={disabled}
      aria-label={label}
      title={disabled ? undefined : label}
      className={cn(
        'group/editable-title -mx-2 inline-flex items-center gap-2 rounded-md px-2 py-0.5 text-left transition-colors hover:bg-foreground/10 disabled:pointer-events-none',
        textClassName,
        className,
      )}
    >
      <span>{value}</span>
      {!disabled && (
        <Pencil
          // Faint at rest, so the title reads as editable before anyone hovers
          // it; full on hover and keyboard focus.
          className="size-4 shrink-0 text-muted-foreground opacity-40 transition-opacity group-hover/editable-title:opacity-100 group-focus-visible/editable-title:opacity-100"
          aria-hidden
        />
      )}
    </button>
  );
};
