import { Button } from '@/components/ui/button';
import { Code2 } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type TableJsonDialogProps = {
  description?: ReactNode;
  dialogWidth?: string;
  emptyMessage?: ReactNode;
  title: ReactNode;
  triggerAriaLabel: string;
  triggerLabel?: ReactNode;
  value?: Record<string, unknown> | null;
};

export function TableJsonDialog({
  description,
  dialogWidth = 'max-w-2xl',
  emptyMessage = '-',
  title,
  triggerAriaLabel,
  triggerLabel,
  value,
}: TableJsonDialogProps) {
  if (!value || Object.keys(value).length === 0) {
    return (
      <span className="text-sm text-muted-foreground">{emptyMessage}</span>
    );
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            aria-label={triggerAriaLabel}
            variant={triggerLabel ? 'link' : 'outline'}
            size="sm"
            className={cn(
              triggerLabel
                ? 'h-auto p-0 text-foreground underline-offset-4 hover:text-primary-subtle-foreground hover:underline'
                : 'h-7 gap-1.5',
            )}
            onClick={(event) => event.stopPropagation()}
          >
            {triggerLabel ?? <Code2 className="size-3" />}
          </Button>
        }
      />
      <DialogContent
        className={dialogWidth}
        onClick={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogBody>
          <pre className="whitespace-pre-wrap break-all rounded-lg bg-muted p-4 text-xs">
            {JSON.stringify(value, null, 2)}
          </pre>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
