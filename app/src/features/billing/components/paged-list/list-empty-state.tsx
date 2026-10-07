import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ListEmptyStateProps = {
  /** An action, or the command to run: what the person does next. */
  children?: ReactNode;
  className?: string;
  description: string;
  /** The icon of the entity the list is about, from `dataModelIcons`. */
  icon?: LucideIcon;
  testId: string;
  title: string;
};

/**
 * What a list says when it has no row: a dashed frame with what is missing, why,
 * and, under them, what to do about it. It is as tall as its message, so it never
 * stretches to fill the page.
 */
export function ListEmptyState({
  children,
  className,
  description,
  icon: Icon,
  testId,
  title,
}: ListEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-16 text-center',
        className,
      )}
      data-testid={testId}
    >
      {Icon ? (
        <Icon aria-hidden className="size-8 text-muted-foreground/40" />
      ) : null}
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}
