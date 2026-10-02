import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Link } from '@tanstack/react-router';
import { flexRender, type RowData } from '@tanstack/react-table';
import type {
  KeyboardEventHandler,
  MouseEvent,
  MouseEventHandler,
  ReactNode,
  SyntheticEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { DATA_TABLE_VARIANT_CLASSES } from '../../logic/data-table-utils';
import type {
  Column,
  DataTableVariant,
  Row,
  TableInstance,
} from '../../types/data-table.types';

// Dialogs and menus opened from a cell render in a portal, outside the row in
// the DOM, but React still bubbles their events through the row.
function isEventFromRow(event: SyntheticEvent<HTMLTableRowElement>): boolean {
  return (
    event.target instanceof Node && event.currentTarget.contains(event.target)
  );
}

// A link in a cell, the row's own or one among its actions, handles its own
// clicks, modified or not: the row must not follow them a second time. So does
// a cell's actions area, marked data-row-actions, as a whole: a click on a
// disabled control there lands on its wrapper, since disabled buttons ignore
// the pointer, and must not open the row either.
function isEventFromLink(event: SyntheticEvent<HTMLTableRowElement>): boolean {
  return (
    event.target instanceof Element &&
    event.target.closest('a, [data-row-actions]') !== null
  );
}

// The modifiers with which a browser opens a link somewhere else.
function opensElsewhere(event: MouseEvent<HTMLTableRowElement>): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey;
}

function openInNewTab(path: string) {
  window.open(path, '_blank', 'noopener');
}

function getAriaSortForColumn<TData extends RowData>(
  column: Column<TData, unknown>,
): 'ascending' | 'descending' | 'none' | undefined {
  if (!column.getCanSort()) {
    return undefined;
  }

  const sorted = column.getIsSorted();
  if (sorted === 'asc') {
    return 'ascending';
  }
  if (sorted === 'desc') {
    return 'descending';
  }

  return 'none';
}

type DataTableContentProps<TData extends RowData> = {
  bodyScrollable: boolean;
  columnsLength: number;
  emptyMessage: ReactNode;
  enableRowKeyboardNavigation: boolean;
  getPath?: (row: TData) => string | undefined;
  getRowClassName?: (row: TData) => string | undefined;
  hasScrollableBody: boolean;
  isRowClickable: (row: TData) => boolean;
  linkColumnId: string;
  onClickRow?: (row: Row<TData>) => void;
  table: TableInstance<TData>;
  tableClassName?: string;
  variant: DataTableVariant;
};

export function DataTableContent<TData extends RowData>({
  bodyScrollable,
  columnsLength,
  emptyMessage,
  enableRowKeyboardNavigation,
  getPath,
  getRowClassName,
  hasScrollableBody,
  isRowClickable,
  linkColumnId,
  onClickRow,
  table,
  tableClassName,
  variant,
}: DataTableContentProps<TData>) {
  const { t } = useTranslation();
  const variantClasses = DATA_TABLE_VARIANT_CLASSES[variant];

  const getRowPath = (row: Row<TData>) =>
    isRowClickable(row.original) ? getPath?.(row.original) : undefined;

  const createRowClickHandler =
    (row: Row<TData>): MouseEventHandler<HTMLTableRowElement> =>
    (event) => {
      event.stopPropagation();

      if (!isEventFromRow(event) || isEventFromLink(event)) {
        return;
      }

      const path = getRowPath(row);

      if (path && opensElsewhere(event)) {
        openInNewTab(path);
      } else if (onClickRow && isRowClickable(row.original)) {
        onClickRow(row);
      } else if (path) {
        // Follow the row's own link: one navigation, preloaded and recorded
        // exactly like a click on it.
        event.currentTarget
          .querySelector<HTMLAnchorElement>('a[data-row-link]')
          ?.click();
      }
    };

  // The middle button opens a link in a new tab; on a row it would start
  // autoscrolling instead.
  const createRowAuxClickHandler =
    (path: string): MouseEventHandler<HTMLTableRowElement> =>
    (event) => {
      if (
        event.button === 1 &&
        isEventFromRow(event) &&
        !isEventFromLink(event)
      ) {
        event.preventDefault();
        openInNewTab(path);
      }
    };

  const handleRowMouseDown: MouseEventHandler<HTMLTableRowElement> = (
    event,
  ) => {
    if (event.button === 1 && !isEventFromLink(event)) {
      event.preventDefault();
    }
  };

  const createRowKeyDownHandler =
    (row: Row<TData>): KeyboardEventHandler<HTMLTableRowElement> =>
    (event) => {
      if (
        !onClickRow ||
        !isRowClickable(row.original) ||
        !enableRowKeyboardNavigation ||
        !isEventFromRow(event)
      ) {
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        onClickRow(row);
      }
    };

  function renderHeaderCell(
    header: ReturnType<
      TableInstance<TData>['getHeaderGroups']
    >[number]['headers'][number],
  ) {
    const ariaSort = getAriaSortForColumn(header.column);

    return (
      <TableHead
        key={header.id}
        aria-sort={ariaSort}
        className={cn(
          variantClasses.headerCell,
          header.column.columnDef.meta?.headerClassName,
          hasScrollableBody && 'sticky top-0 z-20',
          hasScrollableBody &&
            (variant === 'simple' ? 'bg-background' : 'bg-muted'),
        )}
      >
        {header.isPlaceholder
          ? null
          : flexRender(header.column.columnDef.header, header.getContext())}
      </TableHead>
    );
  }

  function renderHeaderGroup(
    headerGroup: ReturnType<TableInstance<TData>['getHeaderGroups']>[number],
  ) {
    return (
      <TableRow key={headerGroup.id} className={variantClasses.headerRow}>
        {headerGroup.headers.map(renderHeaderCell)}
      </TableRow>
    );
  }

  function renderRowCell(
    cell: ReturnType<Row<TData>['getVisibleCells']>[number],
    path: string | undefined,
  ) {
    const content = flexRender(cell.column.columnDef.cell, cell.getContext());

    return (
      <TableCell
        key={cell.id}
        className={cn(
          variantClasses.cell,
          cell.column.columnDef.meta?.cellClassName,
        )}
      >
        {path && cell.column.id === linkColumnId ? (
          <Link
            to={path}
            data-row-link
            className="block rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {content}
          </Link>
        ) : (
          content
        )}
      </TableCell>
    );
  }

  function renderRow(row: Row<TData>) {
    const path = getRowPath(row);
    const handlesClick = Boolean(onClickRow) && isRowClickable(row.original);
    const clickable = handlesClick || path !== undefined;
    const keyboardNavigable = handlesClick && enableRowKeyboardNavigation;

    function renderVisibleCell(
      cell: ReturnType<Row<TData>['getVisibleCells']>[number],
    ) {
      return renderRowCell(cell, path);
    }

    return (
      <TableRow
        key={row.id}
        onClick={createRowClickHandler(row)}
        onAuxClick={path ? createRowAuxClickHandler(path) : undefined}
        onMouseDown={path ? handleRowMouseDown : undefined}
        onKeyDown={keyboardNavigable ? createRowKeyDownHandler(row) : undefined}
        role={keyboardNavigable ? 'button' : undefined}
        tabIndex={keyboardNavigable ? 0 : undefined}
        className={cn(
          variantClasses.row,
          clickable
            ? 'cursor-pointer transition-colors hover:bg-muted/50'
            : 'cursor-default',
          getRowClassName?.(row.original),
        )}
      >
        {row.getVisibleCells().map(renderVisibleCell)}
      </TableRow>
    );
  }

  return (
    <div className={cn(bodyScrollable && 'min-h-0 flex-1')}>
      <Table
        className={tableClassName}
        containerClassName={cn(
          // Wide tables scroll sideways on narrow screens; a fading edge
          // says so.
          'edge-fade-x',
          hasScrollableBody && 'overflow-y-auto',
          bodyScrollable && 'h-full',
        )}
      >
        <TableHeader className={variantClasses.header}>
          {table.getHeaderGroups().map(renderHeaderGroup)}
        </TableHeader>
        <TableBody className={variantClasses.body}>
          {table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map(renderRow)
          ) : (
            <TableRow>
              <TableCell
                colSpan={columnsLength}
                className="h-24 px-6 text-center text-muted-foreground"
              >
                {emptyMessage ?? t('Common.noResults')}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
