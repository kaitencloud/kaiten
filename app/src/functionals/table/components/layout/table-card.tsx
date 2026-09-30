import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { RowData } from '@tanstack/react-table';
import type { PropsWithChildren } from 'react';
import { cn } from '@/lib/utils';
import type { ColumnDef, Row } from '../../types/data-table.types';
import type { DataTablePaginationProp } from '../../types/data-table.types';
import { DataTable } from '../core/data-table';

type TableCardRootProps = PropsWithChildren<{
  className?: string;
}>;

const Root = ({ className, children }: TableCardRootProps) => (
  <Card className={cn('gap-2', className)}>{children}</Card>
);

type TableCardHeaderProps = PropsWithChildren<{
  className?: string;
}>;

// Heading and actions side by side from `sm`; below, stacked, so a
// description never wraps into a four-line column beside a button.
const Header = ({ className, children }: TableCardHeaderProps) => (
  <CardHeader
    className={cn(
      'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between',
      className,
    )}
  >
    {children}
  </CardHeader>
);

type TableCardHeaderLeadingProps = PropsWithChildren<{
  className?: string;
}>;

const HeaderLeading = ({
  className,
  children,
}: TableCardHeaderLeadingProps) => (
  <div className={cn('flex min-w-0 flex-1 items-start gap-2', className)}>
    {children}
  </div>
);

type TableCardHeaderIconProps = PropsWithChildren<{
  className?: string;
}>;

const HeaderIcon = ({ className, children }: TableCardHeaderIconProps) => (
  <div
    className={cn(
      'mt-0.5 shrink-0 text-primary-subtle-foreground [&>svg]:size-5',
      className,
    )}
  >
    {children}
  </div>
);

type TableCardHeaderHeadingProps = PropsWithChildren<{
  className?: string;
}>;

const HeaderHeading = ({
  className,
  children,
}: TableCardHeaderHeadingProps) => (
  <div className={cn('min-w-0', className)}>{children}</div>
);

type TableCardHeaderTitleProps = PropsWithChildren<{
  className?: string;
}>;

const HeaderTitle = ({ className, children }: TableCardHeaderTitleProps) => (
  <CardTitle className={className}>{children}</CardTitle>
);

type TableCardHeaderSubtitleProps = PropsWithChildren<{
  className?: string;
}>;

const HeaderSubtitle = ({
  className,
  children,
}: TableCardHeaderSubtitleProps) => (
  <CardDescription className={className}>{children}</CardDescription>
);

type TableCardHeaderActionsProps = PropsWithChildren<{
  className?: string;
}>;

const HeaderActions = ({
  className,
  children,
}: TableCardHeaderActionsProps) => (
  <div
    className={cn('flex shrink-0 items-center justify-end gap-2', className)}
  >
    {children}
  </div>
);

type TableCardToolbarProps = PropsWithChildren<{
  className?: string;
}>;

const Toolbar = ({ className, children }: TableCardToolbarProps) => (
  <div
    className={cn(
      'flex flex-col gap-3 px-6 pb-4 md:flex-row md:items-center',
      className,
    )}
  >
    {children}
  </div>
);

type TableCardContentProps = PropsWithChildren<{
  className?: string;
}>;

const Content = ({ className, children }: TableCardContentProps) => (
  <CardContent className={cn('p-0', className)}>{children}</CardContent>
);

type TableCardTableProps<TData extends RowData> = {
  columns: ColumnDef<TData>[];
  contentClassName?: string;
  data: TData[];
  emptyMessage?: string;
  getPath?: (row: TData) => string | undefined;
  getRowClassName?: (row: TData) => string | undefined;
  isRowClickable?: (row: TData) => boolean;
  linkColumnId?: string;
  onClickRow?: (row: Row<TData>) => void;
  pagination?: DataTablePaginationProp;
  tableClassName?: string;
  variant?: 'default' | 'simple';
};

function Table<TData extends RowData>({
  columns,
  contentClassName,
  data,
  emptyMessage,
  getPath,
  getRowClassName,
  isRowClickable,
  linkColumnId,
  onClickRow,
  pagination,
  tableClassName,
  variant = 'default',
}: TableCardTableProps<TData>) {
  return (
    <Content className={contentClassName}>
      <DataTable
        columns={columns}
        data={data}
        variant={variant}
        emptyMessage={emptyMessage}
        getPath={getPath}
        getRowClassName={getRowClassName}
        isRowClickable={isRowClickable}
        linkColumnId={linkColumnId}
        onClickRow={onClickRow}
        pagination={pagination}
        tableClassName={tableClassName}
      />
    </Content>
  );
}

export const TableCard = Object.assign(Root, {
  Header,
  HeaderLeading,
  HeaderIcon,
  HeaderHeading,
  HeaderTitle,
  HeaderSubtitle,
  HeaderActions,
  Toolbar,
  Content,
  Table,
});
