import { Info, TriangleAlert } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { cn } from '@/lib/utils';

/** A titled section of the receipt, named by its heading. */
export function ReceiptSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const id = useId();

  return (
    <section aria-labelledby={id} className="space-y-2">
      <h3 id={id} className="text-sm font-semibold">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** A list of label–value pairs. */
export function ReceiptList({ children }: { children: ReactNode }) {
  return <dl className="space-y-1.5 text-sm">{children}</dl>;
}

/** One label and its value; `total` draws it as a sum, with a rule above. */
export function ReceiptRow({
  label,
  children,
  note,
  total = false,
  mono = false,
}: {
  label: ReactNode;
  children: ReactNode;
  note?: ReactNode;
  total?: boolean;
  mono?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4',
        total && 'border-t pt-1.5 font-semibold',
      )}
    >
      <dt
        className={cn(
          !total && 'text-muted-foreground',
          mono && 'font-mono text-xs',
        )}
      >
        {label}
      </dt>
      <dd className="min-w-0 text-right tabular-nums">
        <span className={cn('break-words', mono && 'font-mono text-xs')}>
          {children}
        </span>
        {note ? (
          <span className="block text-xs font-normal text-muted-foreground">
            {note}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

/** A boxed sentence: information, a warning or a refusal. */
export function ReceiptCallout({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning' | 'destructive';
  children: ReactNode;
}) {
  const Icon = tone === 'info' ? Info : TriangleAlert;

  return (
    <div
      className={cn(
        'flex gap-2 rounded-lg p-3 text-sm',
        tone === 'info' && 'border bg-muted/50',
        tone === 'warning' &&
          'bg-warning-subtle text-warning-subtle-foreground',
        tone === 'destructive' &&
          'bg-destructive-subtle text-destructive-subtle-foreground',
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
}
