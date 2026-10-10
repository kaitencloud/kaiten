import { CopyValueButton } from '@/components/copy-value-button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type CopyableValueFieldProps = {
  /** Text of the toast shown when the value is on the clipboard. */
  copiedMessage: string;
  /** Text of the toast shown when the browser refuses to write to the clipboard. */
  copyFailedMessage: string;
  /** Accessible name of the Copy button. */
  copyLabel: string;
  /** Test id of the Copy button. */
  copyTestId?: string;
  /** Focus the field on mount, for a value that is what the person came for. */
  autoFocus?: boolean;
  /** Extra classes of the field, for the size and the tracking of the text. */
  inputClassName?: string;
  /** Test id of the field. */
  inputTestId?: string;
  /** Accessible name of the field. */
  label: string;
  /**
   * Called when the value has left through the clipboard: by the button, or by the
   * browser's own copy of the selected field.
   */
  onCopied?: () => void;
  /** The value to read and to copy. */
  value: string;
};

/**
 * A value to read and to copy, in a read-only field with a Copy button beside it: a secret
 * that is shown once, such as a key or a code. The field selects itself on focus for
 * whoever prefers to copy it by hand. The Copy button is `CopyValueButton`, which puts the
 * value on the clipboard and tells with a toast when it refuses. The value stays in the props
 * of these components, which put it nowhere else. The words are the caller's, so that this
 * file holds none.
 */
export function CopyableValueField({
  autoFocus,
  copiedMessage,
  copyFailedMessage,
  copyLabel,
  copyTestId,
  inputClassName,
  inputTestId,
  label,
  onCopied,
  value,
}: CopyableValueFieldProps) {
  return (
    <div className="flex gap-2">
      <Input
        aria-label={label}
        autoComplete="off"
        autoFocus={autoFocus}
        className={cn('bg-background font-mono', inputClassName)}
        data-testid={inputTestId}
        onCopy={onCopied}
        onFocus={(event) => event.currentTarget.select()}
        readOnly
        spellCheck={false}
        value={value}
      />
      <CopyValueButton
        copiedMessage={copiedMessage}
        copyFailedMessage={copyFailedMessage}
        label={copyLabel}
        onCopied={onCopied}
        testId={copyTestId}
        value={value}
      />
    </div>
  );
}
