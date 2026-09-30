import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface DialogFormSkeletonProps {
  /** Number of field placeholders to render (match the form's field count). */
  fields?: number;
  className?: string;
}

/**
 * Field-shaped placeholder shown while a dialog's lazy-loaded form streams in.
 * Each row mimics a label + input so the skeleton matches the form about to
 * appear (sized via `fields` — see each step for stacked forms).
 */
export function DialogFormSkeleton({
  fields = 3,
  className,
}: DialogFormSkeletonProps) {
  const { t } = useTranslation();

  return (
    <output
      aria-live="polite"
      aria-busy="true"
      className={cn('block space-y-6', className)}
    >
      <span className="sr-only">{t('Common.loading')}</span>
      {Array.from({ length: fields }, (_, index) => (
        <div key={`dialog-skeleton-field-${index + 1}`} className="space-y-2">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </output>
  );
}

/**
 * Card-shaped placeholder for the stacked dialog stage. A stepped form loads its
 * data (`useSuspenseQuery`) before any step card renders, so the transparent
 * stage shows a card placeholder. Only the fields are skeletons — the title is
 * known up front (real text), and the footer (step actions, not lazy) renders
 * with the real card once data resolves.
 */
export function DialogFormSkeletonCard({
  fields = 3,
  title,
}: {
  fields?: number;
  title?: string;
}) {
  return (
    <div className="mx-auto flex w-full flex-col overflow-hidden rounded-lg border bg-background shadow-lg">
      <div className="border-b bg-muted/50 px-6 py-4">
        {title ? (
          <div className="text-lg leading-none font-semibold">{title}</div>
        ) : (
          <Skeleton className="h-5 w-40" />
        )}
      </div>
      <DialogFormSkeleton fields={fields} className="px-6 py-4" />
    </div>
  );
}
