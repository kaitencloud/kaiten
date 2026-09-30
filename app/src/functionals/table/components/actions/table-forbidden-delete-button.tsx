import { Trash } from 'lucide-react';
import { TableActionButton } from './table-action-button';

type TableForbiddenDeleteButtonProps = {
  message: string;
};

export const TableForbiddenDeleteButton = ({
  message,
}: TableForbiddenDeleteButtonProps) => (
  <TableActionButton
    tooltip={message}
    disabled
    onClick={(e) => {
      e.stopPropagation();
    }}
  >
    <Trash size={16} />
  </TableActionButton>
);
