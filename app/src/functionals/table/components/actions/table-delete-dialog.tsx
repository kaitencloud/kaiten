import { Trash } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DeleteConfirmationDialog } from '@/components/dialog';
import { TableActionButton } from './table-action-button';

type TableDeleteDialogProps = {
  name: string;
  onConfirm: () => void;
  // Overrides the generic "delete X?" copy — for deletes with consequences
  // beyond the row itself (e.g. cascading to related data), so the default
  // stays a plain confirmation for every other entity that uses this table
  // action.
  title?: string;
  description?: ReactNode;
  confirmDisabled?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const TableDeleteDialog = ({
  name,
  onConfirm,
  title,
  description,
  confirmDisabled,
  onOpenChange,
}: TableDeleteDialogProps) => {
  const { t } = useTranslation();
  return (
    <DeleteConfirmationDialog
      trigger={
        <TableActionButton
          tooltip={t('Common.delete')}
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <Trash size={16} />
        </TableActionButton>
      }
      title={title ?? t('Common.confirmDeleteTitle')}
      description={
        description ?? t('Common.confirmDeleteDescription', { name })
      }
      cancelLabel={t('Common.cancel')}
      confirmLabel={t('Common.confirm')}
      confirmDisabled={confirmDisabled}
      onConfirm={onConfirm}
      onOpenChange={onOpenChange}
    />
  );
};
