import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';

type SlugFilterInputProps = {
  label: string;
  /** Applies the filter: what was typed, or nothing when it was emptied. */
  onCommit: (value: string | undefined) => void;
  placeholder?: string;
  value: string | undefined;
};

/**
 * The slug of a customer or an instance to list the invoices of. The list is not
 * asked for each key typed: the filter is applied when the field is left or Enter
 * is pressed. The field follows the filter when it changes under it, a chip taking
 * it off or a link bringing it.
 */
export function SlugFilterInput({
  label,
  onCommit,
  placeholder,
  value,
}: SlugFilterInputProps) {
  const id = useId();
  const [draft, setDraft] = useState(value ?? '');
  const [seen, setSeen] = useState(value);

  // The filter changed elsewhere: show it, rather than what was typed before.
  if (value !== seen) {
    setSeen(value);
    setDraft(value ?? '');
  }

  const commit = () => {
    const next = draft.trim();

    if (next !== (value ?? '')) {
      onCommit(next === '' ? undefined : next);
    }
  };

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground" htmlFor={id}>
        {label}
      </label>
      <Input
        autoComplete="off"
        className="font-mono text-sm"
        id={id}
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          // Enter that confirms a composition (an IME) is not a request to filter.
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            commit();
          }
        }}
        placeholder={placeholder}
        spellCheck={false}
        value={draft}
      />
    </div>
  );
}
