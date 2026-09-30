import { Button } from '@/components/ui/button';
import { Trash } from 'lucide-react';
import type { ReactNode } from 'react';
import { DeleteConfirmationDialog } from '@/components/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type DestructiveActionButtonProps = {
  label: ReactNode;
  title: string;
  description: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  /** Why the action is blocked, shown on hover and focus while disabled. */
  disabledReason?: string;
  className?: string;
};

export function DestructiveActionButton({
  label,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onConfirm,
  disabled = false,
  disabledReason,
  className,
}: DestructiveActionButtonProps) {
  const button = (
    <Button
      variant="destructive"
      size="sm"
      className={className ?? 'gap-2'}
      disabled={disabled}
    >
      <Trash className="size-4" />
      {label}
    </Button>
  );

  // A disabled button swallows pointer events, so a focusable wrapper carries
  // the tooltip that says why the action is blocked, as the tables' delete
  // action does. There is no confirmation to open in that state.
  if (disabled && disabledReason) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex">
              {button}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-64 whitespace-pre-line">
            {disabledReason}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <DeleteConfirmationDialog
      trigger={button}
      title={title}
      description={description}
      cancelLabel={cancelLabel}
      confirmLabel={confirmLabel}
      onConfirm={onConfirm}
    />
  );
}
