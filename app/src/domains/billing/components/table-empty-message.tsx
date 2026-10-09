import type { ReactNode } from 'react';

type TableEmptyMessageProps = {
  /** An action, or the command to run: what the person does next. */
  children?: ReactNode;
  description: string;
  testId: string;
  title: string;
};

/**
 * What a table says in its own cell when it has no row, for a list that has more
 * to say than "no results": what is missing, why, and what to do about it. The
 * lists of invoices, of the handoff queue and of the vouchers draw theirs with it,
 * so that they read alike.
 */
export function TableEmptyMessage({
  children,
  description,
  testId,
  title,
}: TableEmptyMessageProps) {
  return (
    <div className="flex flex-col items-center gap-2 py-6" data-testid={testId}>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-md text-sm">{description}</p>
      {children}
    </div>
  );
}
