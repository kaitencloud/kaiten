import { Button } from '@/components/ui/button';
import type { RowData } from '@tanstack/react-table';
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
import type { ColumnDef } from '../../types/data-table.types';
import { DataTable } from './data-table';

type TableLinkedItemsDialogProps<TData extends RowData> = {
  columns: ColumnDef<TData>[];
  data: TData[];
  description?: ReactNode;
  dialogWidth?: string;
  emptyMessage?: string;
  title: ReactNode;
  triggerLabel: ReactNode;
};

export function TableLinkedItemsDialog<TData extends RowData>({
  columns,
  data,
  description,
  dialogWidth = 'max-w-3xl',
  emptyMessage,
  title,
  triggerLabel,
}: TableLinkedItemsDialogProps<TData>) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="link"
          className="h-auto p-0 text-foreground underline-offset-4 hover:text-primary-subtle-foreground hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn(dialogWidth, 'sm:max-w-2xl')}
        onClick={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogBody className="p-0">
          <DataTable
            columns={columns}
            data={data}
            variant="simple"
            pagination={false}
            emptyMessage={emptyMessage}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
