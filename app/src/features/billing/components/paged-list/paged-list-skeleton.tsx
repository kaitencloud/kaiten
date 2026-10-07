import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type PagedListSkeletonProps = {
  className?: string;
  /** What is being read, which names the busy region for a screen reader. */
  label: string;
  /** How many placeholder rows to draw. */
  rows: number;
  /** The height of a row, to match the rows that will take its place. */
  rowClassName?: string;
};

/**
 * What a list the server pages shows while its first page is on the way: rows to
 * be, and a region that says it is busy. The label is the translated name of what
 * is being read ("Loading invoices").
 */
export function PagedListSkeleton({
  className,
  label,
  rows,
  rowClassName = 'h-14',
}: PagedListSkeletonProps) {
  const keys = Array.from({ length: rows }, (_, index) => `row-${index + 1}`);

  function renderRow(key: string) {
    return <Skeleton className={cn('w-full', rowClassName)} key={key} />;
  }

  return (
    <div
      aria-busy="true"
      aria-label={label}
      className={cn('space-y-2', className)}
      role="status"
    >
      {keys.map(renderRow)}
    </div>
  );
}
