import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type CopyValueButtonProps = {
  /** Extra classes of the button. */
  className?: string;
  /** Text of the toast shown when the value is on the clipboard. */
  copiedMessage: string;
  /** Text of the toast shown when the browser refuses to write to the clipboard. */
  copyFailedMessage: string;
  /** Accessible name of the button. */
  label: string;
  /**
   * Called when the value has left through the clipboard, and not when the browser
   * refused it.
   */
  onCopied?: () => void;
  /** Test id of the button. */
  testId?: string;
  /** The value to put on the clipboard. */
  value: string;
};

/**
 * An icon button that puts a value on the clipboard and says so with a toast; a clipboard
 * that refuses is told with a toast instead of failing silently. The value stays in the
 * props of this component, which puts it nowhere else. The words are the caller's, so that
 * this file holds none.
 */
export function CopyValueButton({
  className,
  copiedMessage,
  copyFailedMessage,
  label,
  onCopied,
  testId,
  value,
}: CopyValueButtonProps) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      toast.error(copyFailedMessage);
      return;
    }
    toast.success(copiedMessage);
    onCopied?.();
  }

  return (
    <Button
      aria-label={label}
      className={cn('shrink-0', className)}
      data-testid={testId}
      onClick={() => void copy()}
      size="icon"
      type="button"
      variant="outline"
    >
      <Copy className="size-4" />
    </Button>
  );
}
